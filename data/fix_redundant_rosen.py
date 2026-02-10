"""
Fix redundant "Rosen discusses Jay Rosen's..." patterns created by the previous fix.
Also fix "Rosen discusses Rosen's..." if any.
"""

import csv
import re
from pathlib import Path

CSV_PATH = Path(__file__).parent / "archive_records-public.csv"

FIELDS_TO_FIX = ['summary', 'excerpt']

PATTERNS = [
    # "Rosen discusses Jay Rosen's" -> "Rosen discusses his"
    (r"Rosen (discusses|examines|analyzes|explores|argues|critiques|reflects on|addresses|describes|reviews|outlines|presents) Jay Rosen's", r"Rosen \1 his"),
    # "Rosen ... Jay Rosen" in same sentence (possessive)
    (r"Rosen's (.*?) Jay Rosen", r"Rosen's \1 he"),
]


def fix_text(text):
    if not text:
        return text, 0
    changes = 0
    for pattern, replacement in PATTERNS:
        new_text = re.sub(pattern, replacement, text)
        if new_text != text:
            changes += 1
            text = new_text
    return text, changes


def main():
    print(f"Reading {CSV_PATH}...")

    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    print(f"  Loaded {len(rows)} records")

    total_records_fixed = 0
    total_changes = 0

    for row in rows:
        record_changed = False
        for field in FIELDS_TO_FIX:
            old_value = row.get(field, '')
            if not old_value:
                continue
            new_value, changes = fix_text(old_value)
            if changes > 0:
                rid = row.get('id', '?')
                old_preview = old_value[:120].replace('\n', ' ')
                new_preview = new_value[:120].replace('\n', ' ')
                print(f"  {rid} [{field}]: {old_preview}")
                print(f"    -> {new_preview}")
                row[field] = new_value
                total_changes += changes
                record_changed = True

        if record_changed:
            total_records_fixed += 1

    print(f"\n  Records modified: {total_records_fixed}")
    print(f"  Total changes: {total_changes}")

    if total_changes > 0:
        print(f"\n  Writing {CSV_PATH}...")
        with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        print("  Done!")
    else:
        print("  No changes needed.")


if __name__ == "__main__":
    main()
