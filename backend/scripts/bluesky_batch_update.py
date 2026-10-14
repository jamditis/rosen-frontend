#!/usr/bin/env python3
"""Prepare one deterministic Bluesky source batch for the Rosen archive.

The adapter uses the fail-closed cursor walk in ``bluesky_feed_backfill``. It
derives an overlapping source window from the newest canonical Bluesky row,
captures the public API payload outside canonical data, makes conservative
admission decisions, and appends complete rows without rewriting existing CSV
bytes. It does not export, commit, deploy, or publish the archive.
"""

from __future__ import annotations

import argparse
import csv
import datetime
import hashlib
import io
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.robotparser
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Callable, Iterable

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import bluesky_feed_backfill as backfill  # noqa: E402
from auto_categorize_records import RecordCategorizer  # noqa: E402


DEFAULT_OVERLAP = datetime.timedelta(days=1)
PUBLIC_API_ORIGIN = "https://public.api.bsky.app"
ROBOTS_URL = f"{PUBLIC_API_ORIGIN}/robots.txt"
ROBOTS_USER_AGENT = "RosenArchive-BlueskyBatch"
CONTEXT_ENDPOINT = f"{backfill.API_BASE}/app.bsky.feed.getPosts"
CONTEXT_BATCH_LIMIT = 25
MAX_REQUEST_ATTEMPTS = 4
MAX_RETRY_DELAY_SECONDS = 30.0
TRANSIENT_HTTP_STATUSES = {429, 500, 502, 503, 504}
ALLOWED_GET_ENDPOINTS = {
    ROBOTS_URL,
    backfill.FEED_ENDPOINT,
    CONTEXT_ENDPOINT,
}
REQUEST_HEADERS = {"User-Agent": f"{ROBOTS_USER_AGENT}/1.0"}
CONTEXT_ONLY_NOTE = (
    "Standalone archive admission not verified; source identity and text were "
    "confirmed, but this item remains context only."
)

URL_DISPLAY_RE = re.compile(
    r"(?:https?://|www\.)\S+|\b(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:/\S*)?",
    re.IGNORECASE,
)
WORD_RE = re.compile(r"[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)?")
BRIEF_ACK_RE = re.compile(
    r"^(?:thanks?|thank you|agreed|exactly|indeed|nice|great|gotcha|me too|"
    r"same here|you were right|i agree|i have to agree|sounds good|"
    r"good to meet you|yes(?:\W+yes)*|no|sure)\b",
    re.IGNORECASE,
)
QUOTE_TYPES = {
    "app.bsky.embed.record",
    "app.bsky.embed.recordWithMedia",
}


class BatchPreparationError(RuntimeError):
    """Raised before canonical data is changed when a batch is not trustworthy."""


@dataclass(frozen=True)
class BatchRunResult:
    report: dict
    snapshot_dir: Path | None


def _utc_iso(value: datetime.datetime) -> str:
    return value.astimezone(datetime.timezone.utc).isoformat(timespec="seconds")


def _parse_canonical_time(value: str) -> datetime.datetime:
    normalized = value.strip().replace("Z", "+00:00")
    legacy = re.fullmatch(
        r"(\d{4}-\d{2}-\d{2})[ T](\d{1,2})(:\d{2}:\d{2})([+-]\d{2}:\d{2})?",
        normalized,
    )
    if legacy:
        date, hour, clock, offset = legacy.groups()
        normalized = f"{date}T{int(hour):02d}{clock}{offset or ''}"
    try:
        parsed = datetime.datetime.fromisoformat(normalized)
    except (AttributeError, ValueError) as exc:
        raise BatchPreparationError(
            f"Canonical Bluesky publication date is malformed: {value!r}"
        ) from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed.astimezone(datetime.timezone.utc)


def derive_input_cutoff(
    csv_path: Path,
    overlap: datetime.timedelta = DEFAULT_OVERLAP,
) -> datetime.datetime:
    """Return the newest canonical Bluesky time minus a bounded overlap."""
    if overlap < datetime.timedelta(0):
        raise ValueError("overlap must not be negative")

    newest: datetime.datetime | None = None
    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != backfill.SCHEMA_FIELDS:
            raise BatchPreparationError("Canonical social CSV schema does not match")
        for row in reader:
            record_id = (row.get("id") or "").strip()
            url = (row.get("url") or "").strip()
            if not record_id.startswith("BSKY-"):
                continue
            match = backfill.BSKY_POST_URL_RE.fullmatch(url)
            if not match:
                continue
            profile, _rkey = match.groups()
            if profile.lower() not in {
                backfill.ACTOR.lower(),
                backfill.ACTOR_DID.lower(),
            }:
                continue
            published = _parse_canonical_time(row.get("publication_date") or "")
            if newest is None or published > newest:
                newest = published

    if newest is None:
        raise BatchPreparationError(
            "Cannot derive a cutoff because no canonical Bluesky row exists"
        )
    return newest - overlap


def _retry_delay(response: object | None, attempt: int) -> float:
    headers = getattr(response, "headers", {}) if response is not None else {}
    retry_after = headers.get("Retry-After") if hasattr(headers, "get") else None
    if retry_after:
        try:
            delay = float(retry_after)
        except (TypeError, ValueError):
            try:
                retry_time = parsedate_to_datetime(str(retry_after))
                if retry_time.tzinfo is None:
                    raise ValueError("Retry-After date has no timezone")
                now = datetime.datetime.now(datetime.timezone.utc)
                delay = (
                    retry_time.astimezone(datetime.timezone.utc) - now
                ).total_seconds()
            except (TypeError, ValueError, OverflowError):
                delay = 2 ** (attempt - 1)
    else:
        delay = 2 ** (attempt - 1)
    return min(MAX_RETRY_DELAY_SECONDS, max(0.0, delay))


def _get_with_retry(
    url: str,
    *,
    params: object | None = None,
    request_fn: Callable[..., object] = requests.get,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> object:
    if url not in ALLOWED_GET_ENDPOINTS:
        raise BatchPreparationError(f"Public API endpoint is not allowed: {url}")

    for attempt in range(1, MAX_REQUEST_ATTEMPTS + 1):
        try:
            response = request_fn(
                url,
                params=params,
                headers=REQUEST_HEADERS,
                timeout=30,
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            if attempt == MAX_REQUEST_ATTEMPTS:
                raise BatchPreparationError(
                    f"Public API GET failed after {attempt} attempts: {url}"
                ) from exc
            sleep_fn(_retry_delay(None, attempt))
            continue

        status = getattr(response, "status_code", None)
        if not isinstance(status, int):
            raise BatchPreparationError(f"Public API returned no HTTP status: {url}")
        if status in {401, 403}:
            raise BatchPreparationError(
                f"Public API denied the fixed GET endpoint with HTTP {status}: {url}"
            )
        if status in TRANSIENT_HTTP_STATUSES:
            if attempt == MAX_REQUEST_ATTEMPTS:
                raise BatchPreparationError(
                    f"Public API GET failed with HTTP {status} after {attempt} attempts: {url}"
                )
            sleep_fn(_retry_delay(response, attempt))
            continue
        if status != 200:
            raise BatchPreparationError(
                f"Public API GET failed with HTTP {status}: {url}"
            )
        return response

    raise AssertionError("bounded retry loop did not return or raise")


def _get_json_with_retry(
    url: str,
    *,
    params: object | None = None,
    request_fn: Callable[..., object] = requests.get,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> dict:
    response = _get_with_retry(
        url,
        params=params,
        request_fn=request_fn,
        sleep_fn=sleep_fn,
    )
    try:
        payload = response.json()
    except (TypeError, ValueError) as exc:
        raise BatchPreparationError(
            f"Public API returned invalid JSON from {url}"
        ) from exc
    if not isinstance(payload, dict):
        raise BatchPreparationError(f"Public API returned a non-object from {url}")
    return payload


def _robots_groups(lines: list[str]) -> list[list[str]]:
    groups: list[list[str]] = []
    agents: list[str] = []
    has_rules = False

    def finish_group() -> None:
        nonlocal agents, has_rules
        if agents:
            groups.append(agents)
        agents = []
        has_rules = False

    for raw_line in lines:
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            if has_rules:
                finish_group()
            continue
        if ":" not in line:
            raise BatchPreparationError("Public API robots policy is malformed")
        field, value = (part.strip() for part in line.split(":", 1))
        if not field:
            raise BatchPreparationError("Public API robots policy is malformed")
        field = field.lower()
        if field == "user-agent":
            if not value:
                raise BatchPreparationError(
                    "Public API robots policy has an empty user-agent"
                )
            if has_rules:
                finish_group()
            agents.append(value.lower())
        elif field in {"allow", "disallow"}:
            if not agents:
                raise BatchPreparationError(
                    "Public API robots policy has a rule without a user-agent"
                )
            has_rules = True
    finish_group()
    return groups


def check_public_api_policy(
    *,
    request_fn: Callable[..., object] = requests.get,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> None:
    """Fail closed unless robots.txt permits both fixed public API GETs."""
    response = _get_with_retry(
        ROBOTS_URL,
        request_fn=request_fn,
        sleep_fn=sleep_fn,
    )
    text = getattr(response, "text", None)
    if not isinstance(text, str) or not text.strip():
        raise BatchPreparationError("Public API robots policy is empty or invalid")
    lines = text.splitlines()
    groups = _robots_groups(lines)
    product = ROBOTS_USER_AGENT.lower()
    if not any(
        agent == "*" or agent in product for agents in groups for agent in agents
    ):
        raise BatchPreparationError(
            "Public API robots policy has no applicable user-agent group"
        )

    parser = urllib.robotparser.RobotFileParser()
    parser.set_url(ROBOTS_URL)
    parser.parse(lines)
    for endpoint in (backfill.FEED_ENDPOINT, CONTEXT_ENDPOINT):
        if not parser.can_fetch(ROBOTS_USER_AGENT, endpoint):
            raise BatchPreparationError(
                f"Public API robots policy disallows the fixed GET endpoint: {endpoint}"
            )


def fetch_feed_page(
    cursor: str | None,
    *,
    request_fn: Callable[..., object] = requests.get,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> dict:
    params = {
        "actor": backfill.ACTOR_DID,
        "filter": "posts_with_replies",
        "limit": backfill.PAGE_LIMIT,
    }
    if cursor:
        params["cursor"] = cursor
    return _get_json_with_retry(
        backfill.FEED_ENDPOINT,
        params=params,
        request_fn=request_fn,
        sleep_fn=sleep_fn,
    )


def fetch_context_posts(
    uris: list[str],
    *,
    request_fn: Callable[..., object] = requests.get,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> dict:
    """Fetch at most 25 fixed public AT Protocol post URIs."""
    if not uris or len(uris) > CONTEXT_BATCH_LIMIT:
        raise ValueError("context request must contain 1 through 25 URIs")
    for uri in uris:
        if not backfill.AT_POST_URI_RE.fullmatch(uri):
            raise ValueError(f"invalid context URI: {uri!r}")

    return _get_json_with_retry(
        CONTEXT_ENDPOINT,
        params=[("uris", uri) for uri in uris],
        request_fn=request_fn,
        sleep_fn=sleep_fn,
    )


def _capturing_fetcher(
    fetch_page_fn: Callable[[str | None], dict],
    pages: list[dict],
) -> Callable[[str | None], dict]:
    def fetch(cursor: str | None) -> dict:
        page = fetch_page_fn(cursor)
        pages.append({"requested_cursor": cursor, "response": page})
        return page

    return fetch


def _source_record_hash(record: dict) -> str:
    encoded = json.dumps(
        record,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _validated_observations(pages: list[dict]) -> tuple[list[dict], dict[str, dict]]:
    observations: list[dict] = []
    item_by_url: dict[str, dict] = {}

    for page_number, captured_page in enumerate(pages, start=1):
        response = captured_page.get("response")
        if not isinstance(response, dict) or not isinstance(response.get("feed"), list):
            raise BatchPreparationError(
                f"Captured page {page_number} is not a valid feed response"
            )
        for item_number, item in enumerate(response["feed"]):
            try:
                post, uri_did, rkey = backfill._post_identity(item)
                _record, created_at, _parent_uri = backfill._post_record(item, post)
            except backfill.FeedValidationError as exc:
                raise BatchPreparationError(
                    f"Captured page {page_number} item {item_number}: {exc}"
                ) from exc
            cid = post.get("cid")
            if not isinstance(cid, str) or not cid.strip():
                raise BatchPreparationError(
                    f"Captured page {page_number} item {item_number} has no source CID"
                )
            uri = post["uri"]
            public_url = f"https://bsky.app/profile/{backfill.ACTOR}/post/{rkey}"
            observations.append(
                {
                    "uri": uri,
                    "cid": cid,
                    "created_at": _utc_iso(created_at),
                    "author_did": uri_did,
                    "page": page_number,
                    "item": item_number,
                }
            )
            if uri_did == backfill.ACTOR_DID and public_url not in item_by_url:
                item_by_url[public_url] = item

    return observations, item_by_url


def _quote_uri(record: dict) -> str:
    embed = record.get("embed")
    if not isinstance(embed, dict) or embed.get("$type") not in QUOTE_TYPES:
        return ""
    reference = embed.get("record")
    if embed.get("$type") == "app.bsky.embed.recordWithMedia":
        if not isinstance(reference, dict):
            return ""
        reference = reference.get("record")
    if not isinstance(reference, dict):
        return ""
    uri = reference.get("uri")
    return uri if isinstance(uri, str) else ""


def _post_type_and_context(item: dict) -> tuple[str, list[str]]:
    record = item["post"]["record"]
    context_uris: list[str] = []
    reply = record.get("reply")
    if isinstance(reply, dict):
        for name in ("parent", "root"):
            reference = reply.get(name)
            if isinstance(reference, dict) and isinstance(reference.get("uri"), str):
                if reference["uri"] not in context_uris:
                    context_uris.append(reference["uri"])
        quote_uri = _quote_uri(record)
        if quote_uri and quote_uri not in context_uris:
            context_uris.append(quote_uri)
        return "reply", context_uris

    quote_uri = _quote_uri(record)
    if quote_uri:
        return "quote", [quote_uri]
    return "original", []


def _display_text(text: str) -> str:
    without_urls = URL_DISPLAY_RE.sub("", text or "")
    without_mentions = re.sub(r"(?<!\w)@[A-Za-z0-9._:-]+", "", without_urls)
    return re.sub(r"\s+", " ", without_mentions).strip(' \t\r\n-:;,."')


def _meaningful_text(text: str, post_type: str) -> bool:
    display = _display_text(text)
    words = WORD_RE.findall(display)
    letters = sum(character.isalpha() for character in display)
    if BRIEF_ACK_RE.match(display) and len(words) <= 12:
        return False
    if post_type == "original":
        return len(words) >= 8 and letters >= 40
    return len(words) >= 12 and letters >= 60


def _short_source_text(text: str, limit: int = 320) -> str:
    display = _display_text(text)
    if len(display) <= limit:
        return display
    shortened = display[: limit + 1].rsplit(" ", 1)[0].rstrip(" ,;:")
    return shortened + "..."


def _context_handle(context_by_uri: dict[str, dict], uri: str) -> str:
    post = context_by_uri.get(uri) or {}
    author = post.get("author") or {}
    handle = author.get("handle")
    return handle if isinstance(handle, str) and handle else "another Bluesky user"


def _summary_for(
    *,
    text: str,
    post_type: str,
    context_uris: list[str],
    context_by_uri: dict[str, dict],
) -> str:
    source_text = _short_source_text(text)
    if post_type == "reply":
        handle = _context_handle(context_by_uri, context_uris[0])
        subject = f"@{handle}" if handle != "another Bluesky user" else handle
        return f'Replying to {subject} on Bluesky, Rosen writes: "{source_text}"'
    if post_type == "quote":
        handle = _context_handle(context_by_uri, context_uris[0])
        subject = f"@{handle}" if handle != "another Bluesky user" else handle
        return (
            f'Commenting on a Bluesky post by {subject}, Rosen writes: "{source_text}"'
        )
    return f'Rosen writes on Bluesky: "{source_text}"'


def _validate_context_response(payload: dict, requested: set[str]) -> list[dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get("posts"), list):
        raise BatchPreparationError("Public context response has no valid posts list")

    posts: list[dict] = []
    for index, post in enumerate(payload["posts"]):
        if not isinstance(post, dict):
            raise BatchPreparationError(f"Context post {index} is not an object")
        uri = post.get("uri")
        cid = post.get("cid")
        author = post.get("author")
        record = post.get("record")
        if not isinstance(uri, str) or not backfill.AT_POST_URI_RE.fullmatch(uri):
            raise BatchPreparationError(f"Context post {index} has an invalid URI")
        if uri not in requested:
            raise BatchPreparationError(
                f"Context response returned unrequested URI: {uri}"
            )
        if not isinstance(cid, str) or not cid:
            raise BatchPreparationError(f"Context post {index} has no CID")
        if not isinstance(author, dict) or not isinstance(author.get("did"), str):
            raise BatchPreparationError(f"Context post {index} has no author DID")
        uri_did = backfill.AT_POST_URI_RE.fullmatch(uri).group(1)
        if author["did"] != uri_did:
            raise BatchPreparationError(
                f"Context post {index} author DID does not match its URI"
            )
        if not isinstance(record, dict) or not isinstance(record.get("text"), str):
            raise BatchPreparationError(f"Context post {index} has no source text")
        created_at = record.get("createdAt")
        if not isinstance(created_at, str) or not created_at:
            raise BatchPreparationError(f"Context post {index} has no createdAt")
        try:
            parsed_created_at = datetime.datetime.fromisoformat(
                created_at.replace("Z", "+00:00")
            )
        except ValueError as exc:
            raise BatchPreparationError(
                f"Context post {index} has a malformed createdAt"
            ) from exc
        if parsed_created_at.tzinfo is None:
            raise BatchPreparationError(
                f"Context post {index} createdAt has no timezone"
            )
        posts.append(post)
    return posts


def _fetch_context_batches(
    uris: Iterable[str],
    fetch_context_fn: Callable[[list[str]], dict],
) -> tuple[dict[str, dict], list[dict]]:
    ordered = list(dict.fromkeys(uris))
    context_by_uri: dict[str, dict] = {}
    snapshots: list[dict] = []
    for start in range(0, len(ordered), CONTEXT_BATCH_LIMIT):
        requested = ordered[start : start + CONTEXT_BATCH_LIMIT]
        try:
            payload = fetch_context_fn(requested)
        except Exception as exc:
            raise BatchPreparationError(
                f"Public context fetch failed for {requested[0]}: {exc}"
            ) from exc
        posts = _validate_context_response(payload, set(requested))
        snapshots.append({"requested_uris": requested, "response": payload})
        for post in posts:
            uri = post["uri"]
            if uri in context_by_uri and context_by_uri[uri] != post:
                raise BatchPreparationError(
                    f"Public context response changed within the batch: {uri}"
                )
            context_by_uri[uri] = post
    return context_by_uri, snapshots


def _categorize(row: dict) -> list[str]:
    categorizer = RecordCategorizer(confidence_threshold=0.6)
    categories, _confidence, _reason = categorizer.categorize_record(row)
    return categories


def _decision_rows(
    source_rows: list[dict],
    item_by_url: dict[str, dict],
    context_by_uri: dict[str, dict],
    captured_at: datetime.datetime,
) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    decisions: list[dict] = []
    capture_label = captured_at.astimezone(datetime.timezone.utc).strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    for source_row in source_rows:
        item = item_by_url.get(source_row["url"])
        if item is None:
            raise BatchPreparationError(
                f"Collected row has no captured source item: {source_row['url']}"
            )
        post = item["post"]
        record = post["record"]
        uri = post["uri"]
        cid = post["cid"]
        post_type, context_uris = _post_type_and_context(item)
        text = record["text"].strip()
        record_hash = _source_record_hash(record)
        meaningful = _meaningful_text(text, post_type)

        reason = "brief_or_context_dependent_text"
        admitted = False
        title = backfill.derive_title(_display_text(text))
        summary = ""
        categories: list[str] = []

        if meaningful and any(uri not in context_by_uri for uri in context_uris):
            reason = "required_public_context_unavailable"
        elif meaningful:
            summary = _summary_for(
                text=text,
                post_type=post_type,
                context_uris=context_uris,
                context_by_uri=context_by_uri,
            )
            category_input = dict(source_row)
            display_text = _display_text(text)
            category_input.update(
                {
                    "title": title,
                    "summary": summary,
                    "excerpt": display_text,
                    "raw_text": display_text,
                    "pull_quote": display_text,
                }
            )
            categories = _categorize(category_input)
            if categories:
                admitted = True
                reason = "deterministic_text_and_taxonomy"
            else:
                reason = "taxonomy_unresolved"

        row = dict(source_row)
        context_note = ""
        if context_uris:
            context_note = " Context references: " + "; ".join(context_uris) + "."
        evidence = (
            f"Public source evidence: uri={uri}; cid={cid}; "
            f"record_sha256={record_hash}."
        )
        if admitted:
            row.update(
                {
                    "title": title,
                    "summary": summary,
                    "thematic_categories": ";".join(categories),
                    "verified": "TRUE",
                    "notes": (
                        f"Bluesky autonomous batch {capture_label}; decision: admit. "
                        f"{evidence}{context_note} Deterministic source text and "
                        "the archive taxonomy support standalone admission."
                    ),
                }
            )
            decision = "admit"
        else:
            row.update(
                {
                    "summary": "",
                    "thematic_categories": "",
                    "verified": "FALSE",
                    "notes": (
                        f"Bluesky autonomous batch {capture_label}; decision: "
                        f"context_only; reason={reason}. {evidence}{context_note} "
                        f"{CONTEXT_ONLY_NOTE}"
                    ),
                }
            )
            decision = "context_only"

        rows.append(row)
        decisions.append(
            {
                "record_id": row["id"],
                "uri": uri,
                "cid": cid,
                "url": row["url"],
                "publication_date": row["publication_date"],
                "post_type": post_type,
                "decision": decision,
                "reason": reason,
                "source_record_sha256": record_hash,
                "context_uris": context_uris,
                "title": row["title"],
                "summary": row["summary"],
                "categories": categories if admitted else [],
                "captured_at": _utc_iso(captured_at),
            }
        )

    return rows, decisions


def _render_appended_rows(rows: list[dict]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(
        stream,
        fieldnames=backfill.SCHEMA_FIELDS,
        extrasaction="raise",
        quoting=csv.QUOTE_MINIMAL,
        lineterminator="\r\n",
    )
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8")


def _successor_bytes(existing: bytes, rows: list[dict]) -> bytes:
    if not rows:
        return existing
    separator = b"" if existing.endswith((b"\n", b"\r")) else b"\n"
    return existing + separator + _render_appended_rows(rows)


def _replace_if_unchanged(path: Path, before: bytes, successor: bytes) -> None:
    if successor == before:
        return
    if path.read_bytes() != before:
        raise BatchPreparationError(
            "Canonical social CSV changed during batch preparation; retry from the new head"
        )

    descriptor, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp_path = Path(temp_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(successor)
            handle.flush()
            os.fsync(handle.fileno())
        shutil.copymode(path, temp_path)
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def _write_snapshot(
    *,
    snapshot_dir: Path,
    pages: list[dict],
    context_snapshots: list[dict],
) -> Path:
    if snapshot_dir.exists():
        raise BatchPreparationError(
            f"Snapshot destination already exists: {snapshot_dir}"
        )
    snapshot_dir.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix=".bluesky-batch-", dir=snapshot_dir.parent))
    try:
        payloads = {
            "feed-pages.json": {
                "endpoint": backfill.FEED_ENDPOINT,
                "pages": pages,
            },
            "context-posts.json": {
                "endpoint": CONTEXT_ENDPOINT,
                "requests": context_snapshots,
            },
        }
        for name, payload in payloads.items():
            (temp_dir / name).write_text(
                json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
                + "\n",
                encoding="utf-8",
            )
        os.replace(temp_dir, snapshot_dir)
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
    return snapshot_dir


def _write_report(report_path: Path, report: dict) -> None:
    if report_path.exists():
        raise BatchPreparationError(f"Report destination already exists: {report_path}")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(
        prefix=f".{report_path.name}.", dir=report_path.parent
    )
    temp_path = Path(temp_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, report_path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def _require_noncanonical_output(path: Path, label: str) -> None:
    data_dir = (REPO_ROOT / "data").resolve()
    resolved = path.resolve()
    if resolved == data_dir or data_dir in resolved.parents:
        raise BatchPreparationError(f"{label} must be outside canonical data: {path}")


def _require_runner_temp_output(path: Path, label: str) -> None:
    runner_temp = os.environ.get("RUNNER_TEMP")
    if not runner_temp:
        return
    runner_root = Path(runner_temp).resolve()
    resolved = path.resolve()
    if resolved != runner_root and runner_root not in resolved.parents:
        raise BatchPreparationError(f"{label} must be under RUNNER_TEMP: {path}")


def run_batch(
    *,
    csv_path: Path = backfill.SOCIAL_POSTS_CSV,
    snapshot_dir: Path,
    report_path: Path,
    captured_at: datetime.datetime | None = None,
    overlap: datetime.timedelta = DEFAULT_OVERLAP,
    max_pages: int = backfill.DEFAULT_MAX_PAGES,
    fetch_page_fn: Callable[[str | None], dict] = fetch_feed_page,
    fetch_context_fn: Callable[[list[str]], dict] = fetch_context_posts,
    policy_check_fn: Callable[[], None] = check_public_api_policy,
    sleep_fn: Callable[[float], None] = backfill.time.sleep,
    write: bool = True,
) -> BatchRunResult:
    """Collect, classify, snapshot, and optionally append one source batch."""
    captured_at = captured_at or datetime.datetime.now(datetime.timezone.utc)
    if captured_at.tzinfo is None:
        raise ValueError("captured_at must include a timezone")
    if max_pages < 1:
        raise ValueError("max_pages must be at least 1")
    _require_noncanonical_output(snapshot_dir, "snapshot directory")
    _require_noncanonical_output(report_path, "report")
    _require_runner_temp_output(snapshot_dir, "snapshot directory")
    _require_runner_temp_output(report_path, "report")

    canonical_before = csv_path.read_bytes()
    cutoff = derive_input_cutoff(csv_path, overlap)
    existing_urls, max_id = backfill.load_existing_urls(csv_path)
    policy_check_fn()
    pages: list[dict] = []
    today = captured_at.astimezone(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    collection = backfill.collect_new_rows(
        existing_urls=existing_urls,
        max_id=max_id,
        since=cutoff,
        today=today,
        fetch_page_fn=_capturing_fetcher(fetch_page_fn, pages),
        sleep_fn=sleep_fn,
        max_pages=max_pages,
    )
    if not collection.complete:
        raise BatchPreparationError(
            f"Incomplete feed walk: {collection.failure_reason}. No rows written."
        )

    observations, item_by_url = _validated_observations(pages)
    preliminary_context: list[str] = []
    for row in collection.rows:
        item = item_by_url.get(row["url"])
        if item is None:
            raise BatchPreparationError(
                f"Collected row has no captured source item: {row['url']}"
            )
        post_type, context_uris = _post_type_and_context(item)
        if _meaningful_text(item["post"]["record"]["text"], post_type):
            preliminary_context.extend(context_uris)

    context_by_uri, context_snapshots = _fetch_context_batches(
        preliminary_context,
        fetch_context_fn,
    )
    prepared_rows, decisions = _decision_rows(
        collection.rows,
        item_by_url,
        context_by_uri,
        captured_at,
    )

    admitted = sum(item["decision"] == "admit" for item in decisions)
    context_only = len(decisions) - admitted
    jay_source_times = [
        observation["created_at"]
        for observation in observations
        if observation["author_did"] == backfill.ACTOR_DID
    ]
    newest_source_time = max(jay_source_times) if jay_source_times else None
    successor = _successor_bytes(canonical_before, prepared_rows)
    report = {
        "schema_version": 1,
        "captured_at": _utc_iso(captured_at),
        "input_cutoff": _utc_iso(cutoff),
        "overlap_seconds": int(overlap.total_seconds()),
        "actor_did": backfill.ACTOR_DID,
        "robots_url": ROBOTS_URL,
        "feed_endpoint": backfill.FEED_ENDPOINT,
        "context_endpoint": CONTEXT_ENDPOINT,
        "complete": True,
        "pages": collection.pages,
        "items_examined": collection.seen,
        "newest_source_time": newest_source_time,
        "counts": {
            "captured": len(decisions),
            "admitted": admitted,
            "context_only": context_only,
        },
        "collector": {
            "skipped_existing": collection.skipped_existing,
            "skipped_duplicate_in_run": collection.skipped_dupe_in_run,
            "skipped_repost": collection.skipped_repost,
            "skipped_wrong_author": collection.skipped_wrong_author,
            "skipped_before_cutoff": collection.skipped_before_since,
        },
        "canonical": {
            "path": str(csv_path),
            "sha256_before": hashlib.sha256(canonical_before).hexdigest(),
            "sha256_after": hashlib.sha256(successor).hexdigest(),
            "rows_appended": len(prepared_rows),
        },
        "observed_sources": observations,
        "decisions": decisions,
    }

    snapshot_dir = _write_snapshot(
        snapshot_dir=snapshot_dir,
        pages=pages,
        context_snapshots=context_snapshots,
    )
    report_written = False
    try:
        _write_report(report_path, report)
        report_written = True
        if write:
            _replace_if_unchanged(csv_path, canonical_before, successor)
    except Exception:
        shutil.rmtree(snapshot_dir)
        if report_written and report_path.exists():
            report_path.unlink()
        raise

    return BatchRunResult(report=report, snapshot_dir=snapshot_dir)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare and append a bounded deterministic Bluesky source batch"
    )
    parser.add_argument("--csv", type=Path, default=backfill.SOCIAL_POSTS_CSV)
    parser.add_argument(
        "--snapshot-dir",
        type=Path,
        required=True,
        help="Exact destination for private feed and context snapshots",
    )
    parser.add_argument(
        "--report",
        type=Path,
        required=True,
        help="Exact destination for the machine-readable batch receipt",
    )
    parser.add_argument(
        "--overlap-hours",
        type=int,
        default=24,
        help="Subtract this many hours from the newest canonical Bluesky time",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=backfill.DEFAULT_MAX_PAGES,
        help="Fail without writing if the feed still has a cursor at this bound",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Write snapshots and the report without changing canonical data",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    if args.overlap_hours < 0:
        raise SystemExit("--overlap-hours must not be negative")
    if args.max_pages < 1:
        raise SystemExit("--max-pages must be at least 1")

    result = run_batch(
        csv_path=args.csv,
        snapshot_dir=args.snapshot_dir,
        report_path=args.report,
        overlap=datetime.timedelta(hours=args.overlap_hours),
        max_pages=args.max_pages,
        write=not args.dry_run,
    )
    print(
        json.dumps(
            {
                "complete": result.report["complete"],
                "input_cutoff": result.report["input_cutoff"],
                "newest_source_time": result.report["newest_source_time"],
                "counts": result.report["counts"],
            },
            sort_keys=True,
        )
    )
    print(f"Snapshot: {result.snapshot_dir}", file=sys.stderr)
    print(f"Report: {args.report}", file=sys.stderr)


if __name__ == "__main__":
    main()
