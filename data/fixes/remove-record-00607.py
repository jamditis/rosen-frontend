#!/usr/bin/env python3
"""Apply the curator-approved removal of the duplicate record from issue #591."""

import csv
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DATA_DIR))

from csv_safe_write import atomic_csv_write  # noqa: E402


RECORDS_PATH = DATA_DIR / "archive_records-public.csv"
RELATIONSHIPS_PATH = DATA_DIR / "extracted_relationships.csv"
ENTITIES_PATH = DATA_DIR / "extracted_entities.csv"
DROP_ID = "RECORD-00607"


def read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        return reader.fieldnames, list(reader)


def write_csv(path, fieldnames, rows):
    with atomic_csv_write(path) as destination:
        writer = csv.DictWriter(
            destination,
            fieldnames=fieldnames,
            lineterminator="\r\n",
        )
        writer.writeheader()
        writer.writerows(rows)


def main():
    fieldnames, rows = read_csv(RECORDS_PATH)

    matches = [row for row in rows if row.get("id") == DROP_ID]
    if len(matches) > 1:
        raise RuntimeError(f"Expected one {DROP_ID} row, found {len(matches)}")

    kept = []
    related_updates = 0
    for row in rows:
        if row.get("id") == DROP_ID:
            continue
        related = [part.strip() for part in row.get("related_to", "").split(",")]
        filtered = [record_id for record_id in related if record_id and record_id != DROP_ID]
        if filtered != [record_id for record_id in related if record_id]:
            row["related_to"] = ", ".join(filtered)
            related_updates += 1
        kept.append(row)

    if matches:
        write_csv(RECORDS_PATH, fieldnames, kept)

    relationship_fields, relationships = read_csv(RELATIONSHIPS_PATH)
    removed_relationship_rows = [
        row for row in relationships if row.get("source_record_id") == DROP_ID
    ]
    kept_relationships = [
        row for row in relationships if row.get("source_record_id") != DROP_ID
    ]
    removed_relationships = len(relationships) - len(kept_relationships)
    if removed_relationships:
        write_csv(RELATIONSHIPS_PATH, relationship_fields, kept_relationships)

    removed_entity_ids = {
        entity_id
        for row in removed_relationship_rows
        for entity_id in (row.get("source_entity_id"), row.get("target_entity_id"))
        if entity_id
    }
    retained_entity_ids = {
        entity_id
        for row in kept_relationships
        for entity_id in (row.get("source_entity_id"), row.get("target_entity_id"))
        if entity_id
    }
    orphaned_entity_ids = removed_entity_ids - retained_entity_ids

    entity_fields, entities = read_csv(ENTITIES_PATH)
    kept_entities = [
        entity for entity in entities
        if entity.get("entity_id") not in orphaned_entity_ids
    ]
    removed_entities = len(entities) - len(kept_entities)
    if removed_entities:
        write_csv(ENTITIES_PATH, entity_fields, kept_entities)

    print(
        f"Migrated {DROP_ID}; records removed {len(matches)}; "
        f"cleaned {related_updates} related_to field(s); "
        f"relationships removed {removed_relationships}; "
        f"orphaned entities removed {removed_entities}"
    )


if __name__ == "__main__":
    main()
