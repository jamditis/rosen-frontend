#!/usr/bin/env python3
"""
Entity Deduplication and Cross-Record Connection System

Cleans up extracted_entities.csv and extracted_relationships.csv by:
1. Removing junk entities (stubs, parsing artifacts, overly long names)
2. Normalizing entity names
3. Merging duplicates within same type
4. Cross-type merging (same name as Concept + Work → Concept)
5. Updating relationship IDs to canonical IDs
6. Removing duplicate relationships
7. Recalculating totalMentions from actual relationship data

Usage:
    python backend/scripts/deduplicate_entities.py
    python backend/scripts/deduplicate_entities.py --dry-run
"""

import csv
import re
import shutil
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
ENTITIES_CSV = DATA_DIR / "extracted_entities.csv"
RELATIONSHIPS_CSV = DATA_DIR / "extracted_relationships.csv"

ENTITY_FIELDS = [
    "entity_id", "entity_type", "entity_name", "normalized_name",
    "role_or_description", "affiliation", "prominence_score",
    "first_mention_record_id", "total_mentions", "related_entities", "notes"
]

REL_FIELDS = [
    "relationship_id", "source_record_id", "source_entity_id",
    "source_entity_name", "relationship_type", "target_entity_id",
    "target_entity_name", "context_snippet", "confidence_score",
    "extracted_date"
]


def normalize_name(name: str) -> str:
    """Normalize an entity name for dedup matching."""
    s = name.strip().lower()
    # Remove surrounding quotes
    s = s.strip('"').strip("'")
    # Remove leading "the "
    s = re.sub(r"^the\s+", "", s)
    # Remove trailing parentheticals like (concept), (book), (organization)
    s = re.sub(r"\s*\((?:concept|book|organization|person|work|event|movement|journal|magazine|newspaper|blog|website|term|idea|theory|phrase|slogan|principle|model|framework|approach|method|practice|project|program|initiative|campaign|film|tv show|podcast|documentary|report|article|essay|column|speech|lecture|talk|paper|study|survey|poll|award|prize|index|platform|app|tool|service|network|group|coalition|alliance|consortium|institute|center|foundation|association|society|committee|board|council|agency|department|bureau|office|division|branch|unit|team|section|desk)s?\)\s*$", "", s)
    # Collapse multiple spaces
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def is_junk_entity(entity: dict) -> tuple[bool, str]:
    """Check if an entity should be removed. Returns (is_junk, reason)."""
    name = entity["entity_name"].strip()
    role = entity.get("role_or_description", "")

    # Auto-generated stubs
    if "[Auto-generated stub" in role:
        return True, "auto-generated stub"

    # Parsing artifacts: names ending with punctuation fragments
    if re.match(r'^.{1,5}["\']$', name):
        return True, "parsing artifact (short with trailing quote)"

    # Names that are just punctuation or whitespace
    if not re.sub(r'[^\w]', '', name):
        return True, "empty/punctuation-only name"

    # Overly long names (full sentences, not real entity names)
    if len(name) > 80:
        return True, f"name too long ({len(name)} chars)"

    # Single-character names
    if len(name.strip()) <= 1:
        return True, "single character name"

    return False, ""


def load_entities() -> list[dict]:
    """Load entities CSV."""
    entities = []
    with open(ENTITIES_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            entities.append(row)
    return entities


def load_relationships() -> list[dict]:
    """Load relationships CSV."""
    rels = []
    with open(RELATIONSHIPS_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rels.append(row)
    return rels


def pick_best_description(group: list[dict]) -> str:
    """Pick the best role_or_description from a group of entities."""
    candidates = []
    for e in group:
        desc = e.get("role_or_description", "").strip()
        if desc and "[Auto-generated stub" not in desc and desc.lower() != "none":
            candidates.append(desc)
    if not candidates:
        return ""
    # Return longest non-stub description
    return max(candidates, key=len)


def deduplicate(dry_run: bool = False):
    """Main deduplication logic."""
    print("=" * 60)
    print("Entity deduplication and cross-record connection system")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Dry run: {dry_run}")
    print()

    # Load data
    entities = load_entities()
    relationships = load_relationships()
    print(f"Loaded {len(entities)} entities, {len(relationships)} relationships")
    print()

    # ── Step 1: Remove junk entities ──────────────────────────
    print("Step 1: Removing junk entities...")
    junk_reasons = defaultdict(int)
    junk_ids = set()
    clean_entities = []

    for e in entities:
        is_junk, reason = is_junk_entity(e)
        if is_junk:
            junk_ids.add(e["entity_id"])
            junk_reasons[reason] += 1
        else:
            clean_entities.append(e)

    print(f"  Removed {len(junk_ids)} junk entities:")
    for reason, count in sorted(junk_reasons.items(), key=lambda x: -x[1]):
        print(f"    {reason}: {count}")
    print(f"  Remaining: {len(clean_entities)}")
    print()

    # ── Step 2: Normalize names ───────────────────────────────
    print("Step 2: Normalizing names...")
    for e in clean_entities:
        e["_normalized"] = normalize_name(e["entity_name"])
    print(f"  Normalized {len(clean_entities)} entity names")
    print()

    # ── Step 3: Group by (normalized_name, entity_type) ───────
    print("Step 3: Merging duplicates within same type...")
    groups = defaultdict(list)
    for e in clean_entities:
        key = (e["_normalized"], e["entity_type"])
        groups[key].append(e)

    # Build ID mapping: old_id → canonical_id
    id_map = {}  # old_id → canonical_id
    merged_entities = []
    merge_count = 0

    for (norm_name, etype), group in groups.items():
        if len(group) == 1:
            canonical = group[0]
            id_map[canonical["entity_id"]] = canonical["entity_id"]
            merged_entities.append(canonical)
            continue

        # Multiple entities with same normalized name + type
        merge_count += len(group) - 1

        # Pick canonical: highest prominence_score
        group.sort(key=lambda e: int(e.get("prominence_score", 0) or 0), reverse=True)
        canonical = group[0]

        # Map all IDs to canonical
        for e in group:
            id_map[e["entity_id"]] = canonical["entity_id"]

        # Merge totalMentions (will be recalculated later, but sum for now)
        total = sum(int(e.get("total_mentions", 1) or 1) for e in group)
        canonical["total_mentions"] = str(total)

        # Pick best description
        best_desc = pick_best_description(group)
        if best_desc:
            canonical["role_or_description"] = best_desc

        # Use the most presentable name (original case from highest prominence)
        canonical["normalized_name"] = norm_name

        merged_entities.append(canonical)

    print(f"  Found {sum(1 for g in groups.values() if len(g) > 1)} duplicate groups")
    print(f"  Merged {merge_count} duplicate entities")
    print(f"  Entities after merge: {len(merged_entities)}")
    print()

    # Show top duplicate groups
    dup_groups = [(k, v) for k, v in groups.items() if len(v) > 1]
    dup_groups.sort(key=lambda x: -len(x[1]))
    if dup_groups:
        print("  Top 10 duplicate groups:")
        for (norm, etype), group in dup_groups[:10]:
            ids = [e["entity_id"] for e in group]
            print(f"    \"{norm}\" ({etype}): {len(group)} entities -> {ids[0]} [IDs: {', '.join(ids)}]")
        print()

    # ── Step 4: Cross-type merge ──────────────────────────────
    print("Step 4: Cross-type merging (same name, different types)...")
    name_groups = defaultdict(list)
    for e in merged_entities:
        name_groups[e["_normalized"]].append(e)

    cross_merge_count = 0
    final_entities = []

    # Type priority: Concept > Person > Organization > Work > Event > Location
    TYPE_PRIORITY = {
        "Concept": 0, "Person": 1, "Organization": 2,
        "Work": 3, "Event": 4, "Location": 5
    }

    for norm_name, group in name_groups.items():
        if len(group) == 1:
            final_entities.append(group[0])
            continue

        types_present = set(e["entity_type"] for e in group)

        # Only merge if Concept+Work overlap (the most common case)
        # Don't merge Person+Organization or other dissimilar types
        if types_present == {"Concept", "Work"}:
            # Merge into Concept
            group.sort(key=lambda e: TYPE_PRIORITY.get(e["entity_type"], 99))
            canonical = group[0]

            for e in group[1:]:
                id_map[e["entity_id"]] = canonical["entity_id"]
                cross_merge_count += 1

            best_desc = pick_best_description(group)
            if best_desc:
                canonical["role_or_description"] = best_desc

            final_entities.append(canonical)
        else:
            # Keep all as separate entities
            for e in group:
                final_entities.append(e)

    print(f"  Cross-type merges (Concept+Work): {cross_merge_count}")
    print(f"  Entities after cross-type merge: {len(final_entities)}")
    print()

    # ── Step 5: Update relationships ──────────────────────────
    print("Step 5: Updating relationship entity IDs...")

    updated_rels = []
    removed_junk_refs = 0
    updated_id_count = 0

    for rel in relationships:
        src_id = rel["source_entity_id"]
        tgt_id = rel["target_entity_id"]

        # Map to canonical IDs
        new_src = id_map.get(src_id, src_id)
        new_tgt = id_map.get(tgt_id, tgt_id)

        # Skip if either entity was junk (removed in step 1) and not mapped
        if src_id in junk_ids and src_id not in id_map:
            removed_junk_refs += 1
            continue
        if tgt_id in junk_ids and tgt_id not in id_map:
            removed_junk_refs += 1
            continue

        if new_src != src_id or new_tgt != tgt_id:
            updated_id_count += 1

        rel["source_entity_id"] = new_src
        rel["target_entity_id"] = new_tgt

        # Update entity names to match canonical
        for e in final_entities:
            if e["entity_id"] == new_src:
                rel["source_entity_name"] = e["entity_name"]
                break
        for e in final_entities:
            if e["entity_id"] == new_tgt:
                rel["target_entity_name"] = e["entity_name"]
                break

        updated_rels.append(rel)

    print(f"  Updated {updated_id_count} entity ID references")
    print(f"  Removed {removed_junk_refs} relationships referencing junk entities")
    print()

    # Remove duplicate relationships (same record + source + target + type)
    print("  Removing duplicate relationships...")
    seen_rels = set()
    deduped_rels = []
    dup_rel_count = 0

    for rel in updated_rels:
        key = (
            rel["source_record_id"],
            rel["source_entity_id"],
            rel["target_entity_id"],
            rel["relationship_type"]
        )
        if key in seen_rels:
            dup_rel_count += 1
            continue
        seen_rels.add(key)
        deduped_rels.append(rel)

    print(f"  Removed {dup_rel_count} duplicate relationships")
    print(f"  Relationships after cleanup: {len(deduped_rels)}")
    print()

    # ── Step 6: Recalculate totalMentions ─────────────────────
    print("Step 6: Recalculating totalMentions from relationships...")

    entity_records = defaultdict(set)  # entity_id → set of record_ids
    for rel in deduped_rels:
        record_id = rel["source_record_id"]
        entity_records[rel["source_entity_id"]].add(record_id)
        entity_records[rel["target_entity_id"]].add(record_id)

    mentions_updated = 0
    for e in final_entities:
        eid = e["entity_id"]
        actual_mentions = len(entity_records.get(eid, set()))
        old_mentions = int(e.get("total_mentions", 1) or 1)
        if actual_mentions > 0:
            e["total_mentions"] = str(actual_mentions)
            if actual_mentions != old_mentions:
                mentions_updated += 1
        # If no relationships reference this entity, keep total_mentions as-is

    print(f"  Updated totalMentions for {mentions_updated} entities")

    # Show top entities by mention count
    by_mentions = sorted(final_entities, key=lambda e: int(e["total_mentions"] or 1), reverse=True)
    print()
    print("  Top 20 entities by cross-record mentions:")
    for e in by_mentions[:20]:
        mentions = int(e["total_mentions"])
        print(f"    {e['entity_name']} ({e['entity_type']}): {mentions} records -{e['entity_id']}")
    print()

    # Count entities with >1 mention (cross-record connections)
    multi_mention = sum(1 for e in final_entities if int(e.get("total_mentions", 1)) > 1)
    single_mention = len(final_entities) - multi_mention
    print(f"  Entities appearing in >1 record: {multi_mention}")
    print(f"  Entities appearing in 1 record: {single_mention}")
    print()

    # ── Step 7: Write cleaned CSVs ────────────────────────────
    if dry_run:
        print("DRY RUN -no files written")
    else:
        print("Step 7: Writing cleaned CSVs...")

        # Backup originals
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        entities_backup = ENTITIES_CSV.with_suffix(f".csv.backup-dedup-{timestamp}")
        rels_backup = RELATIONSHIPS_CSV.with_suffix(f".csv.backup-dedup-{timestamp}")

        shutil.copy2(ENTITIES_CSV, entities_backup)
        shutil.copy2(RELATIONSHIPS_CSV, rels_backup)
        print("  Backed up to:")
        print(f"    {entities_backup.name}")
        print(f"    {rels_backup.name}")

        # Clean up temp fields
        for e in final_entities:
            e.pop("_normalized", None)

        # Write entities
        with open(ENTITIES_CSV, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=ENTITY_FIELDS)
            writer.writeheader()
            for e in final_entities:
                # Only write known fields
                row = {k: e.get(k, "") for k in ENTITY_FIELDS}
                writer.writerow(row)

        # Write relationships
        with open(RELATIONSHIPS_CSV, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=REL_FIELDS)
            writer.writeheader()
            for rel in deduped_rels:
                row = {k: rel.get(k, "") for k in REL_FIELDS}
                writer.writerow(row)

        print(f"  Wrote {len(final_entities)} entities to {ENTITIES_CSV.name}")
        print(f"  Wrote {len(deduped_rels)} relationships to {RELATIONSHIPS_CSV.name}")

    # ── Summary ───────────────────────────────────────────────
    print()
    print("=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"  Entities:  {len(entities)} -> {len(final_entities)} ({len(entities) - len(final_entities)} removed)")
    print(f"    Junk removed:      {len(junk_ids)}")
    print(f"    Same-type merges:  {merge_count}")
    print(f"    Cross-type merges: {cross_merge_count}")
    print(f"  Relationships: {len(relationships)} -> {len(deduped_rels)} ({len(relationships) - len(deduped_rels)} removed)")
    print(f"    Junk refs removed: {removed_junk_refs}")
    print(f"    Duplicates removed: {dup_rel_count}")
    print(f"  Cross-record entities: {multi_mention} ({multi_mention / len(final_entities) * 100:.1f}%)")
    print()


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    deduplicate(dry_run=dry)
