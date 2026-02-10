"""
Fix remaining P0 issues:
1. RECORD-00092 - Prompt leak in responds_to field
2. RECORD-00023 - "The New York Treview" typo
"""

import csv
from pathlib import Path

CSV_PATH = Path(__file__).parent / "archive_records-public.csv"

FIXES = {
    "RECORD-00092": {
        "responds_to": "",  # Clear the prompt leak
    },
    "RECORD-00023": {
        "original_publication": "The New York Review of Books",
        "publisher": "The New York Review of Books",
    },
}


def main():
    print(f"Reading {CSV_PATH}...")

    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    print(f"  Loaded {len(rows)} records")

    fixed_count = 0
    for row in rows:
        record_id = row.get("id", "")
        if record_id in FIXES:
            fixes = FIXES[record_id]
            print(f"\n  Fixing {record_id}: {row.get('title', '?')[:60]}...")
            for field, new_value in fixes.items():
                old_value = row.get(field, "")
                old_preview = old_value[:80].replace("\n", " ") if old_value else "(empty)"
                new_preview = new_value[:80].replace("\n", " ") if new_value else "(cleared)"
                print(f"    {field}: {old_preview}")
                print(f"         -> {new_preview}")
                row[field] = new_value
            fixed_count += 1

    print(f"\n  Fixed {fixed_count} / {len(FIXES)} records")

    print(f"\n  Writing {CSV_PATH}...")
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print("  Done!")


if __name__ == "__main__":
    main()
