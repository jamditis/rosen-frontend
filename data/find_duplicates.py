"""
Find duplicate records in the archive CSV.

Duplicates are identified by:
1. Same URL (exact match)
2. Similar URL (one is a variant of the other)
3. Title patterns like "PressThink: [Title]" and "[Title]" matching
"""

import csv
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

CSV_PATH = Path(__file__).parent / "archive_records-public.csv"


def normalize_url(url):
    """Normalize URL for comparison."""
    if not url:
        return ""
    url = url.strip().lower()
    # Remove trailing slash
    url = url.rstrip('/')
    # Remove http/https prefix differences
    url = url.replace('https://', '').replace('http://', '')
    # Remove www.
    url = url.replace('www.', '')
    return url


def normalize_title(title):
    """Normalize title for comparison."""
    if not title:
        return ""
    title = title.strip()
    # Remove "PressThink: " prefix
    if title.startswith("PressThink: "):
        title = title[len("PressThink: "):]
    if title.startswith("PressThink: Test Post: "):
        title = title[len("PressThink: Test Post: "):]
    if title.startswith("PressThink: Test post: "):
        title = title[len("PressThink: Test post: "):]
    return title.lower().strip()


def main():
    print(f"Reading {CSV_PATH}...")

    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"  Loaded {len(rows)} records\n")

    # Group by normalized URL
    url_groups = defaultdict(list)
    for row in rows:
        url = normalize_url(row.get('url', ''))
        if url:
            url_groups[url].append(row)

    # Find URL-based duplicates
    url_dupes = {url: records for url, records in url_groups.items()
                 if len(records) > 1}

    print(f"  URL-based duplicates: {len(url_dupes)} groups")
    print("=" * 80)

    total_removable = 0
    for url, records in sorted(url_dupes.items()):
        ids = [r.get('id', '?') for r in records]
        titles = [r.get('title', '?')[:80] for r in records]
        dates = [r.get('publication_date', '?') for r in records]
        verified = [r.get('verified', '?') for r in records]

        print(f"\n  URL: {url}")
        for i, (rid, title, date, ver) in enumerate(zip(ids, titles, dates, verified)):
            marker = " <-- KEEP" if i == 0 else " <-- REMOVE"
            print(f"    {rid} | {date} | v={ver} | {title}{marker}")
        total_removable += len(records) - 1

    print(f"\n  Total removable duplicates: {total_removable}")

    # Also check for title-based near-duplicates
    print(f"\n\n  Title-based near-duplicates:")
    print("=" * 80)

    title_groups = defaultdict(list)
    for row in rows:
        ntitle = normalize_title(row.get('title', ''))
        if ntitle and len(ntitle) > 10:
            title_groups[ntitle].append(row)

    title_dupes = {title: records for title, records in title_groups.items()
                   if len(records) > 1}

    title_only_dupes = 0
    for title, records in sorted(title_dupes.items()):
        # Skip if already caught by URL
        urls = set(normalize_url(r.get('url', '')) for r in records)
        if len(urls) == 1:
            continue  # Already caught above

        ids = [r.get('id', '?') for r in records]
        real_titles = [r.get('title', '?')[:80] for r in records]
        real_urls = [r.get('url', '?')[:60] for r in records]

        print(f"\n  Normalized title: {title[:80]}")
        for rid, rt, ru in zip(ids, real_titles, real_urls):
            print(f"    {rid} | {rt}")
            print(f"           {ru}")
        title_only_dupes += 1

    if title_only_dupes == 0:
        print("  (none found beyond URL duplicates)")

    print(f"\n  Title-only near-duplicates: {title_only_dupes}")


if __name__ == "__main__":
    main()
