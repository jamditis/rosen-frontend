"""
Mastodon differential backfill for the Rosen archive.

Walks Jay Rosen's Mastodon statuses on mastodon.social and appends new
own-original posts to ``data/social_posts.csv``. Reblogs of other accounts
are dropped on attribution grounds: if we ingested them they would be
misattributed to Jay (his URL + his author tag, but the original words belong
to someone else). Same shape as other social-platform differential backfill
scripts in this directory.

Mechanism:
- Page ``/api/v1/accounts/{id}/statuses?limit=40&max_id=<id>``, newest first.
- For each status, skip if ``reblog`` is not null (reblog of another account).
- Defense-in-depth: also drop any status whose ``account.acct`` or
  ``account.id`` doesn't match Jay's.
- Within-run dedup via a ``seen_in_run`` set on the status id.
- Cross-run dedup via the URL set already in ``data/social_posts.csv``.
- New row schema mirrors social_posts.csv header exactly; era uses the
  canonical post-PR-#218 label ``Platform Transition & Future Models
  (2021-Present)``.

Designed to be re-run safely (idempotent — already-present URLs are skipped).

Usage (run via Poetry per backend convention):
    # Sample first run for review:
    poetry run python backend/scripts/mastodon_feed_backfill.py --sample 20

    # Full differential backfill:
    poetry run python backend/scripts/mastodon_feed_backfill.py --all

    # Dry-run (fetch + show what would change, no write):
    poetry run python backend/scripts/mastodon_feed_backfill.py --all --dry-run

Public Mastodon API, no auth required. Rate limit is 300 req per 5 min
window per IP — at 40 statuses per page and ~535 statuses, ~14 requests
total, well under the limit. 250ms inter-page sleep for good citizenship.
"""

import argparse
import csv
import datetime
import html
import re
import sys
import time
from pathlib import Path

import requests

# Repo-local helpers
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "data"))
from csv_safe_write import atomic_csv_write  # noqa: E402

csv.field_size_limit(sys.maxsize)

SOCIAL_POSTS_CSV = REPO_ROOT / "data" / "social_posts.csv"

ACTOR_ACCT = "jayrosen_nyu"
ACTOR_ID = "109258153715778437"
API_BASE = "https://mastodon.social/api/v1"
STATUSES_ENDPOINT = f"{API_BASE}/accounts/{ACTOR_ID}/statuses"
PAGE_LIMIT = 40  # Mastodon API max

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

# Constants matching the planned Mastodon rows
AUTHOR = "Jay Rosen"
PUBLISHER = "Mastodon"
PLATFORM = "Mastodon"
ORIGINAL_PUBLICATION = "Mastodon"
CONTENT_TYPE = "Social Media Post"
FORMAT_LABEL = "Tweet/Thread"
# Canonical era label per PR #218 (do NOT use "Post-Trump & Future of News
# (2022-Present)" — that's the drift label PR #218 is correcting).
ERA = "Platform Transition & Future Models (2021-Present)"
SCOPE = "Commentary/Critique"
INFLUENCE = "Jay Rosen"
PERMISSIONS = "Public Post"

_TAG_RE = re.compile(r"<[^>]+>")


def strip_html(s: str) -> str:
    """Return plain text from a Mastodon content HTML fragment.

    Mastodon delivers status content as HTML (``<p>``, ``<br>``, anchor tags
    for mentions/hashtags). Replace block-level breaks with whitespace before
    stripping tags so words don't run together.
    """
    if not s:
        return ""
    # Treat block-level transitions as spaces so adjacent text isn't fused.
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.IGNORECASE)
    s = re.sub(r"</p\s*>", "\n", s, flags=re.IGNORECASE)
    s = _TAG_RE.sub("", s)
    s = html.unescape(s)
    # Collapse whitespace but keep single newlines for readability.
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{2,}", "\n\n", s)
    return s.strip()


def fetch_page(max_id: str | None, retries: int = 3) -> list[dict]:
    """Fetch one page of statuses. Retries 429/5xx with backoff."""
    params = {"limit": PAGE_LIMIT}
    if max_id:
        params["max_id"] = max_id
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            r = requests.get(
                STATUSES_ENDPOINT, params=params,
                headers={"User-Agent": "RosenArchive-Backfill/1.0"},
                timeout=30,
            )
            if r.status_code == 429 or 500 <= r.status_code < 600:
                # Honour Retry-After when present, otherwise back off 30s.
                wait = int(r.headers.get("Retry-After") or 30)
                print(f"  HTTP {r.status_code}; sleeping {wait}s "
                      f"(attempt {attempt + 1}/{retries})")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException as exc:
            last_exc = exc
            print(f"  Request failed: {exc}; sleeping 30s "
                  f"(attempt {attempt + 1}/{retries})")
            time.sleep(30)
    raise RuntimeError(
        f"Mastodon API exhausted retries (max_id={max_id}): {last_exc}"
    )


def load_existing_urls(csv_path: Path) -> tuple[set[str], int]:
    """Return (set of URLs already in CSV, max MAST-NNNNN id)."""
    urls: set[str] = set()
    max_id = 0
    with csv_path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            url = (row.get("url") or "").strip()
            if url:
                urls.add(url)
            rid = (row.get("id") or "").strip()
            # Accept either MAST-NNNNN or MASTODON-NNNNN prefixes when picking
            # the next id, so a future move to a longer prefix doesn't collide.
            m = re.match(r"^(?:MAST|MASTODON)-(\d+)$", rid)
            if m:
                max_id = max(max_id, int(m.group(1)))
    return urls, max_id


def derive_title(text: str) -> str:
    """Pick a short title from the status text (cap at 120 chars)."""
    text = (text or "").strip()
    if not text:
        return "Mastodon post"
    head = re.split(r"[.!?\n]", text, maxsplit=1)[0]
    head = head[:120].rstrip()
    if len(text) > len(head):
        head += "..."
    return head or "Mastodon post"


def status_to_row(status: dict, next_id: int, today: str) -> dict | None:
    """Convert a Mastodon status to a social_posts.csv row, or None to skip.

    Assumes the caller has already filtered out reblogs and wrong-author rows.
    """
    text = strip_html(status.get("content") or "")
    url = (status.get("url") or "").strip()
    if not url:
        return None

    created_at = status.get("created_at") or ""
    # Normalize to "YYYY-MM-DD HH:MM:SS" to match the existing social_posts.csv
    # format. Mastodon delivers ISO 8601 with millisecond precision and a "Z"
    # suffix (e.g. "2023-09-15T19:13:47.198Z").
    try:
        dt = datetime.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        pub_date = dt.strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        pub_date = created_at

    in_reply_to_id = (status.get("in_reply_to_id") or "").strip() \
        if status.get("in_reply_to_id") else ""
    # Mirror the Bluesky script's at://-style parent pointer for cross-platform
    # readability of the responds_to field.
    responds_to = (
        f"at://mastodon.social/{in_reply_to_id}" if in_reply_to_id else ""
    )

    word_count = len(text.split()) if text else 0
    title = derive_title(text)
    # Replies with effectively-empty text bodies (image-only / link-only)
    # get a clearer fallback title.
    if responds_to and word_count <= 3:
        title = "Reply by Jay Rosen"
    elif not text:
        # Posts with no text (typically image- or link-only) still need a
        # title. The Mastodon API surfaces media attachments / cards we could
        # mine for descriptions, but staying conservative matches the Bluesky
        # script's behaviour.
        title = "Mastodon post"

    return {
        "id": f"MAST-{next_id:05d}",
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
        "likes": str(status.get("favourites_count", 0)),
        "reposts": str(status.get("reblogs_count", 0)),
        "replies": str(status.get("replies_count", 0)),
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
            f"Mastodon differential backfill {today}; fetched via "
            f"/api/v1/accounts/{ACTOR_ID}/statuses."
        ),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=None,
                    help="Stop after fetching this many new posts")
    ap.add_argument("--all", action="store_true",
                    help="Walk the entire status history until exhausted")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print summary, don't write CSV")
    args = ap.parse_args()

    if not args.sample and not args.all:
        ap.error("Pick --sample N or --all")

    existing_urls, max_id = load_existing_urls(SOCIAL_POSTS_CSV)
    print(f"Loaded {len(existing_urls):,} existing URLs from social_posts.csv")
    print(f"Highest existing MAST id: MAST-{max_id:05d}")

    today = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_rows: list[dict] = []
    seen_in_run: set[str] = set()  # status.id dedup within this run
    max_id_cursor: str | None = None
    pages = 0
    seen = 0
    skipped_existing = 0
    skipped_dupe_in_run = 0
    skipped_reblog = 0
    skipped_wrong_author = 0

    while True:
        page = fetch_page(max_id_cursor)
        pages += 1
        if not page:
            print(f"Page {pages} empty — feed exhausted")
            break

        last_status_id: str | None = None
        for status in page:
            seen += 1
            sid = (status.get("id") or "").strip()
            if not sid:
                continue
            last_status_id = sid

            # Skip reblogs entirely. A status with reblog != null is a reblog
            # of someone else's post; ingesting it would misattribute that
            # post's content to Jay. Same rule as the Bluesky script's
            # ``reason`` check.
            if status.get("reblog") is not None:
                skipped_reblog += 1
                continue

            # Defense in depth: also verify the post account IS Jay. Should
            # always be true once reblogs are filtered out, but cheap to
            # check — covers any API quirk that surfaces a third-party status
            # outside the reblog wrapper.
            account = status.get("account") or {}
            if (account.get("acct") != ACTOR_ACCT or
                    str(account.get("id")) != ACTOR_ID):
                skipped_wrong_author += 1
                continue

            if sid in seen_in_run:
                skipped_dupe_in_run += 1
                continue

            url = (status.get("url") or "").strip()
            if not url:
                continue
            if url in existing_urls:
                skipped_existing += 1
                seen_in_run.add(sid)
                continue

            next_id = max_id + 1 + len(new_rows)
            row = status_to_row(status, next_id, today)
            if row is None:
                continue
            seen_in_run.add(sid)
            new_rows.append(row)
            if args.sample and len(new_rows) >= args.sample:
                break

        if args.sample and len(new_rows) >= args.sample:
            break

        # Mastodon paginates by passing the LAST status's id as ``max_id``.
        # No status ids in this page → nothing to advance from.
        if not last_status_id:
            print(f"Page {pages} yielded no usable ids — stopping")
            break
        # If the API returned fewer than PAGE_LIMIT items, we're at the end.
        if len(page) < PAGE_LIMIT:
            max_id_cursor = last_status_id
            # One more empty fetch will confirm exhaustion, but exiting here
            # saves a request — mirrors the Bluesky script's "no cursor"
            # short-circuit.
            print(f"Page {pages} returned {len(page)} < {PAGE_LIMIT} — "
                  f"feed exhausted")
            break
        max_id_cursor = last_status_id
        time.sleep(0.25)  # gentle on the API

    print(f"\nFetched {seen:,} statuses across {pages} pages")
    print(f"Skipped {skipped_reblog:,} reblogs (third-party posts)")
    print(f"Skipped {skipped_wrong_author:,} wrong-author entries "
          f"(defense-in-depth)")
    print(f"Skipped {skipped_existing:,} already-in-archive")
    print(f"Skipped {skipped_dupe_in_run:,} dupes within this run")
    print(f"New rows to append: {len(new_rows):,}")
    if not new_rows:
        print("Nothing to write.")
        return

    if args.dry_run:
        print("\nDry-run: first 3 new rows:")
        for r in new_rows[:3]:
            print(f"  {r['id']} | {r['publication_date']} | "
                  f"{r['title'][:50]!r} | {r['url']}")
        return

    # Append new rows to social_posts.csv via atomic-write.
    with SOCIAL_POSTS_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        existing_rows = list(reader)

    if fieldnames != SCHEMA_FIELDS:
        diff_only_in_disk = set(fieldnames) - set(SCHEMA_FIELDS)
        diff_only_in_script = set(SCHEMA_FIELDS) - set(fieldnames)
        if diff_only_in_disk or diff_only_in_script:
            raise SystemExit(
                f"Schema mismatch:\n"
                f"  Only in CSV header: {sorted(diff_only_in_disk)}\n"
                f"  Only in script: {sorted(diff_only_in_script)}\n"
                f"Fix SCHEMA_FIELDS in this script before writing."
            )
        # Same columns, different order — DictWriter would rewrite the
        # whole file with reordered columns, silently breaking downstream
        # column-position-dependent consumers. Refuse and let the human
        # decide whether to reorder the CSV or the script.
        raise SystemExit(
            f"Schema column ORDER mismatch (same set, different order):\n"
            f"  CSV header order:    {fieldnames}\n"
            f"  Script SCHEMA_FIELDS: {SCHEMA_FIELDS}\n"
            f"Reorder one to match the other before writing."
        )

    with atomic_csv_write(SOCIAL_POSTS_CSV) as out:
        writer = csv.DictWriter(out, fieldnames=fieldnames,
                                quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(existing_rows)
        writer.writerows(new_rows)

    print(f"\nAppended {len(new_rows):,} rows. "
          f"Backup at {SOCIAL_POSTS_CSV}.bak")
    print(f"New id range: {new_rows[0]['id']} .. {new_rows[-1]['id']}")
    print(f"Date range: {new_rows[-1]['publication_date']} .. "
          f"{new_rows[0]['publication_date']}")


if __name__ == "__main__":
    main()
