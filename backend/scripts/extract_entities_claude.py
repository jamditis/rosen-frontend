#!/usr/bin/env python3
"""
Pass 2 entity extraction via the claude CLI (no direct LLM API call).

Workflow for each record id passed on the command line:
  1. Load the record from data/archive_records-public.csv (must have raw_text).
  2. Build the extraction prompt with build_extraction_prompt() from
     batch_entity_extraction (so prompt shape stays in lockstep with the
     existing Anthropic/OpenAI/Gemini batch paths).
  3. Pipe the prompt into `claude -p` via stdin (NOT argv) to dodge the
     kernel's per-argument cap (MAX_ARG_STRLEN, typically 128KB on Linux),
     which a multi-tens-of-KB raw_text + prompt scaffold would otherwise
     blow past, producing an E2BIG with the literal "Argument list too
     long" in stderr.
  4. Parse the JSON, dedup entities by normalized_name against the existing
     extracted_entities.csv space, allocate new entity_ids in the
     <Prefix><4digit> format that matches the existing data (P0001 etc).
  5. Append rows to data/extracted_entities.csv and
     data/extracted_relationships.csv. Both files end with a trailing newline
     so subsequent appends start on a fresh row.

Intentionally small / single-shot per record: this is the Pass 2 pilot. Once
the shape is right, scaling to the next 50 records is a loop and a rate
limiter, not a rewrite. See issue #207 for the broader extraction-coverage
work.

Required: `claude` on $PATH (the Claude Code CLI). No env vars needed; the
CLI uses Joe's existing subscription.

Usage:
  cd backend && poetry run python scripts/extract_entities_claude.py \
      RECORD-00535 RECORD-00837 RECORD-00644 RECORD-00756 RECORD-00746

Flags:
  --data-dir <path>       Override data/ root (default: repo data/)
  --dry-run               Run the extraction but don't write CSVs
  --max-input-chars <N>   Truncate raw_text to N chars (default: 30000)
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = REPO_ROOT / "data"
RECORDS_CSV = "archive_records-public.csv"
ENTITIES_CSV = "extracted_entities.csv"
RELATIONSHIPS_CSV = "extracted_relationships.csv"

# Reuse the prompt builder + validation constants from the batch script so
# both extraction paths stay schema-aligned.
_BATCH_PATH = Path(__file__).with_name("batch_entity_extraction.py")
_spec = importlib.util.spec_from_file_location("batch_entity_extraction", _BATCH_PATH)
_batch = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_batch)  # type: ignore[union-attr]

build_extraction_prompt = _batch.build_extraction_prompt
VALID_ENTITY_TYPES = _batch.VALID_ENTITY_TYPES
ENTITY_TYPE_PREFIXES = _batch.ENTITY_TYPE_PREFIXES
VALID_RELATIONSHIP_TYPES = _batch.VALID_RELATIONSHIP_TYPES
TYPE_SPECIFIC_ROLE_FIELDS = _batch.TYPE_SPECIFIC_ROLE_FIELDS

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
# Pure helpers (TDD targets)
# ---------------------------------------------------------------------------


def normalize_name(name: Optional[str]) -> str:
    """Normalize entity names for dedup matching.

    Existing CSV uses a light normalization: trimmed whitespace and a single
    canonical case. Compare case-insensitively but preserve the existing
    spelling when reusing.
    """
    return " ".join((name or "").strip().split()).lower()


def load_existing_entities(entities_csv: Path) -> List[Dict]:
    with entities_csv.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_existing_relationships(relationships_csv: Path) -> List[Dict]:
    with relationships_csv.open("r", encoding="utf-8", newline="") as f:
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


def parse_claude_json(raw: str) -> Dict:
    """Strip optional markdown fences, then json.loads.

    `claude -p` usually returns bare JSON when the prompt asks for it, but
    handle the markdown-fence path defensively (same logic as the batch
    parser).
    """
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```\w*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
        cleaned = cleaned.strip()
    return json.loads(cleaned)


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
# Claude CLI invocation
# ---------------------------------------------------------------------------


def invoke_claude_p(
    prompt: str,
    timeout_s: int = 240,
    claude_bin: str = "claude",
) -> str:
    """Pipe the prompt into `claude -p` via stdin and return stdout.

    Stdin is used to avoid the kernel's per-argument cap (MAX_ARG_STRLEN,
    typically 128KB on Linux); a multi-tens-of-KB raw_text + prompt scaffold
    would otherwise blow past it and exec would fail with E2BIG.
    """
    proc = subprocess.run(
        [claude_bin, "-p"],
        input=prompt.encode("utf-8"),
        capture_output=True,
        timeout=timeout_s,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(
            f"claude -p exited {proc.returncode}: {stderr[:500]}"
        )
    return proc.stdout.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def load_record(
    record_id: str, records_csv: Path
) -> Optional[Dict]:
    with records_csv.open("r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("id") == record_id:
                return row
    return None


def append_csv_rows(
    path: Path, header: List[str], rows: List[Dict]
) -> None:
    """Append rows to an existing CSV that already has the header.

    Uses csv.DictWriter for proper quoting/escaping.
    """
    with path.open("a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
        writer.writerows(rows)


def process_record(
    record: Dict,
    existing_entities: List[Dict],
    existing_relationships: List[Dict],
    next_seq: Dict[str, int],
    max_input_chars: int,
    today: str,
) -> Tuple[List[Dict], List[Dict], Dict[str, str]]:
    """Run extraction for one record.

    Returns (new_entity_rows, new_relationship_rows, llm_id_to_canonical_id).
    llm_id_to_canonical_id maps the LLM's local entity_id (e.g. P001) to the
    canonical entity_id that should be written (either an existing one we
    deduped to, or a freshly allocated one).
    """
    record_id = record["id"]
    raw_text = (record.get("raw_text") or "").strip()
    if max_input_chars and len(raw_text) > max_input_chars:
        raw_text = raw_text[:max_input_chars]

    prompt = build_extraction_prompt(raw_text, record_id)
    print(f"[{record_id}] calling claude -p ({len(prompt)} chars prompt)", flush=True)
    response = invoke_claude_p(prompt)
    data = parse_claude_json(response)

    raw_entities = data.get("entities", []) or []
    raw_relationships = data.get("relationships", []) or []

    name_index = index_entities_by_normalized_name(existing_entities)
    llm_to_canonical: Dict[str, str] = {}
    new_entity_rows: List[Dict] = []

    # Track entities also being created in this batch so two raw rows with
    # the same (normalized_name, entity_type) don't allocate two different ids.
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

    # For the name-only fallback path (used when the LLM emits a stray id but
    # a valid name), prefer existing rows over batch rows to stay deterministic.
    # When the same name exists across types, we can't disambiguate from the
    # rel alone — fall through and drop the rel rather than guess.
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

        # Last-ditch: try to recover by name if the LLM emitted a stray id
        # but a usable name. Skip the fallback when the name is ambiguous
        # (exists across multiple entity_types) — guessing would write the
        # wrong relationship.
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

        snippet = (raw_rel.get("context_snippet") or raw_rel.get("evidence") or "")
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


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("record_ids", nargs="+", help="RECORD-NNNNN ids to extract")
    parser.add_argument("--data-dir", default=str(DATA_DIR))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-input-chars", type=int, default=30000)
    args = parser.parse_args(argv)

    data_dir = Path(args.data_dir)
    records_csv = data_dir / RECORDS_CSV
    entities_csv = data_dir / ENTITIES_CSV
    relationships_csv = data_dir / RELATIONSHIPS_CSV

    existing_entities = load_existing_entities(entities_csv)
    existing_relationships = load_existing_relationships(relationships_csv)
    next_seq = next_entity_ids_by_prefix(existing_entities)
    today = date.today().isoformat()

    print(f"[init] {len(existing_entities)} existing entities, "
          f"{len(existing_relationships)} existing rels", flush=True)
    print(f"[init] next-id seeds: {next_seq}", flush=True)

    all_new_entities: List[Dict] = []
    all_new_rels: List[Dict] = []

    for record_id in args.record_ids:
        record = load_record(record_id, records_csv)
        if not record:
            print(f"[{record_id}] NOT FOUND in {records_csv.name}; skipping",
                  flush=True)
            continue
        if not (record.get("raw_text") or "").strip():
            print(f"[{record_id}] empty raw_text; skipping", flush=True)
            continue

        new_ents, new_rels, _ = process_record(
            record,
            existing_entities=existing_entities + all_new_entities,
            existing_relationships=existing_relationships + all_new_rels,
            next_seq=next_seq,
            max_input_chars=args.max_input_chars,
            today=today,
        )
        print(f"[{record_id}] +{len(new_ents)} entities, +{len(new_rels)} rels",
              flush=True)
        all_new_entities.extend(new_ents)
        all_new_rels.extend(new_rels)

    if args.dry_run:
        print(f"[dry-run] would append {len(all_new_entities)} entities, "
              f"{len(all_new_rels)} relationships")
        return 0

    if all_new_entities:
        append_csv_rows(entities_csv, ENTITIES_HEADER, all_new_entities)
    if all_new_rels:
        append_csv_rows(relationships_csv, RELATIONSHIPS_HEADER, all_new_rels)

    print(f"[done] appended {len(all_new_entities)} entities and "
          f"{len(all_new_rels)} relationships", flush=True)

    type_counts = Counter(e["entity_type"] for e in all_new_entities)
    rel_counts = Counter(r["relationship_type"] for r in all_new_rels)
    print(f"[done] entity types: {dict(type_counts)}", flush=True)
    print(f"[done] relationship types: {dict(rel_counts)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
