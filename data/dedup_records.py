"""
Remove duplicate records from the archive CSV.

Strategy:
1. Remove PressThink _p.html (print version) duplicates when the regular HTML
   version exists. The _p version is just a print-friendly copy.
2. Remove exact-URL duplicates (keep first occurrence).
3. Report but don't auto-remove cross-platform duplicates.
"""

import csv
import re
from collections import defaultdict
from pathlib import Path

from csv_safe_write import atomic_csv_write

CSV_PATH = Path(__file__).parent / "archive_records-public.csv"


def normalize_url(url):
    if not url:
        return ""
    return url.strip().lower().rstrip('/').replace('https://', '').replace('http://', '').replace('www.', '')


def is_pressthink_print(url):
    """Check if URL is a PressThink print version."""
    return '_p.htm' in url and 'archive.pressthink.org' in url


def get_regular_url(print_url):
    """Convert a PressThink print URL to its regular version."""
    # _p.html -> .html or _p.htm -> .htm
    return re.sub(r'_p\.htm', '.htm', print_url)


def main():
    print(f"Reading {CSV_PATH}...")

    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    print(f"  Loaded {len(rows)} records")

    # Build URL index
    url_to_ids = defaultdict(list)
    id_to_row = {}
    for row in rows:
        rid = row.get('id', '')
        url = row.get('url', '').strip()
        url_to_ids[normalize_url(url)].append(rid)
        id_to_row[rid] = row

    # Phase 1: Find PressThink _p duplicates to remove
    remove_ids = set()

    for row in rows:
        url = row.get('url', '').strip()
        rid = row.get('id', '')

        if is_pressthink_print(url):
            regular_url = get_regular_url(url)
            norm_regular = normalize_url(regular_url)

            # Check if the regular version exists
            if norm_regular in url_to_ids:
                regular_ids = url_to_ids[norm_regular]
                if regular_ids:
                    remove_ids.add(rid)

    print(f"  PressThink _p duplicates to remove: {len(remove_ids)}")

    # Phase 2: Exact URL duplicates (keep first, remove rest)
    seen_urls = set()
    for row in rows:
        rid = row.get('id', '')
        if rid in remove_ids:
            continue
        url = normalize_url(row.get('url', ''))
        if not url:
            continue
        if url in seen_urls:
            remove_ids.add(rid)
            print(f"    Exact URL dup: {rid} ({row.get('title', '?')[:60]})")
        else:
            seen_urls.add(url)

    print(f"  Total records to remove: {len(remove_ids)}")

    # Also update related_to fields to remove references to deleted records
    removed_refs = 0
    for row in rows:
        related = row.get('related_to', '')
        if not related:
            continue
        original = related
        # Tokenize on commas and keep only exact-match IDs. A bare
        # `related.replace(rid, '')` is a substring match, so removing
        # RECORD-0001 would also mangle RECORD-00012. See issue #146.
        kept = [token for token in (part.strip() for part in related.split(','))
                if token and token not in remove_ids]
        related = ', '.join(kept)
        if related != original:
            row['related_to'] = related
            removed_refs += 1

    print(f"  Cleaned related_to references: {removed_refs}")

    # Filter out removed records
    original_count = len(rows)
    rows = [r for r in rows if r.get('id', '') not in remove_ids]
    print(f"  Records: {original_count} -> {len(rows)} (removed {original_count - len(rows)})")

    # Report cross-platform duplicates (not auto-removed)
    print(f"\n  Cross-platform duplicates (NOT removed, for manual review):")
    cross_platform = [
        ("RECORD-00023 / RECORD-00098", "America's Press and the Asymmetric War for Truth", "NYBOOKS vs PressThink"),
        ("RECORD-00070 / RECORD-00191", "The People Formerly Known as the Audience", "HuffPost vs PressThink"),
        ("RECORD-00038 / RECORD-00066 / RECORD-00068", "What Are Journalists For?", "Prospect / Amazon / Goodreads"),
        ("RECORD-00073 / RECORD-00339", "Open Source Journalism", "Poynder vs PressThink"),
        ("RECORD-00662 / TUMBLR-00062", "Sources of subsidy in production of news", "Tumblr direct vs tmblr.co"),
        ("RECORD-00291 / TUMBLR-00105", "Explaining The Local: East Village", "PressThink vs Tumblr"),
    ]
    for ids, title, platforms in cross_platform:
        print(f"    {ids}: {title} ({platforms})")

    print(f"\n  Writing {CSV_PATH}...")
    with atomic_csv_write(CSV_PATH) as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print("  Done!")


if __name__ == "__main__":
    main()
