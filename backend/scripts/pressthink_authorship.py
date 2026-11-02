#!/usr/bin/env python3
"""Link newly admitted PressThink works to their verified public author."""

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "data"))
from csv_safe_write import read_archive_csv, write_archive_csv


def add_authorship(
    additions, records, entities, relationships, entity_columns, rel_columns
):
    """Create only source-supported Work -> Person assertions, with stable IDs."""
    authors = [
        e
        for e in entities
        if e["entity_id"] == "P0005"
        and e["entity_type"] == "Person"
        and e["entity_name"] == "Jay Rosen"
    ]
    if len(authors) != 1:
        raise ValueError("Jay Rosen's canonical author entity is ambiguous or absent")
    author = authors[0]
    by_id = {row["id"]: row for row in records}
    next_work = max(
        (
            int(e["entity_id"][1:])
            for e in entities
            if re.fullmatch(r"W\d+", e["entity_id"])
        ),
        default=0,
    )
    output_entities = [dict(e) for e in entities]
    output_relationships = [dict(r) for r in relationships]
    for addition in additions:
        row = by_id[addition["record_id"]]
        if (
            row["author"] != "Jay Rosen"
            or row["url"] != addition["url"]
            or row["title"] != addition["title"]
            or not row["notes"].startswith("PressThink API managed source; post id: ")
        ):
            raise ValueError("PressThink authorship proposal does not match its source row")
        relationship_id = row["id"] + "_REL_001"
        existing = [
            r for r in output_relationships if r["relationship_id"] == relationship_id
        ]
        if existing:
            if (
                existing[0]["source_record_id"] != row["id"]
                or existing[0]["relationship_type"] != "Authored By"
                or existing[0]["target_entity_id"] != author["entity_id"]
            ):
                raise ValueError(
                    "PressThink authorship identity conflicts with an existing edge"
                )
            continue
        next_work += 1
        work_id = f"W{next_work:04d}"
        entity = {column: "" for column in entity_columns}
        entity.update(
            entity_id=work_id,
            entity_type="Work",
            entity_name=row["title"],
            normalized_name=row["title"],
            role_or_description="PressThink article",
            prominence_score="1",
            first_mention_record_id=row["id"],
            total_mentions="1",
            notes="Public PressThink title and author metadata: " + row["url"],
        )
        relationship = {column: "" for column in rel_columns}
        relationship.update(
            relationship_id=relationship_id,
            source_record_id=row["id"],
            source_entity_id=work_id,
            source_entity_name=row["title"],
            relationship_type="Authored By",
            target_entity_id=author["entity_id"],
            target_entity_name=author["entity_name"],
            context_snippet="Public PressThink author metadata: Jay Rosen. " + row["url"],
            confidence_score="1",
            extracted_date=dt.date.today().isoformat(),
        )
        output_entities.append(entity)
        output_relationships.append(relationship)
    return output_entities, output_relationships


def run(report, *, data_dir=None):
    data_dir = data_dir or ROOT / "data"
    additions = report["proposed_additions"]
    if not additions:
        return
    _, records = read_archive_csv(data_dir / "archive_records-public.csv")
    entity_columns, entities = read_archive_csv(data_dir / "extracted_entities.csv")
    rel_columns, relationships = read_archive_csv(data_dir / "extracted_relationships.csv")
    new_entities, new_relationships = add_authorship(
        additions, records, entities, relationships, entity_columns, rel_columns
    )
    write_archive_csv(data_dir / "extracted_entities.csv", entity_columns, new_entities)
    write_archive_csv(
        data_dir / "extracted_relationships.csv", rel_columns, new_relationships
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    run(json.loads(args.report.read_text(encoding="utf-8")))
