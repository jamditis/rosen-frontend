"""
Dedup + atomic-CSV-append + entity-ID allocation for extracted entities.

This module is a reusable extract of the helpers and per-record processing
logic that originated in scripts/extract_entities_claude.py. The LLM call
itself is NOT part of this module — callers (the claude-CLI script, the
submission server, future Gemini batch paths) pass in an already-extracted
result dict and this module decides what to write.

Why this exists:
- The submission prototype needs to dedup new entities against the existing
  CSV space and allocate canonical IDs in the same <Prefix><4digit> format
  the script already uses. Re-implementing that logic in two places would
  drift; sharing it via this module keeps them aligned.
- The atomic tmp+rename append matches the discipline of
  process_submission.py:_atomic_append_row so concurrent readers always see
  either the pre- or post-append file, never a partial line.

Critical invariants (do not break without updating both call sites):
- Dedup key is (normalize_name(entity_name), entity_type), NOT name alone.
  The existing CSV has cross-type name collisions (e.g. "Open Source"
  appears as Concept, Organization, and Work) and a name-only key would
  reuse the wrong id.
- The stored normalized_name column preserves DISPLAY case while the
  internal dedup key is lowercased. This avoids
  data/export-archive-data.js creating lowercase autocomplete duplicates
  for every new entity (5033/5078 existing rows have normalized_name ==
  entity_name).
- Relationship ids are formatted "{record_id}_REL_{seq:03d}".
- context_snippet is truncated to 200 chars.
- confidence_score is formatted "{:.2f}".rstrip("0").rstrip(".") so 1.0
  becomes "1", 0.95 stays "0.95", 0.90 becomes "0.9".
"""

from __future__ import annotations

import csv
import os
import re
import tempfile
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Schema constants — kept in sync with scripts/batch_entity_extraction.py.
# These are the canonical entity/relationship type sets the project supports.
# If batch_entity_extraction.py changes either set, mirror the change here
# (and update the test fixtures that depend on the prefix map).
# ---------------------------------------------------------------------------

VALID_ENTITY_TYPES = {
    "Person", "Organization", "Work", "Concept", "Event", "Location",
}

ENTITY_TYPE_PREFIXES = {
    "Person": "P",
    "Organization": "O",
    "Work": "W",
    "Concept": "C",
    "Event": "E",
    "Location": "L",
}

VALID_RELATIONSHIP_TYPES = {
    "Mentions", "Criticizes", "Cites", "Discusses", "Expands On",
    "Affiliated With", "Published In", "Originated By", "Occurred At",
    "Supports", "Owns", "Owned By", "Founded By", "Pioneered",
    "Inspired By",
}

# Type-specific fields that map to role_or_description in the CSV.
TYPE_SPECIFIC_ROLE_FIELDS = (
    "role",          # Person
    "org_type",      # Organization
    "work_type",     # Work
    "event_type",    # Event
    "location_type", # Location
    "description",   # Fallback
)

# CSV headers (exact, in order) — must match the existing files byte-for-byte.
ENTITIES_HEADER = [
    "entity_id", "entity_type", "entity_name", "normalized_name",
    "role_or_description", "affiliation", "prominence_score",
    "first_mention_record_id", "total_mentions", "related_entities", "notes",
]
RELATIONSHIPS_HEADER = [
    "relationship_id", "source_record_id", "source_entity_id",
    "source_entity_name", "relationship_type", "target_entity_id",
    "target_entity_name", "context_snippet", "confidence_score",
    "extracted_date",
]


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def normalize_name(name: Optional[str]) -> str:
    """Normalize entity names for dedup matching.

    Trim, collapse whitespace, lowercase. The stored normalized_name column
    preserves display case; this function is only used for dedup KEYS.
    """
    return " ".join((name or "").strip().split()).lower()


def load_existing_entities(entities_csv: Path) -> List[Dict]:
    """Load the entire extracted_entities CSV into a list of dicts.

    Returns [] when the file is absent so the first-record-ever scenario
    degrades cleanly; matches the existence guard in _atomic_append_rows.
    """
    csv_path = Path(entities_csv)
    if not csv_path.exists():
        return []
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_existing_relationships(relationships_csv: Path) -> List[Dict]:
    """Load the entire extracted_relationships CSV into a list of dicts.

    Returns [] when the file is absent (symmetric with load_existing_entities).
    """
    csv_path = Path(relationships_csv)
    if not csv_path.exists():
        return []
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def index_entities_by_normalized_name(
    entities: Iterable[Dict],
) -> Dict[Tuple[str, str], Dict]:
    """Index entities by (normalize_name(entity_name), entity_type).

    Keying by name AND type matters: the existing CSV has cross-type name
    collisions (e.g. "Open Source" appears as C0318, O1194, and W0467).
    Dedup by name alone would reuse the wrong id/prefix.
    """
    idx: Dict[Tuple[str, str], Dict] = {}
    for e in entities:
        key = (normalize_name(e.get("entity_name", "")), e.get("entity_type", ""))
        idx[key] = e
    return idx


def next_entity_ids_by_prefix(entities: Iterable[Dict]) -> Dict[str, int]:
    """Return the next free numeric suffix per entity-type prefix.

    Existing IDs are like P2214, C0653, etc. The successor for the highest
    prefix-N pair is N+1, padded to 4 digits in alloc_entity_id().
    """
    highest: Dict[str, int] = {p: 0 for p in ENTITY_TYPE_PREFIXES.values()}
    pattern = re.compile(r"^([A-Z])(\d+)$")
    for e in entities:
        m = pattern.match(e.get("entity_id", "") or "")
        if not m:
            continue
        prefix, num = m.group(1), int(m.group(2))
        if prefix in highest and num > highest[prefix]:
            highest[prefix] = num
    return {p: highest[p] + 1 for p in highest}


def alloc_entity_id(prefix: str, next_seq: Dict[str, int]) -> str:
    """Reserve and return the next id for the given prefix, mutating next_seq."""
    n = next_seq[prefix]
    next_seq[prefix] = n + 1
    return f"{prefix}{n:04d}"


def next_rel_seq_for_record(
    record_id: str, relationships: Iterable[Dict]
) -> int:
    """Return the next REL sequence number for a given record_id.

    Existing ids look like RECORD-00002_REL_001. If a record already has rels
    in the file we continue from max+1; otherwise start at 1.
    """
    pattern = re.compile(rf"^{re.escape(record_id)}_REL_(\d+)$")
    highest = 0
    for r in relationships:
        m = pattern.match(r.get("relationship_id", "") or "")
        if m:
            highest = max(highest, int(m.group(1)))
    return highest + 1


def normalize_extracted_entity(raw_entity: Dict) -> Optional[Dict]:
    """Coerce one LLM-emitted entity into the CSV row shape.

    - Drop entries whose entity_type isn't in VALID_ENTITY_TYPES.
    - Collapse type-specific fields (role / org_type / work_type / ...) into
      role_or_description, matching the batch parser's behavior.
    - Leave normalized_name to the caller (depends on dedup outcome).
    - Don't set entity_id / first_mention_record_id / total_mentions /
      related_entities / notes here; those are decided by the caller.
    """
    entity_type = raw_entity.get("entity_type", "")
    if entity_type not in VALID_ENTITY_TYPES:
        return None

    entity_name = (raw_entity.get("entity_name") or "").strip()
    if not entity_name:
        return None

    role_or_description = ""
    for field in TYPE_SPECIFIC_ROLE_FIELDS:
        if field in raw_entity and raw_entity[field]:
            role_or_description = str(raw_entity[field])
            break
    if not role_or_description and raw_entity.get("role_or_description"):
        role_or_description = str(raw_entity["role_or_description"])

    affiliation = str(raw_entity.get("affiliation", "") or "")
    prominence = raw_entity.get("prominence_score", "")
    try:
        prominence_score = int(prominence) if prominence != "" else ""
    except (TypeError, ValueError):
        prominence_score = ""

    return {
        "entity_type": entity_type,
        "entity_name": entity_name,
        "role_or_description": role_or_description,
        "affiliation": affiliation,
        "prominence_score": str(prominence_score) if prominence_score != "" else "",
    }


# ---------------------------------------------------------------------------
# Core processor — takes an already-extracted result dict and returns
# (new_entity_rows, new_relationship_rows, llm_to_canonical_id_map).
# ---------------------------------------------------------------------------


def process_extraction_result(
    result_dict: Dict,
    existing_entities: List[Dict],
    existing_relationships: List[Dict],
    next_seq: Dict[str, int],
    today: Optional[str] = None,
    record_id: Optional[str] = None,
) -> Tuple[List[Dict], List[Dict], Dict[str, str]]:
    """Convert an LLM-emitted extraction result into CSV-ready rows.

    Inputs:
        result_dict: {"entities": [...], "relationships": [...],
                      "record_id": "RECORD-NNNNN"} — Gemini / Claude / etc.
                      output. record_id may also be passed explicitly.
        existing_entities: rows already in extracted_entities.csv.
        existing_relationships: rows already in extracted_relationships.csv.
        next_seq: mutable per-prefix counter (see next_entity_ids_by_prefix).
                  This call WILL mutate it as new ids are allocated.
        today: ISO date string for relationships.extracted_date. Defaults
               to today's date.
        record_id: the record being processed. Falls back to
                   result_dict["record_id"].

    Returns:
        (new_entity_rows, new_relationship_rows, llm_to_canonical_id_map)
        - new_entity_rows: rows to append to extracted_entities.csv.
        - new_relationship_rows: rows to append to extracted_relationships.csv.
        - llm_to_canonical_id_map: maps LLM-local ids (e.g. "P001") to the
          canonical entity_id used in the CSV (either the deduped existing
          id or a freshly allocated one).
    """
    if today is None:
        today = date.today().isoformat()
    if record_id is None:
        record_id = result_dict.get("record_id", "") or ""

    raw_entities = result_dict.get("entities", []) or []
    raw_relationships = result_dict.get("relationships", []) or []

    name_index = index_entities_by_normalized_name(existing_entities)
    llm_to_canonical: Dict[str, str] = {}
    new_entity_rows: List[Dict] = []

    # Track entities being created in THIS batch so two raw rows with the
    # same (normalized_name, entity_type) don't allocate two different ids.
    batch_index: Dict[Tuple[str, str], str] = {}

    for raw in raw_entities:
        llm_id = (raw.get("entity_id") or "").strip()
        normalized = normalize_extracted_entity(raw)
        if not normalized:
            continue
        normalized_name_key = normalize_name(normalized["entity_name"])
        key = (normalized_name_key, normalized["entity_type"])

        if key in name_index:
            canonical_id = name_index[key]["entity_id"]
        elif key in batch_index:
            canonical_id = batch_index[key]
        else:
            prefix = ENTITY_TYPE_PREFIXES[normalized["entity_type"]]
            canonical_id = alloc_entity_id(prefix, next_seq)
            new_row = {
                "entity_id": canonical_id,
                "entity_type": normalized["entity_type"],
                "entity_name": normalized["entity_name"],
                # Mirror entity_name's display case to match the existing CSV
                # convention (5033/5078 rows have normalized_name == entity_name).
                # The dedup KEY is lowercased via normalize_name() above; the
                # stored COLUMN preserves case so data/export-archive-data.js
                # doesn't add lowercase autocomplete duplicates for every entity.
                "normalized_name": normalized["entity_name"],
                "role_or_description": normalized["role_or_description"],
                "affiliation": normalized["affiliation"],
                "prominence_score": normalized["prominence_score"],
                "first_mention_record_id": record_id,
                "total_mentions": "1",
                "related_entities": "",
                "notes": "",
            }
            new_entity_rows.append(new_row)
            batch_index[key] = canonical_id

        if llm_id:
            llm_to_canonical[llm_id] = canonical_id

    new_relationship_rows: List[Dict] = []
    rel_seq = next_rel_seq_for_record(record_id, existing_relationships)

    # Name-only fallback index, for the case where the LLM emitted a stray
    # source_entity_id but a usable source_entity_name. Prefer existing rows
    # over batch rows for determinism. When the same name exists across
    # entity_types, mark it ambiguous and refuse to guess.
    name_to_id_combined: Dict[str, str] = {}
    name_to_id_ambiguous: set = set()
    for e in existing_entities:
        k = normalize_name(e["entity_name"])
        if k in name_to_id_combined and name_to_id_combined[k] != e["entity_id"]:
            name_to_id_ambiguous.add(k)
        else:
            name_to_id_combined[k] = e["entity_id"]
    for er in new_entity_rows:
        k = normalize_name(er["entity_name"])
        if k in name_to_id_combined and name_to_id_combined[k] != er["entity_id"]:
            name_to_id_ambiguous.add(k)
        else:
            name_to_id_combined[k] = er["entity_id"]

    id_to_name = {e["entity_id"]: e["entity_name"] for e in existing_entities}
    for er in new_entity_rows:
        id_to_name[er["entity_id"]] = er["entity_name"]

    for raw_rel in raw_relationships:
        rel_type = (raw_rel.get("relationship_type") or "").strip()
        if rel_type not in VALID_RELATIONSHIP_TYPES:
            continue

        src_llm = (raw_rel.get("source_entity_id") or "").strip()
        tgt_llm = (raw_rel.get("target_entity_id") or "").strip()
        src_canonical = llm_to_canonical.get(src_llm)
        tgt_canonical = llm_to_canonical.get(tgt_llm)

        # Last-ditch: recover by name if the LLM emitted a stray id but a
        # usable name. Skip the fallback when the name is ambiguous (exists
        # across multiple entity_types) — guessing would write the wrong rel.
        if not src_canonical and raw_rel.get("source_entity_name"):
            k = normalize_name(raw_rel["source_entity_name"])
            if k not in name_to_id_ambiguous:
                src_canonical = name_to_id_combined.get(k)
        if not tgt_canonical and raw_rel.get("target_entity_name"):
            k = normalize_name(raw_rel["target_entity_name"])
            if k not in name_to_id_ambiguous:
                tgt_canonical = name_to_id_combined.get(k)

        if not src_canonical or not tgt_canonical:
            continue

        snippet = (raw_rel.get("context_snippet")
                   or raw_rel.get("context")
                   or raw_rel.get("evidence")
                   or "")
        snippet = snippet[:200] if snippet else ""

        confidence = raw_rel.get("confidence_score", "")
        try:
            confidence_str = f"{float(confidence):.2f}".rstrip("0").rstrip(".")
            if not confidence_str:
                confidence_str = "0"
        except (TypeError, ValueError):
            confidence_str = ""

        new_rel = {
            "relationship_id": f"{record_id}_REL_{rel_seq:03d}",
            "source_record_id": record_id,
            "source_entity_id": src_canonical,
            "source_entity_name": id_to_name.get(src_canonical, ""),
            "relationship_type": rel_type,
            "target_entity_id": tgt_canonical,
            "target_entity_name": id_to_name.get(tgt_canonical, ""),
            "context_snippet": snippet,
            "confidence_score": confidence_str,
            "extracted_date": today,
        }
        new_relationship_rows.append(new_rel)
        rel_seq += 1

    return new_entity_rows, new_relationship_rows, llm_to_canonical


# ---------------------------------------------------------------------------
# Atomic write — tmp+rename so concurrent readers never see a partial file.
# Matches the discipline of process_submission.py:_atomic_append_row.
# ---------------------------------------------------------------------------


def _atomic_append_rows(
    csv_path: Path,
    header: List[str],
    new_rows: List[Dict],
) -> None:
    """Append rows to a CSV via tmp+rename.

    Read the existing file, write existing + new rows to a sibling tmp file,
    then os.replace(). Atomic for any concurrent reader: they see either the
    pre-append or post-append file, never a half-written line.

    If new_rows is empty this is a no-op (we don't rewrite the file just to
    rename it to itself).
    """
    if not new_rows:
        return

    csv_path = Path(csv_path)
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    existing_rows: List[Dict] = []
    if csv_path.exists():
        with csv_path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for r in reader:
                existing_rows.append(r)

    fd, tmp_path = tempfile.mkstemp(prefix=".csv_tmp.", dir=str(csv_path.parent))
    os.close(fd)
    try:
        with open(tmp_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
            writer.writeheader()
            for r in existing_rows:
                writer.writerow(r)
            for r in new_rows:
                writer.writerow(r)
        os.replace(tmp_path, str(csv_path))
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def append_entities_and_relationships(
    result_dict: Dict,
    entities_csv: Path,
    relationships_csv: Path,
    *,
    today: Optional[str] = None,
    record_id: Optional[str] = None,
) -> Dict[str, int]:
    """High-level entry point: load existing data, process the LLM result,
    atomic-append new rows, return counts.

    Inputs:
        result_dict: LLM extraction output (see process_extraction_result).
        entities_csv: path to extracted_entities.csv.
        relationships_csv: path to extracted_relationships.csv.
        today: optional ISO date string for extracted_date.
        record_id: optional override for the record id; defaults to
                   result_dict["record_id"].

    Returns:
        {"entities_added": N, "relationships_added": M}.

    No-ops cleanly when the result contains zero entities and zero
    relationships (still loads + counts to verify the inputs parse).
    """
    entities_csv = Path(entities_csv)
    relationships_csv = Path(relationships_csv)

    existing_entities = load_existing_entities(entities_csv)
    existing_relationships = load_existing_relationships(relationships_csv)
    next_seq = next_entity_ids_by_prefix(existing_entities)

    new_entities, new_rels, _ = process_extraction_result(
        result_dict,
        existing_entities=existing_entities,
        existing_relationships=existing_relationships,
        next_seq=next_seq,
        today=today,
        record_id=record_id,
    )

    _atomic_append_rows(entities_csv, ENTITIES_HEADER, new_entities)
    _atomic_append_rows(relationships_csv, RELATIONSHIPS_HEADER, new_rels)

    return {
        "entities_added": len(new_entities),
        "relationships_added": len(new_rels),
    }
