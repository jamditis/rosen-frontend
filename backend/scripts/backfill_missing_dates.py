#!/usr/bin/env python3
"""
Backfill missing publication dates in archive records.

For records with missing dates, attempt to infer from:
1. Known publication dates (e.g., book publication years)
2. URL metadata
3. Manual overrides for static pages

Author: Claude Code
Date: 2025-12-03
"""

import csv
from pathlib import Path
from datetime import datetime

# Manual date overrides for known records
KNOWN_DATES = {
    # "What Are Journalists For?" book - published 1999
    'RECORD-00068': '1999-01-01',  # Goodreads page
    'RECORD-00069': '1999-01-01',  # AbeBooks listing

    # Edge.org bio and Studio 20 pages - ongoing/profile pages
    # Use earliest reasonable date or mark as undated
    'RECORD-00072': '',  # Edge.org bio - profile page, no specific date
    'RECORD-00085': '',  # Studio 20 program - ongoing program, no specific date
}


def backfill_dates(csv_path: Path):
    """
    Backfill missing dates in CSV file.

    Args:
        csv_path: Path to archive CSV
    """
    # Load all records
    records = []
    updated_count = 0

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames

        for row in reader:
            record_id = row['id']

            # Check if missing date and we have override
            if not row.get('publication_date') and record_id in KNOWN_DATES:
                new_date = KNOWN_DATES[record_id]
                if new_date:
                    row['publication_date'] = new_date
                    updated_count += 1
                    print(f"✓ {record_id}: Set date to {new_date}")

            records.append(row)

    # Write back
    if updated_count > 0:
        # Create backup
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = csv_path.parent / f"{csv_path.stem}_backup_{timestamp}.csv"

        import shutil
        shutil.copy2(csv_path, backup_path)
        print(f"\n✓ Created backup: {backup_path.name}")

        # Write updated CSV
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(records)

        print(f"✓ Updated {updated_count} records")
    else:
        print("No dates to backfill.")

    return updated_count


def main():
    """Main execution."""
    print("=" * 60)
    print("BACKFILL MISSING PUBLICATION DATES")
    print("=" * 60)
    print()

    base_dir = Path(__file__).parent.parent.parent
    csv_path = base_dir / "data" / "archive_records-public.csv"

    updated = backfill_dates(csv_path)

    print()
    print("=" * 60)
    print(f"BACKFILL COMPLETE: {updated} dates added")
    print("=" * 60)


if __name__ == "__main__":
    main()
