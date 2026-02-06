"""
Fix generic author references in summaries and excerpts.

Replaces patterns like "The author argues..." with "Rosen argues..."
in summary and excerpt fields, but ONLY when the record's author is Jay Rosen.

Also fixes:
- "This article discusses..." -> "Rosen discusses..." (in summary/excerpt only)
- "the article discusses..." -> "the piece discusses..." or similar
- "the piece discusses..." -> better phrasing
"""

import csv
import re
from pathlib import Path

CSV_PATH = Path(__file__).parent / "archive_records-public.csv"

# Patterns to fix in summary and excerpt fields
# Only applied when author contains "Jay Rosen" or is "Rosen"
REPLACEMENTS = [
    # "The author" at start of sentence
    (r'\bThe author\b', 'Rosen'),
    (r'\bthe author\b', 'Rosen'),
    # "This article" at start of summary
    (r'^This article\b', 'Rosen'),
    # "This article" mid-sentence
    (r'\bThis article\b', 'This piece'),
    (r'\bthe article\b', 'the piece'),
    # "The essay" pattern
    (r'\bThe essay\b', 'Rosen\'s essay'),
    (r'\bthe essay\b', 'Rosen\'s essay'),
    # "The post" pattern
    (r'\bThe post\b', 'Rosen\'s post'),
    (r'\bthe post\b', 'Rosen\'s post'),
    # "The blog post" pattern
    (r'\bThe blog post\b', 'Rosen\'s blog post'),
    (r'\bthe blog post\b', 'Rosen\'s blog post'),
]

FIELDS_TO_FIX = ['summary', 'excerpt']


def is_rosen_authored(row):
    author = (row.get('author', '') or '').strip().lower()
    return 'jay rosen' in author or author == 'rosen'


def fix_text(text):
    if not text:
        return text, 0
    changes = 0
    for pattern, replacement in REPLACEMENTS:
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
    total_field_changes = 0
    examples = []

    for row in rows:
        if not is_rosen_authored(row):
            continue

        record_changed = False
        for field in FIELDS_TO_FIX:
            old_value = row.get(field, '')
            if not old_value:
                continue
            new_value, changes = fix_text(old_value)
            if changes > 0:
                row[field] = new_value
                total_field_changes += changes
                record_changed = True
                if len(examples) < 5:
                    old_preview = old_value[:100].replace('\n', ' ')
                    new_preview = new_value[:100].replace('\n', ' ')
                    examples.append((row.get('id', '?'), field, old_preview, new_preview))

        if record_changed:
            total_records_fixed += 1

    print(f"\n  Records modified: {total_records_fixed}")
    print(f"  Total field changes: {total_field_changes}")

    if examples:
        print(f"\n  Examples (first {len(examples)}):")
        for rid, field, old, new in examples:
            print(f"    {rid} [{field}]:")
            print(f"      OLD: {old}")
            print(f"      NEW: {new}")

    print(f"\n  Writing {CSV_PATH}...")
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print("  Done!")


if __name__ == "__main__":
    main()
