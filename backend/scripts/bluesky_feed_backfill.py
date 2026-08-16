#!/usr/bin/env python3
"""
Bluesky differential backfill for the Rosen archive.

The existing pipeline has `bluesky_processor.py` for per-URL processing and
`reconstruct_bluesky_threads.py` for re-building thread hierarchies, but no
tool that walks Jay's full Bluesky feed and picks up posts that aren't yet
in `data/social_posts.csv`. This script fills that gap.

Mechanism:
- Walk `app.bsky.feed.getAuthorFeed` for @jayrosen.bsky.social, newest first,
  until the requested UTC date boundary.
- For each post, check if its URL is already in `data/social_posts.csv`.
- If new: build a row matching the existing BSKY-NNNNN schema (era,
  publisher, content_type, format, scope, era, etc. all mirror existing rows)
  and append.
- Atomic CSV write via `data/csv_safe_write.py`.

Designed to be re-run safely (idempotent — already-present URLs are skipped).

Usage:
    # Review new posts in a bounded stewardship window:
    python backend/scripts/bluesky_feed_backfill.py --since 2026-06-18 --sample 50

    # Fetch every missing post in that window:
    python backend/scripts/bluesky_feed_backfill.py --since 2026-06-18 --all

    # Dry-run (fetch + show what would change, no write):
    python backend/scripts/bluesky_feed_backfill.py --since 2026-06-18 --all --dry-run

Public AT Proto API, no auth, no rate-limit friction at our request rate.
"""

import argparse
import csv
import datetime
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import requests

# Repo-local helpers
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "data"))
from csv_safe_write import atomic_csv_write  # noqa: E402

csv.field_size_limit(sys.maxsize)

SOCIAL_POSTS_CSV = REPO_ROOT / "data" / "social_posts.csv"

ACTOR = "jayrosen.bsky.social"
ACTOR_DID = "did:plc:3t37x6vfigdzzp2gjcfnzlz4"
API_BASE = "https://public.api.bsky.app/xrpc"
FEED_ENDPOINT = f"{API_BASE}/app.bsky.feed.getAuthorFeed"
PAGE_LIMIT = 100  # API max

# Schema fields exactly mirror social_posts.csv header order
SCHEMA_FIELDS = [
    "id", "title", "url", "author", "publication_date", "original_publication",
    "publisher", "platform", "content_type", "format", "word_count",
    "length_in_seconds", "excerpt", "summary", "thematic_categories",
    "key_concepts", "series", "era", "scope", "tags", "likes", "reposts",
    "replies", "related_to", "responds_to", "influence", "copyright",
    "license", "permissions", "date_processed", "gdrive_pdf_link",
    "gdrive_raw_file_link", "gdrive_transcript_link", "pull_quote",
    "raw_text", "verified", "notes",
]

# Constants matching existing BSKY rows
AUTHOR = "Jay Rosen"
PUBLISHER = "Bluesky"
PLATFORM = "Bluesky"
ORIGINAL_PUBLICATION = "Bluesky"
CONTENT_TYPE = "Social Media Post"
FORMAT_LABEL = "Tweet/Thread"
ERA = "Platform Transition & Future Models (2021-Present)"
SCOPE = "Commentary/Critique"
INFLUENCE = "Jay Rosen"
PERMISSIONS = "Public Post"


def fetch_page(cursor: str | None) -> dict:
    params = {
        "actor": ACTOR,
        "filter": "posts_with_replies",
        "limit": PAGE_LIMIT,
    }
    if cursor:
        params["cursor"] = cursor
    r = requests.get(
        FEED_ENDPOINT, params=params,
        headers={"User-Agent": "RosenArchive-Backfill/1.0"}, timeout=30,
    )
    r.raise_for_status()
    return r.json()


def parse_since(value: str) -> datetime.datetime:
    """Parse a calendar date as the inclusive UTC start of the sweep window."""
    try:
        parsed = datetime.datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "expected a calendar date in YYYY-MM-DD format"
        ) from exc
    return parsed.replace(tzinfo=datetime.timezone.utc)


def _post_created_at(item: dict) -> datetime.datetime | None:
    created_at = ((item.get("post") or {}).get("record") or {}).get("createdAt")
    if not created_at:
        return None
    try:
        parsed = datetime.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed.astimezone(datetime.timezone.utc)


@dataclass
class CollectionResult:
    rows: list[dict]
    pages: int = 0
    seen: int = 0
    skipped_existing: int = 0
    skipped_dupe_in_run: int = 0
    skipped_repost: int = 0
    skipped_wrong_author: int = 0
    skipped_bad_date: int = 0
    skipped_bad_uri: int = 0
    stopped_at_since: bool = False


def load_existing_urls(csv_path: Path) -> tuple[set[str], int]:
    """Return (set of URLs already in CSV, max BSKY-NNNNN id)."""
    urls: set[str] = set()
    max_id = 0
    with csv_path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            url = (row.get("url") or "").strip()
            if url:
                urls.add(url)
            rid = (row.get("id") or "").strip()
            m = re.match(r"^BSKY-(\d+)$", rid)
            if m:
                max_id = max(max_id, int(m.group(1)))
    return urls, max_id


def derive_title(text: str) -> str:
    """Pick a short title from the post text."""
    text = (text or "").strip()
    if not text:
        return "Bluesky post"
    # First sentence-ish, capped at 80 chars
    head = re.split(r"[.!?\n]", text, maxsplit=1)[0]
    head = head[:80].rstrip()
    if len(text) > len(head):
        head += "..."
    return head or "Bluesky post"


def post_to_row(item: dict, next_id: int, today: str) -> dict | None:
    """Convert a getAuthorFeed item to a social_posts.csv row, or None to skip.

    item shape: {"post": {"uri": ..., "record": {"text": ..., "createdAt": ...,
    "reply": {"parent": {"uri": ...}}}, "likeCount": ..., "repostCount": ...,
    "replyCount": ...}}
    """
    post = item.get("post") or {}
    record = post.get("record") or {}
    text = (record.get("text") or "").strip()
    uri = post.get("uri") or ""
    # uri shape: at://did:plc:xxx/app.bsky.feed.post/<rkey>
    m = re.match(r"^at://[^/]+/app\.bsky\.feed\.post/([\w]+)$", uri)
    if not m:
        return None
    rkey = m.group(1)
    url = f"https://bsky.app/profile/{ACTOR}/post/{rkey}"

    created_at = record.get("createdAt") or ""
    # Normalize to "YYYY-MM-DD HH:MM:SS" (existing rows use space, not T)
    try:
        dt = datetime.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        pub_date = dt.strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        pub_date = created_at

    responds_to = ""
    reply_info = record.get("reply") or {}
    parent = reply_info.get("parent") or {}
    if parent.get("uri"):
        responds_to = parent["uri"]

    word_count = len(text.split()) if text else 0
    title = derive_title(text)
    # For replies, existing rows use "Reply by Jay Rosen" — match that convention
    if responds_to and word_count <= 3:
        title = "Reply by Jay Rosen"

    return {
        "id": f"BSKY-{next_id:05d}",
        "title": title,
        "url": url,
        "author": AUTHOR,
        "publication_date": pub_date,
        "original_publication": ORIGINAL_PUBLICATION,
        "publisher": PUBLISHER,
        "platform": PLATFORM,
        "content_type": CONTENT_TYPE,
        "format": FORMAT_LABEL,
        "word_count": str(word_count),
        "length_in_seconds": "",
        "excerpt": text,
        "summary": "",
        "thematic_categories": "",
        "key_concepts": "",
        "series": "",
        "era": ERA,
        "scope": SCOPE,
        "tags": "",
        "likes": str(post.get("likeCount", 0)),
        "reposts": str(post.get("repostCount", 0)),
        "replies": str(post.get("replyCount", 0)),
        "related_to": "",
        "responds_to": responds_to,
        "influence": INFLUENCE,
        "copyright": "",
        "license": "",
        "permissions": PERMISSIONS,
        "date_processed": today,
        "gdrive_pdf_link": "",
        "gdrive_raw_file_link": "",
        "gdrive_transcript_link": "",
        "pull_quote": text,
        "raw_text": text,
        "verified": "",
        "notes": (
            f"Bluesky differential backfill {today}; fetched via "
            f"app.bsky.feed.getAuthorFeed."
        ),
    }


def collect_new_rows(
    *,
    existing_urls: set[str],
    max_id: int,
    since: datetime.datetime,
    today: str,
    fetch_page_fn: Callable[[str | None], dict] = fetch_page,
    sleep_fn: Callable[[float], None] = time.sleep,
    sample: int | None = None,
) -> CollectionResult:
    """Collect missing Jay-authored posts at or after ``since``.

    The API returns newest posts first. Candidate rows are sorted before IDs are
    assigned so the archive IDs increase in publication order.
    """
    if sample is not None and sample < 1:
        raise ValueError("sample must be at least 1")

    result = CollectionResult(rows=[])
    seen_in_run: set[str] = set()
    candidates: list[tuple[datetime.datetime, dict]] = []
    cursor: str | None = None

    while True:
        page = fetch_page_fn(cursor)
        result.pages += 1
        feed = page.get("feed") or []
        if not feed:
            break

        for item in feed:
            result.seen += 1

            # Repost wrappers can contain another person's words and an older
            # original date. Do not ingest them or use them to end the window.
            if item.get("reason"):
                result.skipped_repost += 1
                continue

            post = item.get("post") or {}
            uri = post.get("uri") or ""
            match = re.match(
                r"^at://([^/]+)/app\.bsky\.feed\.post/(\w+)$",
                uri,
            )
            if not match:
                result.skipped_bad_uri += 1
                continue

            uri_did, rkey = match.groups()
            author_did = (post.get("author") or {}).get("did")
            if uri_did != ACTOR_DID or (
                author_did is not None and author_did != ACTOR_DID
            ):
                result.skipped_wrong_author += 1
                continue

            created_at = _post_created_at(item)
            if created_at is None:
                result.skipped_bad_date += 1
                continue
            if created_at < since:
                result.stopped_at_since = True
                break

            url = f"https://bsky.app/profile/{ACTOR}/post/{rkey}"
            if url in existing_urls:
                result.skipped_existing += 1
                continue
            if url in seen_in_run:
                result.skipped_dupe_in_run += 1
                continue

            seen_in_run.add(url)
            candidates.append((created_at, item))
        if result.stopped_at_since:
            break

        cursor = page.get("cursor")
        if not cursor:
            break
        sleep_fn(0.2)

    candidates.sort(key=lambda candidate: candidate[0])
    if sample is not None:
        candidates = candidates[:sample]
    for offset, (_created_at, item) in enumerate(candidates, start=1):
        row = post_to_row(item, max_id + offset, today)
        if row is not None:
            result.rows.append(row)

    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--since",
        type=parse_since,
        required=True,
        metavar="YYYY-MM-DD",
        help="Include posts on or after this UTC calendar date",
    )
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--sample",
        type=int,
        default=None,
        help="Keep the oldest N missing posts in the bounded window",
    )
    mode.add_argument(
        "--all",
        action="store_true",
        help="Keep every missing post in the bounded window",
    )
    ap.add_argument("--dry-run", action="store_true",
                    help="Print summary, don't write CSV")
    args = ap.parse_args()

    if args.sample is not None and args.sample < 1:
        ap.error("--sample must be at least 1")

    existing_urls, max_id = load_existing_urls(SOCIAL_POSTS_CSV)
    print(f"Loaded {len(existing_urls):,} existing URLs from social_posts.csv")
    print(f"Highest existing BSKY id: BSKY-{max_id:05d}")

    today = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    result = collect_new_rows(
        existing_urls=existing_urls,
        max_id=max_id,
        since=args.since,
        today=today,
        sample=args.sample,
    )
    new_rows = result.rows

    print(f"Sweep window starts: {args.since.date().isoformat()} 00:00:00 UTC")
    print(f"\nFetched {result.seen:,} posts across {result.pages} pages")
    print(
        f"Skipped {result.skipped_repost:,} reposts "
        "(own + others' — only original posts ingested)"
    )
    print(
        f"Skipped {result.skipped_wrong_author:,} wrong-author entries "
        "(defense-in-depth)"
    )
    print(f"Skipped {result.skipped_bad_date:,} entries with invalid dates")
    print(f"Skipped {result.skipped_bad_uri:,} entries with invalid AT URIs")
    print(f"Skipped {result.skipped_existing:,} already-in-archive")
    print(f"Skipped {result.skipped_dupe_in_run:,} dupes within this run")
    if result.stopped_at_since:
        print("Stopped when the feed reached an original post before --since")
    print(f"New rows to append: {len(new_rows):,}")
    if not new_rows:
        print("Nothing to write.")
        return

    if args.dry_run:
        print("\nDry-run: first 3 new rows:")
        for r in new_rows[:3]:
            print(f"  {r['id']} | {r['publication_date']} | {r['title'][:50]!r} | {r['url']}")
        return

    # Append new rows to social_posts.csv via atomic-write
    with SOCIAL_POSTS_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        existing_rows = list(reader)

    if fieldnames != SCHEMA_FIELDS:
        # If the on-disk schema differs from what we built rows for, surface it
        # rather than silently writing the wrong columns.
        diff_only_in_disk = set(fieldnames) - set(SCHEMA_FIELDS)
        diff_only_in_script = set(SCHEMA_FIELDS) - set(fieldnames)
        if diff_only_in_disk or diff_only_in_script:
            raise SystemExit(
                f"Schema mismatch:\n"
                f"  Only in CSV header: {sorted(diff_only_in_disk)}\n"
                f"  Only in script: {sorted(diff_only_in_script)}\n"
                f"Fix SCHEMA_FIELDS in this script before writing."
            )

    with atomic_csv_write(SOCIAL_POSTS_CSV) as out:
        writer = csv.DictWriter(out, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(existing_rows)
        writer.writerows(new_rows)

    print(f"\nAppended {len(new_rows):,} rows. Backup at {SOCIAL_POSTS_CSV}.bak")
    print(f"New id range: {new_rows[0]['id']} .. {new_rows[-1]['id']}")
    print(f"Date range: {new_rows[0]['publication_date']} .. {new_rows[-1]['publication_date']}")


if __name__ == "__main__":
    main()
