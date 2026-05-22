#!/usr/bin/env python3
"""
Prune orphaned entity and relationship references from the extraction CSVs.

When records are removed from archive_records-public.csv (for example by
dedup_records.py) the entity and relationship extractions that pointed at them
are left behind:

  - extracted_relationships.csv keeps rows whose source_record_id no longer
    exists, and
  - extracted_entities.csv keeps entities whose first_mention_record_id points
    at a removed record.

That carries into the published archive-entities.json as dead "first mentioned
in" links. This module removes the stale relationship rows and repoints each
affected entity's first_mention_record_id to the earliest record it still
genuinely appears in — or clears it when no valid record remains.

Run standalone to clean the current data:

    python3 data/prune_orphan_references.py

Or call prune_orphan_references() right after a record removal. dedup_records.py
does this so the three CSVs never drift apart again. See issue #144.

This supersedes data/fixes/fix-orphan-entities.js, which detected orphans from
a hardcoded ID list and only repointed entities (it never pruned the
relationship rows, and it could not be called from the Python dedup flow).
"""

import csv
from pathlib import Path

from csv_safe_write import atomic_csv_write

DATA_DIR = Path(__file__).parent
RECORDS_PATH = DATA_DIR / "archive_records-public.csv"
RELATIONSHIPS_PATH = DATA_DIR / "extracted_relationships.csv"
ENTITIES_PATH = DATA_DIR / "extracted_entities.csv"


def _read_csv(path):
    """Read a CSV into (fieldnames, list-of-row-dicts)."""
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return reader.fieldnames, list(reader)


def _write_csv(path, fieldnames, rows):
    """Atomically rewrite a CSV (see data/csv_safe_write.py)."""
    with atomic_csv_write(path) as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def prune_orphan_references(records_path=RECORDS_PATH,
                            relationships_path=RELATIONSHIPS_PATH,
                            entities_path=ENTITIES_PATH):
    """Prune orphaned relationship rows and repoint orphaned entity references.

    Returns a summary dict. The relationship and entity CSVs are rewritten only
    when something actually changed.
    """
    _, record_rows = _read_csv(records_path)
    valid_ids = {r["id"] for r in record_rows if r.get("id")}
    # Publication date per record, used to choose a sensible replacement
    # "first mention" — the earliest record an entity genuinely appears in.
    record_date = {r["id"]: (r.get("publication_date") or "")
                   for r in record_rows if r.get("id")}

    rel_fields, rel_rows = _read_csv(relationships_path)
    ent_fields, ent_rows = _read_csv(entities_path)

    # Map each entity to the still-valid records it appears in — either side
    # of a relationship whose source_record_id is a real record.
    entity_records = {}
    for rel in rel_rows:
        rec = rel.get("source_record_id")
        if rec not in valid_ids:
            continue
        for ent in (rel.get("source_entity_id"), rel.get("target_entity_id")):
            if ent:
                entity_records.setdefault(ent, set()).add(rec)

    def earliest_record(record_ids):
        """Earliest record by publication date; record id breaks ties.

        A missing date sorts last ('~' is above every digit and '-'), so a
        dated record is always preferred over an undated one.
        """
        return min(record_ids,
                   key=lambda rid: (record_date.get(rid) or "~", rid))

    # Prune relationship rows whose source record no longer exists.
    kept_rel = [r for r in rel_rows if r.get("source_record_id") in valid_ids]
    pruned_rel = len(rel_rows) - len(kept_rel)

    # Repoint or clear first_mention_record_id when it is an orphan.
    repointed = nulled = 0
    for ent in ent_rows:
        ref = ent.get("first_mention_record_id")
        if not ref or ref in valid_ids:
            continue
        candidates = entity_records.get(ent.get("entity_id"))
        if candidates:
            ent["first_mention_record_id"] = earliest_record(candidates)
            repointed += 1
        else:
            ent["first_mention_record_id"] = ""
            nulled += 1

    if pruned_rel:
        _write_csv(relationships_path, rel_fields, kept_rel)
    if repointed or nulled:
        _write_csv(entities_path, ent_fields, ent_rows)

    return {
        "pruned_relationships": pruned_rel,
        "repointed_entities": repointed,
        "nulled_entities": nulled,
        "relationships_remaining": len(kept_rel),
    }


def main():
    print("Pruning orphaned entity and relationship references...")
    summary = prune_orphan_references()
    print(f"  Relationship rows pruned : {summary['pruned_relationships']}")
    print(f"  Entity refs repointed    : {summary['repointed_entities']}")
    print(f"  Entity refs cleared      : {summary['nulled_entities']}")
    print(f"  Relationship rows kept   : {summary['relationships_remaining']}")
    print("Done.")


if __name__ == "__main__":
    main()
