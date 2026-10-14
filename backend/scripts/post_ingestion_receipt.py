#!/usr/bin/env python3
"""Post one bounded stewardship receipt to the fixed discovery endpoint."""

from __future__ import annotations

import argparse
import csv
import datetime
import email.utils
import json
import math
import os
import re
import time
from pathlib import Path
from typing import Any, Iterator

import requests


ENDPOINT = "https://rosen-source-discovery.jamditis.workers.dev/ingestion-receipt"
CANDIDATES_ENDPOINT = (
    "https://rosen-source-discovery.jamditis.workers.dev/ingestion-candidates"
)
MAX_RECORDS_PER_REQUEST = 40
MAX_ATTEMPTS = 3
MAX_RETRY_DELAY_SECONDS = 30.0
MAX_CANDIDATE_PAGES = 20
MAX_CANDIDATES_PER_PAGE = 200
MAX_CANDIDATE_BODY_BYTES = 100_000
JAY_DID = "did:plc:3t37x6vfigdzzp2gjcfnzlz4"
JAY_URI_RE = re.compile(
    rf"^at://{re.escape(JAY_DID)}/app\.bsky\.feed\.post/([A-Za-z0-9._~:-]+)$"
)
JAY_URL_RE = re.compile(
    r"^https://bsky\.app/profile/jayrosen\.bsky\.social/post/" r"([A-Za-z0-9._~:-]+)/?$"
)
RECORD_ID_RE = re.compile(r"^BSKY-\d{5,}$")
REPO_ROOT = Path(__file__).resolve().parents[2]


def receipt_batches(payload: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Yield small receipt requests while retaining the shared run totals."""
    records = payload.get("records")
    if not isinstance(records, list):
        raise ValueError("receipt records must be a list")
    if payload.get("status") == "failed":
        if records:
            raise ValueError("failed receipts must not include record decisions")
        yield payload
        return
    if not records:
        yield payload
        return
    for start in range(0, len(records), MAX_RECORDS_PER_REQUEST):
        yield {**payload, "records": records[start : start + MAX_RECORDS_PER_REQUEST]}


def _retry_delay(response: requests.Response | None, attempt: int) -> float:
    default = min(float(2**attempt), MAX_RETRY_DELAY_SECONDS)
    if response is None:
        return default
    value = response.headers.get("Retry-After", "").strip()
    if not value:
        return default
    try:
        seconds = float(value)
    except ValueError:
        try:
            retry_at = email.utils.parsedate_to_datetime(value)
            now = datetime.datetime.now(datetime.timezone.utc)
            seconds = (retry_at.astimezone(datetime.timezone.utc) - now).total_seconds()
        except (TypeError, ValueError, OverflowError):
            return default
    if not math.isfinite(seconds):
        return default
    return min(max(seconds, 0.0), MAX_RETRY_DELAY_SECONDS)


def _request_with_retry(request, token: str, **kwargs) -> requests.Response:
    for attempt in range(MAX_ATTEMPTS):
        try:
            response = request(
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
                allow_redirects=False,
                **kwargs,
            )
        except requests.RequestException:
            if attempt + 1 >= MAX_ATTEMPTS:
                raise
            time.sleep(_retry_delay(None, attempt))
            continue
        if 300 <= response.status_code < 400:
            raise RuntimeError("ingestion receipt endpoint returned a redirect")
        if response.status_code in {401, 403}:
            response.raise_for_status()
        if response.status_code == 429 or response.status_code >= 500:
            if attempt + 1 < MAX_ATTEMPTS:
                time.sleep(_retry_delay(response, attempt))
                continue
        response.raise_for_status()
        return response
    raise RuntimeError("ingestion receipt transient retry limit reached")


def post_batch(payload: dict[str, Any], token: str) -> None:
    """Post one batch with bounded transient retries and no redirects."""
    _request_with_retry(requests.post, token, url=ENDPOINT, json=payload)


def _bounded_json(response: requests.Response) -> dict[str, Any]:
    declared = response.headers.get("Content-Length", "").strip()
    if declared:
        try:
            declared_size = int(declared)
        except ValueError as exc:
            raise ValueError(
                "candidate response has an invalid Content-Length"
            ) from exc
        if declared_size < 0:
            raise ValueError("candidate response has an invalid Content-Length")
        if declared_size > MAX_CANDIDATE_BODY_BYTES:
            raise ValueError("candidate response exceeds the body-size bound")
    body = response.content
    if len(body) > MAX_CANDIDATE_BODY_BYTES:
        raise ValueError("candidate response exceeds the body-size bound")
    try:
        payload = json.loads(body)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("candidate response is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("candidate response must be an object")
    return payload


def fetch_pending_candidate_uris(token: str) -> list[str]:
    """Read every bounded pending-candidate page before any receipt is posted."""
    cursor: str | None = None
    seen_cursors: set[str] = set()
    uris: list[str] = []
    seen_uris: set[str] = set()
    for _page in range(MAX_CANDIDATE_PAGES):
        params = {"cursor": cursor} if cursor is not None else {}
        response = _request_with_retry(
            requests.get,
            token,
            url=CANDIDATES_ENDPOINT,
            params=params,
        )
        payload = _bounded_json(response)
        candidates = payload.get("candidates")
        next_cursor = payload.get("nextCursor")
        if (
            not isinstance(candidates, list)
            or len(candidates) > MAX_CANDIDATES_PER_PAGE
        ):
            raise ValueError("candidate response has an invalid candidates page")
        for candidate in candidates:
            uri = candidate.get("uri") if isinstance(candidate, dict) else None
            if not isinstance(uri, str) or not JAY_URI_RE.fullmatch(uri):
                raise ValueError("candidate response contains an invalid Jay URI")
            if uri in seen_uris:
                raise ValueError("candidate response contains a duplicate URI")
            seen_uris.add(uri)
            uris.append(uri)
        if next_cursor is None:
            return uris
        if not isinstance(next_cursor, str) or not next_cursor.isdigit():
            raise ValueError("candidate response has an invalid next cursor")
        if next_cursor in seen_cursors:
            raise ValueError("candidate response repeats a cursor")
        seen_cursors.add(next_cursor)
        cursor = next_cursor
    raise ValueError("candidate response exceeds the page bound")


def canonical_candidate_decisions(
    canonical_csv: Path,
    pending_uris: list[str],
) -> list[dict[str, str]]:
    """Map pending Jay URIs already present in canonical CSV to settled decisions."""
    pending_rkeys: dict[str, str] = {}
    for uri in pending_uris:
        match = JAY_URI_RE.fullmatch(uri)
        if not match:
            raise ValueError("pending candidates contain an invalid Jay URI")
        if uri in pending_rkeys.values():
            raise ValueError("pending candidates contain a duplicate URI")
        pending_rkeys[match.group(1)] = uri
    matches: dict[str, dict[str, str]] = {}
    ids: dict[str, str] = {}
    with canonical_csv.open(newline="", encoding="utf-8") as source:
        for row in csv.DictReader(source):
            url_match = JAY_URL_RE.fullmatch((row.get("url") or "").strip())
            if not url_match or url_match.group(1) not in pending_rkeys:
                continue
            verdict = (row.get("verified") or "").strip().upper()
            if verdict not in {"TRUE", "FALSE"}:
                continue
            uri = pending_rkeys[url_match.group(1)]
            record_id = (row.get("id") or "").strip()
            if not RECORD_ID_RE.fullmatch(record_id):
                raise ValueError(f"canonical candidate {uri} has an invalid record ID")
            if uri in matches:
                raise ValueError(f"canonical candidate {uri} is not unique")
            if record_id in ids and ids[record_id] != uri:
                raise ValueError(
                    f"canonical candidate record ID {record_id} is not unique"
                )
            ids[record_id] = uri
            matches[uri] = {
                "uri": uri,
                "decision": "accepted" if verdict == "TRUE" else "rejected",
                "recordId": record_id,
            }
    return [matches[uri] for uri in pending_uris if uri in matches]


def append_pending_decisions(
    payload: dict[str, Any],
    token: str,
    canonical_csv: Path,
) -> dict[str, Any]:
    """Settle prior pending candidates from canonical state without changing run totals."""
    if payload.get("status") not in {"published", "no_change"}:
        return payload
    pending_uris = fetch_pending_candidate_uris(token)
    additions = canonical_candidate_decisions(canonical_csv, pending_uris)
    records = list(payload.get("records") or [])
    by_uri: dict[str, dict[str, str]] = {}
    by_id: dict[str, str] = {}
    for record in records:
        uri = record.get("uri") if isinstance(record, dict) else None
        record_id = record.get("recordId") if isinstance(record, dict) else None
        if not isinstance(uri, str) or not JAY_URI_RE.fullmatch(uri):
            raise ValueError("receipt records contain an invalid Jay URI")
        if not isinstance(record_id, str) or not RECORD_ID_RE.fullmatch(record_id):
            raise ValueError("receipt records contain an invalid record ID")
        if uri in by_uri or record_id in by_id:
            raise ValueError("receipt records must have unique URIs and record IDs")
        by_uri[uri] = record
        by_id[record_id] = uri
    for addition in additions:
        existing = by_uri.get(addition["uri"])
        if existing and existing != addition:
            raise ValueError(f"receipt decision conflicts for {addition['uri']}")
        existing_uri = by_id.get(addition["recordId"])
        if existing_uri and existing_uri != addition["uri"]:
            raise ValueError(
                f"receipt record ID {addition['recordId']} conflicts with {existing_uri}"
            )
        if not existing:
            records.append(addition)
            by_uri[addition["uri"]] = addition
            by_id[addition["recordId"]] = addition["uri"]
    return {**payload, "records": records}


def deliver_receipt(payload: dict[str, Any], token: str, canonical_csv: Path) -> int:
    """Reconcile pending decisions, then deliver every bounded receipt batch."""
    reconciled = append_pending_decisions(payload, token, canonical_csv)
    batches = list(receipt_batches(reconciled))
    for batch in batches:
        post_batch(batch, token)
    return len(batches)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("receipt", type=Path)
    parser.add_argument(
        "--canonical-csv",
        type=Path,
        default=REPO_ROOT / "data/social_posts.csv",
    )
    args = parser.parse_args()
    token = os.environ.get("ROSEN_INGESTION_RECEIPT_TOKEN", "").strip()
    if not token:
        raise SystemExit("ROSEN_INGESTION_RECEIPT_TOKEN is required")
    payload = json.loads(args.receipt.read_text(encoding="utf-8"))
    if payload.get("status") not in {"published", "no_change", "failed"}:
        raise SystemExit("receipt status is invalid")
    delivered = deliver_receipt(payload, token, args.canonical_csv)
    print(f"Ingestion receipt accepted in {delivered} request(s).")


if __name__ == "__main__":
    main()
