#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Apply manual publication-date overrides to the archive CSV.

This is the CSV half of the backfill package. The sheet-based strategies in
``date_backfill.py`` infer dates from a URL or a page. This script does not
infer anything: it writes a small table of hand-checked dates for records whose
source has no machine-readable date at all.

Only records with an empty ``publication_date`` are touched, and only when the
record id appears in ``KNOWN_DATES``. An entry mapped to an empty string is a
deliberate "leave this record undated" note, not a value to write.

Run it from ``backend/``::

    poetry run python -m scripts.backfill.backfill_missing_dates
"""

import csv
import shutil
from datetime import datetime
from pathlib import Path

# Repository root: backend/scripts/backfill/ -> backend/scripts -> backend -> repo.
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CSV = REPO_ROOT / "data" / "archive_records-public.csv"

# Manual date overrides for known records.
KNOWN_DATES = {
    # "What Are Journalists For?" book - published 1999.
    "RECORD-00068": "1999-01-01",  # Goodreads page
    "RECORD-00069": "1999-01-01",  # AbeBooks listing
    # Edge.org bio and Studio 20 pages are ongoing profile pages. An empty
    # value records the decision to leave them undated.
    "RECORD-00072": "",  # Edge.org bio - profile page, no specific date
    "RECORD-00085": "",  # Studio 20 program - ongoing program, no specific date
}


def backfill_dates(csv_path: Path) -> int:
    """Write the known-date overrides into ``csv_path``. Returns the row count."""
    records = []
    updated_count = 0

    with open(csv_path, "r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames

        for row in reader:
            record_id = row["id"]
            new_date = KNOWN_DATES.get(record_id)
            if new_date and not row.get("publication_date"):
                row["publication_date"] = new_date
                updated_count += 1
                print(f"[SUCCESS] {record_id}: set date to {new_date}")
            records.append(row)

    if updated_count == 0:
        print("No dates to backfill.")
        return 0

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = csv_path.parent / f"{csv_path.stem}_backup_{timestamp}.csv"
    shutil.copy2(csv_path, backup_path)
    print(f"\n[BACKUP] Created {backup_path.name}")

    with open(csv_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)

    print(f"[SUCCESS] Updated {updated_count} records")
    return updated_count


def main() -> None:
    print("=" * 60)
    print("BACKFILL MISSING PUBLICATION DATES")
    print("=" * 60)
    print()

    updated = backfill_dates(DEFAULT_CSV)

    print()
    print("=" * 60)
    print(f"BACKFILL COMPLETE: {updated} dates added")
    print("=" * 60)


if __name__ == "__main__":
    main()
