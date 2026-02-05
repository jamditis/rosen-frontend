"""
Remove duplicate relationships from extracted_relationships.csv.

Duplicates are identified by matching on:
  source_entity_id, target_entity_id, relationship_type, source_record_id

Keeps the first occurrence and removes the rest.
"""

import csv
import shutil
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
INPUT_FILE = DATA_DIR / "extracted_relationships.csv"
BACKUP_FILE = DATA_DIR / "extracted_relationships.csv.backup-dedup"

DEDUP_COLUMNS = [
    "source_entity_id",
    "target_entity_id",
    "relationship_type",
    "source_record_id",
]


def main():
    # Read all rows
    with open(INPUT_FILE, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    total_before = len(rows)
    print(f"Total relationships before dedup: {total_before}")

    # Create backup
    shutil.copy2(INPUT_FILE, BACKUP_FILE)
    print(f"Backup created: {BACKUP_FILE}")

    # Deduplicate: keep first occurrence per key
    seen = set()
    kept = []
    duplicates_by_key = {}

    for row in rows:
        key = tuple(row[col] for col in DEDUP_COLUMNS)
        if key in seen:
            duplicates_by_key.setdefault(key, 0)
            duplicates_by_key[key] += 1
        else:
            seen.add(key)
            kept.append(row)

    total_after = len(kept)
    duplicates_removed = total_before - total_after
    duplicate_groups = len(duplicates_by_key)

    # Write cleaned CSV
    with open(INPUT_FILE, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(kept)

    # Print report
    print()
    print("=" * 60)
    print("DEDUPLICATION REPORT")
    print("=" * 60)
    print(f"Rows before:        {total_before:,}")
    print(f"Rows after:         {total_after:,}")
    print(f"Duplicates removed: {duplicates_removed}")
    print(f"Duplicate groups:   {duplicate_groups}")
    print()

    if duplicates_by_key:
        print("Duplicate groups (showing key columns and excess count):")
        print("-" * 60)
        for key, count in sorted(duplicates_by_key.items()):
            src_entity, tgt_entity, rel_type, src_record = key
            print(
                f"  {src_record} | {src_entity} --[{rel_type}]--> {tgt_entity}"
                f"  ({count} extra)"
            )
    else:
        print("No duplicates found.")

    print()
    print(f"Cleaned file: {INPUT_FILE}")
    print(f"Backup file:  {BACKUP_FILE}")


if __name__ == "__main__":
    main()
