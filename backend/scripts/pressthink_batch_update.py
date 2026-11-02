#!/usr/bin/env python3
"""Capture published PressThink posts and reconcile source-owned archive fields.

Only the fixed public WordPress API is read. Prior source versions and curated
rows survive unchanged. This module never calls an LLM, exports, or publishes.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import urllib.robotparser
from pathlib import Path
from urllib.parse import unquote, urlsplit

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "data"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from csv_safe_write import read_archive_csv, write_archive_csv
from auto_categorize_records import RecordCategorizer
import pressthink_transaction as transaction
import record_id_sequence

ORIGIN = "https://pressthink.org"
ENDPOINT = ORIGIN + "/wp-json/wp/v2/posts"
ROBOTS = ORIGIN + "/robots.txt"
USER_AGENT = "RosenArchive-PressThinkBatch/1.0"
PER_PAGE = 100
MAX_PAGES = 20
MAX_BODY_BYTES = 8_000_000
MANAGED_NOTE = "PressThink API managed source; post id: "
FIELDS = "id,link,status,type,date,date_gmt,modified_gmt,title,content,yoast_head_json"


def get_public(url, *, params=None):
    """Bound reads and transient retries without following redirects."""
    if url not in {ENDPOINT, ROBOTS}:
        raise ValueError("URL outside the fixed PressThink source boundary")
    for attempt in range(4):
        try:
            with requests.get(
                url,
                params=params,
                headers={"User-Agent": USER_AGENT},
                timeout=45,
                allow_redirects=False,
                stream=True,
            ) as response:
                if response.status_code in {429, 500, 502, 503, 504}:
                    if attempt < 3:
                        time.sleep(min(2**attempt, 8))
                        continue
                if 300 <= response.status_code < 400:
                    raise ValueError("PressThink source returned a redirect")
                response.raise_for_status()
                chunks, size = [], 0
                for chunk in response.iter_content(64 * 1024):
                    size += len(chunk)
                    if size > MAX_BODY_BYTES:
                        raise ValueError("PressThink response exceeds the byte bound")
                    chunks.append(chunk)
                return b"".join(chunks), dict(response.headers)
        except (requests.ConnectionError, requests.Timeout):
            if attempt == 3:
                raise
            time.sleep(min(2**attempt, 8))
    raise RuntimeError("PressThink transient retries exhausted")


def capture_posts(get=get_public):
    """Require robots permission and a complete, stable, bounded pagination walk."""
    body, _headers = get(ROBOTS)
    policy_text = body.decode("utf-8")
    if not re.search(r"(?im)^user-agent\s*:", policy_text):
        raise ValueError("PressThink robots policy has no user-agent group")
    agents = re.findall(r"(?im)^user-agent\s*:\s*([^#\r\n]+)", policy_text)
    if not any(
        a.strip() == "*" or a.strip().lower() in USER_AGENT.lower() for a in agents
    ):
        raise ValueError("PressThink robots policy has no applicable group")
    policy = urllib.robotparser.RobotFileParser()
    policy.parse(policy_text.splitlines())
    if not policy.can_fetch(USER_AGENT, ENDPOINT):
        raise ValueError("PressThink robots policy denies the public API")
    posts, expected, pages = [], None, None
    for page in range(1, MAX_PAGES + 1):
        raw, headers = get(
            ENDPOINT,
            params={
                "per_page": PER_PAGE,
                "page": page,
                "orderby": "id",
                "order": "asc",
                "status": "publish",
                "_fields": FIELDS,
            },
        )
        headers = {k.lower(): v for k, v in headers.items()}
        total, total_pages = int(headers["x-wp-total"]), int(headers["x-wp-totalpages"])
        if not 0 < total <= MAX_PAGES * PER_PAGE or not 0 < total_pages <= MAX_PAGES:
            raise ValueError("PressThink pagination exceeds the reviewed bound")
        if total_pages != (total + PER_PAGE - 1) // PER_PAGE:
            raise ValueError("Inconsistent PressThink pagination totals")
        if expected is None:
            expected, pages = total, total_pages
        if (total, total_pages) != (expected, pages):
            raise ValueError("PressThink pagination changed during capture")
        payload = json.loads(raw)
        if not isinstance(payload, list) or len(payload) > PER_PAGE:
            raise ValueError("Invalid PressThink API page")
        posts.extend(payload)
        if page == pages:
            break
    if len(posts) != expected:
        raise ValueError("Incomplete PressThink pagination")
    ids = [post["id"] for post in posts]
    if len(ids) != len(set(ids)) or ids != sorted(ids):
        raise ValueError("Duplicate or unordered PressThink source identities")
    return posts


def plain_text(markup):
    soup = BeautifulSoup(markup, "html.parser")
    for node in soup.select("script,style,noscript"):
        node.decompose()
    blocks = (
        "address,article,aside,blockquote,caption,dd,div,dl,dt,fieldset,"
        "figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,"
        "main,nav,ol,p,pre,section,table,tbody,td,tfoot,th,thead,tr,ul,br"
    )
    for node in soup.select(blocks):
        node.insert_before("\n")
        node.insert_after("\n")
    text = soup.get_text()
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", text)
    lines = (" ".join(line.split()) for line in text.splitlines())
    return "\n".join(line for line in lines if line)


def url_identity(url):
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    path = unquote(parsed.path).rstrip("/")
    if host == "pressthink.org":
        path = re.sub(r"^(/\d{4}/\d{2})/\d{2}/([^/]+)$", r"\1/\2", path)
    return host, path


def title_identity(title):
    title = re.sub(r"^PressThink:\s*", "", title, flags=re.IGNORECASE)
    return " ".join(re.findall(r"\w+", plain_text(title).casefold()))


def source_post(post):
    if (
        type(post.get("id")) is not int
        or post["id"] <= 0
        or post.get("status") != "publish"
        or post.get("type") != "post"
        or post.get("content", {}).get("protected") is not False
    ):
        raise ValueError("PressThink source is not a public post")
    parsed = urlsplit(post["link"])
    if (
        parsed.scheme != "https"
        or parsed.netloc != "pressthink.org"
        or not re.fullmatch(r"/\d{4}/\d{2}/[^/]+/", parsed.path)
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("PressThink post has an unexpected canonical URL")
    for key in ("date", "date_gmt", "modified_gmt"):
        dt.datetime.fromisoformat(post[key])
    title = plain_text(post["title"]["rendered"])
    html = post["content"]["rendered"]
    text = plain_text(html)
    author = post.get("yoast_head_json", {}).get("author", "").strip()
    if len(title) < 5 or not text or not author:
        raise ValueError("PressThink source lacks title, text, or public authorship")
    return {
        "id": post["id"],
        "url": post["link"],
        "title": title,
        "author": author,
        "published_local": post["date"],
        "published_gmt": post["date_gmt"],
        "modified_gmt": post["modified_gmt"],
        "html": html,
        "text": text,
    }


def digest(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()


def load_history(path):
    heads = {}
    if not path.exists():
        return [], heads
    entries = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").split("\n")
        if line
    ]
    for entry in entries:
        identity = str(entry["source"]["id"])
        if entry["previous"] != heads.get(identity):
            raise ValueError("PressThink version chain is broken")
        value = {k: v for k, v in entry.items() if k != "sha256"}
        if digest(value) != entry["sha256"]:
            raise ValueError("PressThink source version hash mismatch")
        heads[identity] = entry["sha256"]
    return entries, heads


def source_fields(source, captured_at):
    excerpt = " ".join(source["text"].split())[:500]
    categories, _confidence, _reason = RecordCategorizer(
        confidence_threshold=0.6
    ).categorize_record(
        {"title": source["title"], "url": source["url"], "raw_text": source["text"]}
    )
    return {
        "title": source["title"],
        "url": source["url"],
        "author": source["author"],
        "publication_date": source["published_local"][:10],
        "original_publication": "PressThink",
        "publisher": "PressThink",
        "platform": "PressThink",
        "content_type": "Article",
        "format": "Blog Post",
        "word_count": str(len(source["text"].split())),
        "excerpt": excerpt,
        "summary": "Source excerpt: " + excerpt,
        "thematic_categories": ", ".join(categories),
        "raw_text": source["text"],
        "date_processed": captured_at,
        "verified": "TRUE",
        "low_confidence": "FALSE" if categories else "TRUE",
        "needs_review": "TRUE",
        "permissions": "Public website; original source rights apply",
        "notes": MANAGED_NOTE + str(source["id"]),
    }


def source_association(source, old, by_id, by_url, by_title):
    """Resolve an existing identity or retain a review/retirement boundary."""
    matches = by_url.get(url_identity(source["url"]), [])
    record_id = (old or {}).get("record_id")
    if record_id not in by_id and len(matches) == 1:
        record_id = matches[0]
    row = by_id.get(record_id)
    if record_id and not row:
        return record_id, "retired", []
    title_matches = by_title.get(
        (title_identity(source["title"]), source["published_local"][:4]), []
    )
    possible_duplicates = matches if len(matches) > 1 else title_matches
    state = "review" if not record_id and possible_duplicates else "linked"
    return record_id, state, possible_duplicates


def reconcile(posts, columns, rows, entries, *, captured_at, high_water=0):
    """Preserve IDs and curator edits; only managed source rows are refreshed."""
    sources = sorted((source_post(post) for post in posts), key=lambda s: s["id"])
    if len({s["id"] for s in sources}) != len(sources):
        raise ValueError("Duplicate PressThink source identities")
    if len({url_identity(s["url"]) for s in sources}) != len(sources):
        raise ValueError("Duplicate PressThink canonical URLs")
    by_url, by_title = {}, {}
    for row in rows:
        by_url.setdefault(url_identity(row["url"]), []).append(row["id"])
        title_key = (title_identity(row["title"]), row["publication_date"][:4])
        by_title.setdefault(title_key, []).append(row["id"])
    previous = {str(entry["source"]["id"]): entry for entry in entries}
    successor = [dict(row) for row in rows]
    by_id = {row["id"]: row for row in successor}
    reserved_ids = set(by_id) | {
        entry["record_id"] for entry in entries if entry.get("record_id")
    }
    next_id = max(
        high_water,
        max(
            (
                int(record_id.split("-")[1])
                for record_id in reserved_ids
                if re.fullmatch(r"RECORD-\d+", record_id)
            ),
            default=0,
        ),
    )
    added, updated, versions, excluded, proposed, retired = 0, 0, [], [], [], []
    associations = []
    for source in sources:
        identity = str(source["id"])
        old = previous.get(identity)
        record_id, state, possible_duplicates = source_association(
            source, old, by_id, by_url, by_title
        )
        row = by_id.get(record_id)
        if state == "retired":
            retired.append(record_id)
        if not record_id and possible_duplicates:
            state = "review"
            excluded.append(
                {
                    "source_id": source["id"],
                    "reason": "Possible existing record",
                    "candidate_record_ids": possible_duplicates,
                    "url": source["url"],
                    "title": source["title"],
                }
            )
        changed = old is None or old["source"] != source
        if (
            not record_id
            and not possible_duplicates
            and source["author"] == "Jay Rosen"
        ):
            next_id += 1
            record_id = f"RECORD-{next_id:05d}"
            row = {column: "" for column in columns}
            row.update({"id": record_id, **source_fields(source, captured_at)})
            successor.append(row)
            by_id[record_id] = row
            by_url.setdefault(url_identity(source["url"]), []).append(record_id)
            title_key = (title_identity(source["title"]), source["published_local"][:4])
            by_title.setdefault(title_key, []).append(record_id)
            added += 1
            proposed.append(
                {"record_id": record_id, "url": source["url"], "title": source["title"]}
            )
        elif row and changed and old and row.get("notes") == MANAGED_NOTE + identity:
            before_fields = source_fields(old["source"], old["captured_at"])
            after_fields = source_fields(source, captured_at)
            changed_fields = {
                key: value
                for key, value in after_fields.items()
                if row.get(key) == before_fields[key] and row.get(key) != value
            }
            row.update(changed_fields)
            updated += bool(changed_fields)
        if not record_id and not possible_duplicates:
            state = "review"
            excluded.append(
                {"source_id": source["id"], "reason": "Author requires review"}
            )
        association_changed = old and (
            old.get("state", "linked") != state or old.get("record_id") != record_id
        )
        if row and state != "retired":
            associations.append({"uri": source["url"], "record_id": record_id})
        if changed or association_changed:
            entry = {
                "source": source,
                "record_id": record_id,
                "state": state,
                "captured_at": captured_at,
                "previous": old["sha256"] if old else None,
            }
            entry["sha256"] = digest(entry)
            versions.append(entry)
    missing = sorted(set(previous) - {str(source["id"]) for source in sources})
    return (
        successor,
        versions,
        {
            "captured": len(sources),
            "record_id_high_water": next_id,
            "added": added,
            "updated": updated,
            "versions_added": len(versions),
            "missing_source_ids": missing,
            "excluded": excluded,
            "proposed_additions": proposed,
            "retired_record_ids": retired,
            "associations": associations,
            "newest_source_time": (
                max((source["modified_gmt"] for source in sources), default="") + "Z"
                if sources
                else None
            ),
            "changed": bool(added or updated or versions),
        },
    )


def run_batch(*, dry_run=False, csv_path=None, history_path=None, posts=None):
    csv_path = csv_path or ROOT / "data/archive_records-public.csv"
    history_path = history_path or ROOT / "preservation/pressthink/versions.jsonl"
    if csv_path.is_symlink() or history_path.is_symlink():
        raise ValueError("Preservation outputs must not be symlinks")
    if dry_run and transaction.journal_path(history_path).exists():
        raise ValueError("A pending PressThink write requires normal recovery")
    if not dry_run:
        transaction.recover(csv_path, history_path)
    before = csv_path.read_bytes()
    history_before = history_path.read_bytes() if history_path.exists() else None
    columns, rows = read_archive_csv(csv_path)
    entries, _heads = load_history(history_path)
    sequence_before = record_id_sequence.high_water(csv_path)
    posts = capture_posts() if posts is None else posts
    captured_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    successor, versions, report = reconcile(
        posts,
        columns,
        rows,
        entries,
        captured_at=captured_at,
        high_water=sequence_before,
    )
    report["reservations_advanced"] = report["record_id_high_water"] > sequence_before
    report["changed"] |= report["reservations_advanced"]
    if not dry_run and report["changed"]:
        if csv_path.read_bytes() != before:
            raise ValueError("Canonical CSV changed during PressThink capture")
        old = history_before or b""
        new = "".join(json.dumps(v, ensure_ascii=False) + "\n" for v in versions)
        separator = b"\n" if old and not old.endswith(b"\n") else b""
        history_after = old + separator + new.encode("utf-8")
        with tempfile.TemporaryDirectory(prefix="pressthink-prepare-") as directory:
            staged_csv = Path(directory) / "archive.csv"
            staged_csv.write_bytes(before)
            write_archive_csv(staged_csv, columns, successor)
            staged_history = Path(directory) / "history.jsonl"
            staged_history.write_bytes(history_after)
            load_history(staged_history)
            record_id_sequence.advance(
                csv_path, report["record_id_high_water"], expected=sequence_before
            )
            transaction.commit(
                csv_path,
                history_path,
                csv_before=before,
                history_before=history_before,
                csv_after=staged_csv.read_bytes(),
                history_after=history_after,
            )
    return report


def prepare_report(path):
    """Check the report destination before observing or changing canonical data."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not path.is_file():
        raise ValueError("Report destination must be a file")
    with tempfile.TemporaryFile(dir=path.parent) as probe:
        probe.write(b"PressThink report preflight\n")
        probe.flush()
        os.fsync(probe.fileno())


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.report.resolve().is_relative_to(ROOT):
        parser.error("Operational reports must stay outside the repository")
    prepare_report(args.report)
    report = run_batch(dry_run=args.dry_run)
    transaction.atomic_bytes(
        args.report, (json.dumps(report, indent=2) + "\n").encode()
    )
    print(json.dumps(report))


if __name__ == "__main__":
    main()
