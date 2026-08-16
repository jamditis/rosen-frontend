#!/usr/bin/env python3
"""
Bluesky differential backfill for the Rosen archive.

The existing pipeline has `bluesky_processor.py` for per-URL processing and
`reconstruct_bluesky_threads.py` for re-building thread hierarchies, but no
tool that walks Jay's full Bluesky feed and picks up posts that aren't yet
in `data/social_posts.csv`. This script fills that gap.

Mechanism:
- Walk `app.bsky.feed.getAuthorFeed` for @jayrosen.bsky.social through a
  bounded, cycle-checked cursor sequence.
- Keep posts at or after the requested UTC date boundary.
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
DEFAULT_MAX_PAGES = 1_000
REPOST_REASON = "app.bsky.feed.defs#reasonRepost"
AT_POST_URI_RE = re.compile(
    r"^at://([^/]+)/app\.bsky\.feed\.post/([A-Za-z0-9._~:-]+)$"
)
BSKY_POST_URL_RE = re.compile(
    r"^https://bsky\.app/profile/([^/]+)/post/([^/?#]+)/?(?:[?#].*)?$"
)

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


class FeedValidationError(ValueError):
    """Raised when the API response cannot be trusted for an archive write."""


def _post_created_at(item: dict) -> datetime.datetime | None:
    created_at = ((item.get("post") or {}).get("record") or {}).get("createdAt")
    if not isinstance(created_at, str) or not created_at:
        return None
    try:
        parsed = datetime.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(datetime.timezone.utc)


def _reason_type(item: dict) -> str | None:
    if "reason" not in item or item["reason"] is None:
        return None
    reason = item["reason"]
    if not isinstance(reason, dict) or not isinstance(reason.get("$type"), str):
        raise FeedValidationError("feed item has a malformed reason")
    return reason["$type"]


def _post_identity(item: dict) -> tuple[dict, str, str]:
    if not isinstance(item, dict):
        raise FeedValidationError("feed item is not an object")
    post = item.get("post")
    if not isinstance(post, dict):
        raise FeedValidationError("feed item has no post object")
    uri = post.get("uri")
    if not isinstance(uri, str):
        raise FeedValidationError("post URI is missing or is not text")
    match = AT_POST_URI_RE.fullmatch(uri)
    if not match:
        raise FeedValidationError(f"post URI is malformed: {uri!r}")
    author = post.get("author")
    if not isinstance(author, dict) or not isinstance(author.get("did"), str):
        raise FeedValidationError("post author has no stable DID")
    uri_did, rkey = match.groups()
    if author["did"] != uri_did:
        raise FeedValidationError("post author DID does not match the post URI")
    return post, uri_did, rkey


def _post_record(
    item: dict,
    post: dict,
) -> tuple[dict, datetime.datetime, str]:
    record = post.get("record")
    if not isinstance(record, dict):
        raise FeedValidationError("post record is missing or malformed")
    if not isinstance(record.get("text"), str):
        raise FeedValidationError("post record text is missing or malformed")
    created_at = _post_created_at(item)
    if created_at is None:
        raise FeedValidationError("post createdAt is missing or malformed")

    parent_uri = ""
    reply = record.get("reply")
    if reply is not None:
        if not isinstance(reply, dict):
            raise FeedValidationError("post reply is malformed")
        for ref_name in ("root", "parent"):
            ref = reply.get(ref_name)
            if not isinstance(ref, dict) or not isinstance(ref.get("uri"), str):
                raise FeedValidationError(
                    f"post reply {ref_name} reference is malformed"
                )
            if not AT_POST_URI_RE.fullmatch(ref["uri"]):
                raise FeedValidationError(
                    f"post reply {ref_name} URI is malformed: {ref['uri']!r}"
                )
        parent_uri = reply["parent"]["uri"]

    return record, created_at, parent_uri


def _existing_post_identities(urls: set[str]) -> set[tuple[str, str]]:
    identities: set[tuple[str, str]] = set()
    for url in urls:
        match = BSKY_POST_URL_RE.fullmatch(url.strip())
        if not match:
            continue
        profile, rkey = match.groups()
        if profile.lower() in {ACTOR.lower(), ACTOR_DID.lower()}:
            identities.add((ACTOR_DID, rkey))
    return identities


@dataclass
class CollectionResult:
    rows: list[dict]
    pages: int = 0
    seen: int = 0
    skipped_existing: int = 0
    skipped_dupe_in_run: int = 0
    skipped_repost: int = 0
    skipped_wrong_author: int = 0
    skipped_before_since: int = 0
    complete: bool = False
    failure_reason: str = ""


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
    title_text = re.sub(r"^[^\w@]+", "", text)
    title_text = re.sub(r"^(?:@\S+(?:\s+|$))+", "", title_text)
    title_text = re.sub(r"^[^\w@]+", "", title_text)
    if not title_text:
        return "Bluesky post"
    # First sentence-ish, capped at 80 chars
    head = re.split(r"[.!?\n]", title_text, maxsplit=1)[0]
    head = head[:80].rstrip()
    if len(title_text) > len(head):
        head += "..."
    return head or "Bluesky post"


def post_to_row(item: dict, next_id: int, today: str) -> dict:
    """Convert one validated Jay-authored feed item to an archive row.

    item shape: {"post": {"uri": ..., "record": {"text": ..., "createdAt": ...,
    "reply": {"parent": {"uri": ...}}}, "likeCount": ..., "repostCount": ...,
    "replyCount": ...}}
    """
    post, uri_did, rkey = _post_identity(item)
    if uri_did != ACTOR_DID:
        raise FeedValidationError("post is not authored by the configured actor")
    record, created_at, parent_uri = _post_record(item, post)
    text = record["text"].strip()
    url = f"https://bsky.app/profile/{ACTOR}/post/{rkey}"

    # Existing rows use a space separator and no suffix. Normalize the value to
    # UTC before formatting it in that archive convention.
    pub_date = created_at.astimezone(datetime.timezone.utc).strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    word_count = len(text.split()) if text else 0
    title = derive_title(text)
    # For replies, existing rows use "Reply by Jay Rosen" — match that convention
    if parent_uri and word_count <= 3:
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
        "responds_to": parent_uri,
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
    max_pages: int = DEFAULT_MAX_PAGES,
) -> CollectionResult:
    """Collect missing Jay-authored posts at or after ``since``.

    Client-created timestamps do not control pagination. The full bounded
    cursor walk must finish before candidate rows receive archive IDs.
    """
    if sample is not None and sample < 1:
        raise ValueError("sample must be at least 1")
    if max_pages < 1:
        raise ValueError("max_pages must be at least 1")
    if since.tzinfo is None:
        raise ValueError("since must include a timezone")
    since_utc = since.astimezone(datetime.timezone.utc)

    result = CollectionResult(rows=[])
    existing_identities = _existing_post_identities(existing_urls)
    seen_in_run: set[tuple[str, str]] = set()
    candidates: list[tuple[datetime.datetime, dict]] = []
    cursor: str | None = None
    requested_cursors: set[str | None] = set()

    def fail(reason: str) -> CollectionResult:
        result.rows = []
        result.complete = False
        result.failure_reason = reason
        return result

    while True:
        if cursor in requested_cursors:
            return fail(f"cursor cycle detected before request: {cursor!r}")
        requested_cursors.add(cursor)

        page = fetch_page_fn(cursor)
        result.pages += 1
        if not isinstance(page, dict):
            return fail(f"page {result.pages} is not an object")
        feed = page.get("feed")
        if not isinstance(feed, list):
            return fail(f"page {result.pages} has no valid feed list")
        next_cursor = page.get("cursor")
        if next_cursor is not None and not isinstance(next_cursor, str):
            return fail(f"page {result.pages} has a malformed cursor")
        if next_cursor == "":
            next_cursor = None

        for item_index, item in enumerate(feed):
            result.seen += 1
            try:
                if not isinstance(item, dict):
                    raise FeedValidationError("feed item is not an object")
                reason_type = _reason_type(item)
                if reason_type == REPOST_REASON:
                    result.skipped_repost += 1
                    continue
                post, uri_did, rkey = _post_identity(item)
                if uri_did != ACTOR_DID:
                    result.skipped_wrong_author += 1
                    continue
                _record, created_at, _parent_uri = _post_record(item, post)
            except FeedValidationError as exc:
                return fail(
                    f"page {result.pages} item {item_index}: {exc}"
                )

            identity = (uri_did, rkey)
            if identity in existing_identities:
                result.skipped_existing += 1
                continue
            if identity in seen_in_run:
                result.skipped_dupe_in_run += 1
                continue
            if created_at < since_utc:
                result.skipped_before_since += 1
                continue

            public_url = f"https://bsky.app/profile/{ACTOR}/post/{rkey}"
            if public_url in existing_urls:
                # Keep the exact URL guard for non-standard legacy input.
                result.skipped_existing += 1
                continue

            seen_in_run.add(identity)
            candidates.append((created_at, item))

        if next_cursor is None:
            result.complete = True
            break
        if next_cursor in requested_cursors:
            return fail(f"cursor cycle detected: {next_cursor!r}")
        if result.pages >= max_pages:
            return fail(
                f"page cap {max_pages} reached while a cursor remained"
            )

        cursor = next_cursor
        sleep_fn(0.2)

    if not result.complete:
        return fail("feed walk ended without a complete state")

    candidates.sort(key=lambda candidate: candidate[0])
    if sample is not None:
        candidates = candidates[:sample]
    for offset, (_created_at, item) in enumerate(candidates, start=1):
        try:
            row = post_to_row(item, max_id + offset, today)
        except FeedValidationError as exc:
            return fail(f"candidate row validation failed: {exc}")
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
    ap.add_argument(
        "--max-pages",
        type=int,
        default=DEFAULT_MAX_PAGES,
        help=(
            "Fail without writing if the feed still has a cursor after this "
            "many pages"
        ),
    )
    ap.add_argument("--dry-run", action="store_true",
                    help="Print summary, don't write CSV")
    args = ap.parse_args()

    if args.sample is not None and args.sample < 1:
        ap.error("--sample must be at least 1")
    if args.max_pages < 1:
        ap.error("--max-pages must be at least 1")

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
        max_pages=args.max_pages,
    )
    if not result.complete:
        raise SystemExit(
            f"Incomplete feed walk: {result.failure_reason}. No rows written."
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
    print(f"Skipped {result.skipped_before_since:,} posts before --since")
    print(f"Skipped {result.skipped_existing:,} already-in-archive")
    print(f"Skipped {result.skipped_dupe_in_run:,} dupes within this run")
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
