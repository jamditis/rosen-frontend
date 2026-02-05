"""
Deduplicate archive records by URL.

For each group of records sharing the same URL:
- Keep the record with the earliest/lowest record ID
- Remove later duplicates
- EXCEPTION: newspapers.com image URLs are skipped (different articles can share the same page image)

Creates a backup before modifying the original file.
"""

import csv
import shutil
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CSV_PATH = DATA_DIR / "archive_records-public.csv"
BACKUP_PATH = DATA_DIR / "archive_records-public.csv.backup-dedup"


def is_newspapers_com_image(url: str) -> bool:
    """Check if a URL is a newspapers.com image URL."""
    if not url:
        return False
    return "newspapers.com" in url.lower()


def main():
    # Read all records
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        records = list(reader)

    print(f"Total records read: {len(records)}")
    print(f"Columns: {fieldnames[:5]}...")  # Show first few columns
    print()

    # Group records by URL
    url_groups: dict[str, list[dict]] = defaultdict(list)
    no_url_count = 0
    for rec in records:
        url = (rec.get("url") or "").strip()
        if not url:
            no_url_count += 1
            continue
        url_groups[url].append(rec)

    print(f"Records with no URL: {no_url_count}")
    print(f"Unique URLs: {len(url_groups)}")

    # Find duplicate groups
    duplicate_groups = {
        url: recs for url, recs in url_groups.items() if len(recs) > 1
    }
    print(f"Duplicate URL groups: {len(duplicate_groups)}")
    print()

    # Determine which records to remove
    ids_to_remove: set[str] = set()
    skipped_newspapers = 0

    print("=" * 80)
    print("DUPLICATE URL REPORT")
    print("=" * 80)

    for url, recs in sorted(duplicate_groups.items(), key=lambda x: x[0]):
        # Exception: skip newspapers.com image URLs
        if is_newspapers_com_image(url):
            skipped_newspapers += 1
            print(f"\n[SKIPPED - newspapers.com] {url}")
            for r in recs:
                print(f"  KEEP: {r['id']} - {r.get('title', '(no title)')[:60]}")
            continue

        # Sort by ID to find the earliest
        sorted_recs = sorted(recs, key=lambda r: r["id"])
        keeper = sorted_recs[0]
        duplicates = sorted_recs[1:]

        print(f"\n[DEDUP] {url[:100]}")
        print(f"  KEEP:   {keeper['id']} - {keeper.get('title', '(no title)')[:60]}")
        for dup in duplicates:
            print(f"  REMOVE: {dup['id']} - {dup.get('title', '(no title)')[:60]}")
            ids_to_remove.add(dup["id"])

    print()
    print("=" * 80)
    print(f"Summary:")
    print(f"  Duplicate URL groups found: {len(duplicate_groups)}")
    print(f"  newspapers.com groups skipped: {skipped_newspapers}")
    print(f"  Groups deduplicated: {len(duplicate_groups) - skipped_newspapers}")
    print(f"  Records to remove: {len(ids_to_remove)}")
    print("=" * 80)

    if not ids_to_remove:
        print("\nNo duplicates to remove. Exiting.")
        return

    # Create backup
    shutil.copy2(CSV_PATH, BACKUP_PATH)
    print(f"\nBackup created: {BACKUP_PATH}")

    # Filter out duplicates
    cleaned_records = [r for r in records if r["id"] not in ids_to_remove]

    print(f"Records before: {len(records)}")
    print(f"Records after:  {len(cleaned_records)}")
    print(f"Removed:        {len(records) - len(cleaned_records)}")

    # Write cleaned CSV
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(cleaned_records)

    print(f"\nCleaned CSV written to: {CSV_PATH}")
    print("Done.")


if __name__ == "__main__":
    main()
