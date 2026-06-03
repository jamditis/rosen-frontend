"""
Tests for backend/src/rosen_scraper/entity_csv_writer.py.

This module hosts the dedup + atomic-CSV-append + entity-ID-allocation
helpers extracted from scripts/extract_entities_claude.py so they can be
reused by the prototype submission path (process_submission.py) without
dragging the claude-CLI subprocess invocation along.

Coverage mirrors the moved-helper surface from test_extract_entities_claude.py
and adds three new tests for the high-level process_extraction_result and
append_entities_and_relationships entry points (which take an already-
extracted LLM result dict — Gemini, Claude, or otherwise — and decide what
to write).
"""

import csv
import importlib
import json
from pathlib import Path

ecw = importlib.import_module("rosen_scraper.entity_csv_writer")


# ---------------------------------------------------------------------------
# Schema-derived constants must stay in lockstep with entity_extraction_schema_v3.json
# ---------------------------------------------------------------------------

_SCHEMA_PATH = (Path(__file__).resolve().parents[1]
                / "entity_extraction_schema_v3.json")


def _load_schema():
    with _SCHEMA_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def test_valid_relationship_types_matches_schema():
    """The hardcoded set drifted from the canonical schema (missing 5 valid
    types, contains 1 type not in the schema). Derive from the schema so the
    two cannot drift again."""
    schema = _load_schema()
    expected = frozenset(schema["relationship_types"].keys())
    assert frozenset(ecw.VALID_RELATIONSHIP_TYPES) == expected


def test_valid_entity_types_matches_schema():
    """Same lockstep guarantee for entity types."""
    schema = _load_schema()
    expected = frozenset(schema["entity_types"].keys())
    assert frozenset(ecw.VALID_ENTITY_TYPES) == expected


# ---------------------------------------------------------------------------
# normalize_name
# ---------------------------------------------------------------------------


def test_normalize_name_collapses_whitespace_and_lowercases():
    assert ecw.normalize_name("  The New   York Times  ") == "the new york times"
    assert ecw.normalize_name("") == ""
    assert ecw.normalize_name(None) == ""


# ---------------------------------------------------------------------------
# index_entities_by_normalized_name
# ---------------------------------------------------------------------------


def test_index_entities_by_normalized_name():
    existing = [
        {"entity_id": "P0001", "entity_name": "Jay Rosen", "entity_type": "Person"},
        {"entity_id": "O0001", "entity_name": "  The   New York Times ",
         "entity_type": "Organization"},
    ]
    idx = ecw.index_entities_by_normalized_name(existing)
    assert idx[("jay rosen", "Person")]["entity_id"] == "P0001"
    assert idx[("the new york times", "Organization")]["entity_id"] == "O0001"


def test_index_entities_keys_separate_for_cross_type_name_collision():
    """A name like 'Open Source' that exists as Concept + Organization + Work
    must produce three distinct index keys, not collide."""
    existing = [
        {"entity_id": "C0318", "entity_name": "Open Source", "entity_type": "Concept"},
        {"entity_id": "O1194", "entity_name": "Open Source", "entity_type": "Organization"},
        {"entity_id": "W0467", "entity_name": "Open Source", "entity_type": "Work"},
    ]
    idx = ecw.index_entities_by_normalized_name(existing)
    assert idx[("open source", "Concept")]["entity_id"] == "C0318"
    assert idx[("open source", "Organization")]["entity_id"] == "O1194"
    assert idx[("open source", "Work")]["entity_id"] == "W0467"


# ---------------------------------------------------------------------------
# next_entity_ids_by_prefix
# ---------------------------------------------------------------------------


def test_next_entity_ids_by_prefix_starts_at_one_when_empty():
    seq = ecw.next_entity_ids_by_prefix([])
    assert seq == {"P": 1, "O": 1, "W": 1, "C": 1, "E": 1, "L": 1}


def test_next_entity_ids_by_prefix_continues_after_highest():
    existing = [
        {"entity_id": "P0001"},
        {"entity_id": "P0042"},
        {"entity_id": "P2214"},
        {"entity_id": "O0010"},
        {"entity_id": "C0653"},
        # malformed rows must not crash the scan:
        {"entity_id": ""},
        {"entity_id": "not-an-id"},
    ]
    seq = ecw.next_entity_ids_by_prefix(existing)
    assert seq["P"] == 2215
    assert seq["O"] == 11
    assert seq["C"] == 654
    assert seq["W"] == 1
    assert seq["E"] == 1
    assert seq["L"] == 1


# ---------------------------------------------------------------------------
# alloc_entity_id
# ---------------------------------------------------------------------------


def test_alloc_entity_id_pads_to_four_digits_and_advances():
    seq = {"P": 7}
    assert ecw.alloc_entity_id("P", seq) == "P0007"
    assert ecw.alloc_entity_id("P", seq) == "P0008"
    assert seq["P"] == 9


# ---------------------------------------------------------------------------
# next_rel_seq_for_record
# ---------------------------------------------------------------------------


def test_next_rel_seq_for_record():
    rels = [
        {"relationship_id": "RECORD-00002_REL_001"},
        {"relationship_id": "RECORD-00002_REL_003"},
        {"relationship_id": "RECORD-00005_REL_001"},  # different record
    ]
    assert ecw.next_rel_seq_for_record("RECORD-00002", rels) == 4
    assert ecw.next_rel_seq_for_record("RECORD-00099", rels) == 1


# ---------------------------------------------------------------------------
# normalize_extracted_entity
# ---------------------------------------------------------------------------


def test_normalize_extracted_entity_drops_unknown_type():
    assert ecw.normalize_extracted_entity({
        "entity_type": "Spaceship", "entity_name": "Enterprise"
    }) is None


def test_normalize_extracted_entity_drops_empty_name():
    assert ecw.normalize_extracted_entity({
        "entity_type": "Person", "entity_name": ""
    }) is None


def test_normalize_extracted_entity_collapses_type_specific_role_field():
    out = ecw.normalize_extracted_entity({
        "entity_type": "Person",
        "entity_name": "Jay Rosen",
        "role": "Professor of journalism",
        "affiliation": "NYU",
        "prominence_score": 9,
    })
    assert out["role_or_description"] == "Professor of journalism"
    assert out["affiliation"] == "NYU"
    assert out["prominence_score"] == "9"


def test_normalize_extracted_entity_handles_org_type():
    out = ecw.normalize_extracted_entity({
        "entity_type": "Organization",
        "entity_name": "The New York Times",
        "org_type": "Newspaper",
    })
    assert out["role_or_description"] == "Newspaper"


# ---------------------------------------------------------------------------
# load_existing_entities / load_existing_relationships
# ---------------------------------------------------------------------------


def test_load_existing_entities_and_relationships(tmp_path):
    entities_csv = tmp_path / "extracted_entities.csv"
    relationships_csv = tmp_path / "extracted_relationships.csv"
    with entities_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=ecw.ENTITIES_HEADER)
        writer.writeheader()
        writer.writerow({
            "entity_id": "P0001", "entity_type": "Person",
            "entity_name": "Jay Rosen", "normalized_name": "Jay Rosen",
            "role_or_description": "", "affiliation": "",
            "prominence_score": "", "first_mention_record_id": "RECORD-00001",
            "total_mentions": "1", "related_entities": "", "notes": "",
        })
    with relationships_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=ecw.RELATIONSHIPS_HEADER)
        writer.writeheader()
        writer.writerow({
            "relationship_id": "RECORD-00001_REL_001",
            "source_record_id": "RECORD-00001",
            "source_entity_id": "P0001", "source_entity_name": "Jay Rosen",
            "relationship_type": "Mentions",
            "target_entity_id": "O0001", "target_entity_name": "NYU",
            "context_snippet": "...", "confidence_score": "0.9",
            "extracted_date": "2026-05-27",
        })

    ents = ecw.load_existing_entities(entities_csv)
    rels = ecw.load_existing_relationships(relationships_csv)
    assert len(ents) == 1 and ents[0]["entity_id"] == "P0001"
    assert len(rels) == 1 and rels[0]["relationship_id"] == "RECORD-00001_REL_001"


def test_load_existing_returns_empty_when_files_absent(tmp_path):
    # First-record-ever scenario: the CSVs do not yet exist on disk. Loaders
    # must return [] so the caller's degrade path stays graceful; raising
    # FileNotFoundError here would surface as a misleading
    # "Entity extraction failed" warning instead of a clean append.
    missing_entities = tmp_path / "does_not_exist_entities.csv"
    missing_rels = tmp_path / "does_not_exist_relationships.csv"
    assert not missing_entities.exists()
    assert not missing_rels.exists()
    assert ecw.load_existing_entities(missing_entities) == []
    assert ecw.load_existing_relationships(missing_rels) == []


# ---------------------------------------------------------------------------
# process_extraction_result — the new function that consumes an already-
# extracted LLM result dict (no claude-CLI call inside)
# ---------------------------------------------------------------------------


def test_process_extraction_result_dedups_against_existing_entities():
    existing_entities = [
        {
            "entity_id": "P0001", "entity_type": "Person",
            "entity_name": "Jay Rosen", "normalized_name": "Jay Rosen",
            "role_or_description": "", "affiliation": "",
            "prominence_score": "", "first_mention_record_id": "RECORD-00001",
            "total_mentions": "1", "related_entities": "", "notes": "",
        },
    ]
    existing_rels = []
    next_seq = ecw.next_entity_ids_by_prefix(existing_entities)

    result = {
        "entities": [
            {"entity_id": "P001", "entity_type": "Person",
             "entity_name": "Jay Rosen", "role": "Professor"},
            {"entity_id": "O001", "entity_type": "Organization",
             "entity_name": "NYU", "org_type": "University"},
        ],
        "relationships": [
            {"source_entity_id": "P001", "target_entity_id": "O001",
             "relationship_type": "Affiliated With",
             "context_snippet": "Jay Rosen teaches at NYU",
             "confidence_score": 1.0},
        ],
        "record_id": "RECORD-99999",
    }

    new_ents, new_rels, _ = ecw.process_extraction_result(
        result, existing_entities, existing_rels, next_seq,
        today="2026-05-27", record_id="RECORD-99999",
    )

    assert len(new_ents) == 1
    assert new_ents[0]["entity_id"] == "O0001"
    assert new_ents[0]["entity_type"] == "Organization"
    assert new_ents[0]["entity_name"] == "NYU"
    assert new_ents[0]["first_mention_record_id"] == "RECORD-99999"

    assert len(new_rels) == 1
    rel = new_rels[0]
    assert rel["relationship_id"] == "RECORD-99999_REL_001"
    assert rel["source_entity_id"] == "P0001"  # deduped to existing
    assert rel["source_entity_name"] == "Jay Rosen"
    assert rel["target_entity_id"] == "O0001"
    assert rel["target_entity_name"] == "NYU"
    assert rel["relationship_type"] == "Affiliated With"
    assert rel["context_snippet"] == "Jay Rosen teaches at NYU"
    assert rel["confidence_score"] == "1"
    assert rel["extracted_date"] == "2026-05-27"


def test_process_extraction_result_with_gemini_shape():
    """Gemini's entity_extractor.py emits 'context' on relationships (not
    'context_snippet'); confirm the normalizer falls back to it."""
    existing_entities = []
    existing_rels = []
    next_seq = ecw.next_entity_ids_by_prefix(existing_entities)

    result = {
        "entities": [
            {"entity_id": "P001", "entity_type": "Person",
             "entity_name": "Jay Rosen", "role": "Professor"},
            {"entity_id": "O001", "entity_type": "Organization",
             "entity_name": "NYU", "org_type": "University"},
        ],
        "relationships": [
            {"source_entity_id": "P001", "target_entity_id": "O001",
             "relationship_type": "Affiliated With",
             # Gemini-style: 'context' not 'context_snippet'
             "context": "Rosen has taught at NYU since 1986.",
             "confidence_score": 0.95},
        ],
    }

    new_ents, new_rels, llm_map = ecw.process_extraction_result(
        result, existing_entities, existing_rels, next_seq,
        today="2026-05-27", record_id="RECORD-88888",
    )

    assert len(new_ents) == 2
    p_id = next(e["entity_id"] for e in new_ents if e["entity_type"] == "Person")
    o_id = next(e["entity_id"] for e in new_ents if e["entity_type"] == "Organization")
    assert p_id.startswith("P")
    assert o_id.startswith("O")

    assert len(new_rels) == 1
    assert new_rels[0]["source_entity_id"] == p_id
    assert new_rels[0]["target_entity_id"] == o_id
    assert new_rels[0]["context_snippet"] == "Rosen has taught at NYU since 1986."
    assert new_rels[0]["confidence_score"] == "0.95"
    assert llm_map["P001"] == p_id
    assert llm_map["O001"] == o_id


def test_process_extraction_result_truncates_long_context_snippet():
    existing_entities = []
    existing_rels = []
    next_seq = ecw.next_entity_ids_by_prefix(existing_entities)

    long_snippet = "x" * 500
    result = {
        "entities": [
            {"entity_id": "P001", "entity_type": "Person", "entity_name": "A"},
            {"entity_id": "P002", "entity_type": "Person", "entity_name": "B"},
        ],
        "relationships": [
            {"source_entity_id": "P001", "target_entity_id": "P002",
             "relationship_type": "Mentions",
             "context_snippet": long_snippet,
             "confidence_score": 0.9},
        ],
    }
    _, new_rels, _ = ecw.process_extraction_result(
        result, existing_entities, existing_rels, next_seq,
        today="2026-05-27", record_id="RECORD-99998",
    )
    assert len(new_rels[0]["context_snippet"]) == 200


def test_process_extraction_result_drops_invalid_relationship_type():
    existing_entities = []
    existing_rels = []
    next_seq = ecw.next_entity_ids_by_prefix(existing_entities)

    result = {
        "entities": [
            {"entity_id": "P001", "entity_type": "Person", "entity_name": "A"},
            {"entity_id": "P002", "entity_type": "Person", "entity_name": "B"},
        ],
        "relationships": [
            {"source_entity_id": "P001", "target_entity_id": "P002",
             "relationship_type": "MadeUpRelation",
             "context_snippet": "...",
             "confidence_score": 0.9},
        ],
    }
    _, new_rels, _ = ecw.process_extraction_result(
        result, existing_entities, existing_rels, next_seq,
        today="2026-05-27", record_id="RECORD-99997",
    )
    assert new_rels == []


def test_process_extraction_result_allocates_new_id_when_name_matches_but_type_differs():
    existing_entities = [
        {
            "entity_id": "C0318", "entity_type": "Concept",
            "entity_name": "Open Source", "normalized_name": "open source",
            "role_or_description": "", "affiliation": "",
            "prominence_score": "", "first_mention_record_id": "RECORD-00001",
            "total_mentions": "1", "related_entities": "", "notes": "",
        },
    ]
    next_seq = ecw.next_entity_ids_by_prefix(existing_entities)

    result = {
        "entities": [
            {"entity_id": "O001", "entity_type": "Organization",
             "entity_name": "Open Source", "org_type": "Software project"},
        ],
        "relationships": [],
    }
    new_ents, _, _ = ecw.process_extraction_result(
        result, existing_entities, [], next_seq,
        today="2026-05-27", record_id="RECORD-99995",
    )
    assert len(new_ents) == 1
    assert new_ents[0]["entity_id"].startswith("O")
    assert new_ents[0]["entity_id"] != "C0318"


def test_process_extraction_result_preserves_display_case_in_normalized_name():
    existing_entities = []
    next_seq = ecw.next_entity_ids_by_prefix(existing_entities)

    result = {
        "entities": [
            {"entity_id": "P001", "entity_type": "Person",
             "entity_name": "Jay Rosen", "role": "Professor"},
        ],
        "relationships": [],
    }
    new_ents, _, _ = ecw.process_extraction_result(
        result, existing_entities, [], next_seq,
        today="2026-05-27", record_id="RECORD-99994",
    )
    assert new_ents[0]["entity_name"] == "Jay Rosen"
    assert new_ents[0]["normalized_name"] == "Jay Rosen"


def test_process_extraction_result_dedups_within_batch():
    """Two raw entity rows with the same (name, type) in one extraction must
    share one allocated id, not get two."""
    existing_entities = []
    existing_rels = []
    next_seq = ecw.next_entity_ids_by_prefix(existing_entities)

    result = {
        "entities": [
            {"entity_id": "P001", "entity_type": "Person", "entity_name": "Jay Rosen"},
            {"entity_id": "P002", "entity_type": "Person", "entity_name": "  jay rosen  "},
        ],
        "relationships": [],
    }
    new_ents, _, llm_map = ecw.process_extraction_result(
        result, existing_entities, existing_rels, next_seq,
        today="2026-05-27", record_id="RECORD-99996",
    )
    assert len(new_ents) == 1
    assert new_ents[0]["entity_name"] == "Jay Rosen"
    # Both LLM ids should map to the same canonical id
    assert llm_map["P001"] == llm_map["P002"]


def test_process_extraction_result_name_only_fallback_for_stray_llm_id():
    """When the LLM emits a stray source_entity_id but a valid name that
    matches an existing entity unambiguously, fall back to name lookup."""
    existing_entities = [
        {
            "entity_id": "P0001", "entity_type": "Person",
            "entity_name": "Jay Rosen", "normalized_name": "Jay Rosen",
            "role_or_description": "", "affiliation": "",
            "prominence_score": "", "first_mention_record_id": "RECORD-00001",
            "total_mentions": "1", "related_entities": "", "notes": "",
        },
        {
            "entity_id": "O0001", "entity_type": "Organization",
            "entity_name": "NYU", "normalized_name": "NYU",
            "role_or_description": "", "affiliation": "",
            "prominence_score": "", "first_mention_record_id": "RECORD-00001",
            "total_mentions": "1", "related_entities": "", "notes": "",
        },
    ]
    next_seq = ecw.next_entity_ids_by_prefix(existing_entities)

    result = {
        "entities": [],
        "relationships": [
            # LLM emitted bogus ids but real names; we should still write
            # the relationship using the canonical ids resolved by name.
            {"source_entity_id": "ZZZ", "source_entity_name": "Jay Rosen",
             "target_entity_id": "ZZZ", "target_entity_name": "NYU",
             "relationship_type": "Affiliated With",
             "context_snippet": "Rosen teaches at NYU",
             "confidence_score": 0.9},
        ],
    }
    _, new_rels, _ = ecw.process_extraction_result(
        result, existing_entities, [], next_seq,
        today="2026-05-27", record_id="RECORD-77777",
    )
    assert len(new_rels) == 1
    assert new_rels[0]["source_entity_id"] == "P0001"
    assert new_rels[0]["target_entity_id"] == "O0001"


def test_process_extraction_result_skips_ambiguous_name_fallback():
    """When a name exists across multiple entity_types, don't guess — drop
    the relationship rather than write the wrong one."""
    existing_entities = [
        {
            "entity_id": "C0318", "entity_type": "Concept",
            "entity_name": "Open Source", "normalized_name": "Open Source",
            "role_or_description": "", "affiliation": "",
            "prominence_score": "", "first_mention_record_id": "RECORD-00001",
            "total_mentions": "1", "related_entities": "", "notes": "",
        },
        {
            "entity_id": "O1194", "entity_type": "Organization",
            "entity_name": "Open Source", "normalized_name": "Open Source",
            "role_or_description": "", "affiliation": "",
            "prominence_score": "", "first_mention_record_id": "RECORD-00002",
            "total_mentions": "1", "related_entities": "", "notes": "",
        },
        {
            "entity_id": "P0001", "entity_type": "Person",
            "entity_name": "Jay Rosen", "normalized_name": "Jay Rosen",
            "role_or_description": "", "affiliation": "",
            "prominence_score": "", "first_mention_record_id": "RECORD-00001",
            "total_mentions": "1", "related_entities": "", "notes": "",
        },
    ]
    next_seq = ecw.next_entity_ids_by_prefix(existing_entities)

    result = {
        "entities": [],
        "relationships": [
            {"source_entity_id": "ZZZ", "source_entity_name": "Jay Rosen",
             "target_entity_id": "ZZZ", "target_entity_name": "Open Source",
             "relationship_type": "Discusses",
             "context_snippet": "...",
             "confidence_score": 0.9},
        ],
    }
    _, new_rels, _ = ecw.process_extraction_result(
        result, existing_entities, [], next_seq,
        today="2026-05-27", record_id="RECORD-77778",
    )
    # The ambiguous name forces the rel to be dropped.
    assert new_rels == []


# ---------------------------------------------------------------------------
# append_entities_and_relationships — high-level entry point with atomic write
# ---------------------------------------------------------------------------


def _seed_csvs(tmp_path: Path):
    entities_csv = tmp_path / "extracted_entities.csv"
    relationships_csv = tmp_path / "extracted_relationships.csv"
    with entities_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=ecw.ENTITIES_HEADER)
        writer.writeheader()
        writer.writerow({
            "entity_id": "P0001", "entity_type": "Person",
            "entity_name": "Jay Rosen", "normalized_name": "Jay Rosen",
            "role_or_description": "", "affiliation": "",
            "prominence_score": "", "first_mention_record_id": "RECORD-00001",
            "total_mentions": "1", "related_entities": "", "notes": "",
        })
    with relationships_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=ecw.RELATIONSHIPS_HEADER)
        writer.writeheader()
    return entities_csv, relationships_csv


def test_append_entities_and_relationships_atomic(tmp_path):
    entities_csv, relationships_csv = _seed_csvs(tmp_path)

    result = {
        "entities": [
            {"entity_id": "P001", "entity_type": "Person",
             "entity_name": "Jay Rosen", "role": "Professor"},
            {"entity_id": "O001", "entity_type": "Organization",
             "entity_name": "NYU", "org_type": "University"},
        ],
        "relationships": [
            {"source_entity_id": "P001", "target_entity_id": "O001",
             "relationship_type": "Affiliated With",
             "context_snippet": "Jay Rosen teaches at NYU",
             "confidence_score": 1.0},
        ],
        "record_id": "RECORD-99999",
    }

    counts = ecw.append_entities_and_relationships(
        result, entities_csv, relationships_csv, today="2026-05-27",
    )
    assert counts == {"entities_added": 1, "relationships_added": 1}

    # Existing P0001 stays; freshly allocated O0001 appended.
    with entities_csv.open("r", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    assert [r["entity_id"] for r in rows] == ["P0001", "O0001"]
    assert rows[1]["entity_name"] == "NYU"
    assert rows[1]["normalized_name"] == "NYU"
    assert rows[1]["first_mention_record_id"] == "RECORD-99999"

    with relationships_csv.open("r", encoding="utf-8", newline="") as f:
        rrows = list(csv.DictReader(f))
    assert len(rrows) == 1
    assert rrows[0]["relationship_id"] == "RECORD-99999_REL_001"
    assert rrows[0]["source_entity_id"] == "P0001"
    assert rrows[0]["target_entity_id"] == "O0001"


def test_append_entities_and_relationships_no_partial_writes(tmp_path):
    """Atomic write contract: the destination file is never half-written.
    Read once before, run the append, read once after — both reads parse
    cleanly. (We can't easily simulate a crash mid-write here, but we can
    verify there is no leftover tmp file and the file's header is intact.)
    """
    entities_csv, relationships_csv = _seed_csvs(tmp_path)

    with entities_csv.open("r", encoding="utf-8", newline="") as f:
        before = list(csv.DictReader(f))
    assert len(before) == 1

    result = {
        "entities": [
            {"entity_id": "O001", "entity_type": "Organization",
             "entity_name": "NYU", "org_type": "University"},
        ],
        "relationships": [],
        "record_id": "RECORD-55555",
    }
    ecw.append_entities_and_relationships(
        result, entities_csv, relationships_csv, today="2026-05-27",
    )

    with entities_csv.open("r", encoding="utf-8", newline="") as f:
        after = list(csv.DictReader(f))
    assert len(after) == 2

    # No orphan tmp file left next to the CSV.
    leftover = [p for p in tmp_path.iterdir()
                if p.name.startswith(".csv_tmp.") or p.suffix == ".tmp"]
    assert leftover == []


def test_append_handles_empty_result(tmp_path):
    entities_csv, relationships_csv = _seed_csvs(tmp_path)

    empty_result = {"entities": [], "relationships": [], "record_id": "RECORD-00000"}
    counts = ecw.append_entities_and_relationships(
        empty_result, entities_csv, relationships_csv, today="2026-05-27",
    )
    assert counts == {"entities_added": 0, "relationships_added": 0}

    # Files unchanged.
    with entities_csv.open("r", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 1 and rows[0]["entity_id"] == "P0001"

    with relationships_csv.open("r", encoding="utf-8", newline="") as f:
        rrows = list(csv.DictReader(f))
    assert rrows == []


# ---------------------------------------------------------------------------
# CSV/spreadsheet formula injection — entity_name, role_or_description, and
# relationship context all originate from LLM extraction over scraped page
# text, so an attacker whose page is scraped can plant a formula. The writer
# must neutralize the trigger before it reaches the committed CSV.
# ---------------------------------------------------------------------------


def test_append_sanitizes_formula_injection_in_entity_fields(tmp_path):
    entities_csv, relationships_csv = _seed_csvs(tmp_path)
    result = {
        "entities": [
            {"entity_id": "P001", "entity_type": "Person",
             "entity_name": '=HYPERLINK("http://evil.example","x")',
             "role": "@SUM(1+1)"},
        ],
        "relationships": [],
        "record_id": "RECORD-31337",
    }
    ecw.append_entities_and_relationships(
        result, entities_csv, relationships_csv, today="2026-05-31",
    )
    with entities_csv.open("r", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    new = rows[-1]
    assert new["entity_name"] == "'=HYPERLINK(\"http://evil.example\",\"x\")"
    assert new["role_or_description"] == "'@SUM(1+1)"


def test_append_sanitizes_formula_injection_in_relationship_context(tmp_path):
    entities_csv, relationships_csv = _seed_csvs(tmp_path)
    result = {
        "entities": [
            {"entity_id": "P001", "entity_type": "Person",
             "entity_name": "Jay Rosen", "role": "Professor"},
            {"entity_id": "O001", "entity_type": "Organization",
             "entity_name": "NYU", "org_type": "University"},
        ],
        "relationships": [
            {"source_entity_id": "P001", "target_entity_id": "O001",
             "relationship_type": "Affiliated With",
             "context_snippet": "=cmd|'/c calc'!A1",
             "confidence_score": 1.0},
        ],
        "record_id": "RECORD-31338",
    }
    ecw.append_entities_and_relationships(
        result, entities_csv, relationships_csv, today="2026-05-31",
    )
    with relationships_csv.open("r", encoding="utf-8", newline="") as f:
        rrows = list(csv.DictReader(f))
    assert rrows[-1]["context_snippet"] == "'=cmd|'/c calc'!A1"


def test_append_does_not_over_escape_safe_values(tmp_path):
    # Ordinary text must stay byte-for-byte unchanged (no spurious leading ').
    entities_csv, relationships_csv = _seed_csvs(tmp_path)
    result = {
        "entities": [
            {"entity_id": "O001", "entity_type": "Organization",
             "entity_name": "NYU", "org_type": "University"},
        ],
        "relationships": [],
        "record_id": "RECORD-31339",
    }
    ecw.append_entities_and_relationships(
        result, entities_csv, relationships_csv, today="2026-05-31",
    )
    with entities_csv.open("r", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    new = rows[-1]
    assert new["entity_name"] == "NYU"
    assert new["entity_type"] == "Organization"


# ---------------------------------------------------------------------------
# Escaping a formula-trigger name on write must not break dedup on re-runs.
# The name is stored as "'=foo" but a fresh extraction sees the raw "=foo";
# the dedup KEY has to treat them as the same entity or every re-run allocates
# a new id for it.
# ---------------------------------------------------------------------------


def test_normalize_name_unescapes_formula_escape_for_dedup():
    assert ecw.normalize_name("'=Open Source") == ecw.normalize_name("=Open Source")
    assert ecw.normalize_name("'@home") == ecw.normalize_name("@home")
    assert ecw.normalize_name("'-30-") == ecw.normalize_name("-30-")


def test_normalize_name_keeps_legitimate_leading_apostrophe():
    # A real leading apostrophe (not an escape) must not be stripped.
    assert ecw.normalize_name("'Tis") == "'tis"


def test_escaped_entity_dedups_against_raw_reextraction(tmp_path):
    entities_csv, relationships_csv = _seed_csvs(tmp_path)
    # First pass: a concept whose name triggers the formula escape on write.
    first = {
        "entities": [
            {"entity_id": "C001", "entity_type": "Concept", "entity_name": "=mc2"},
        ],
        "relationships": [],
        "record_id": "RECORD-1",
    }
    ecw.append_entities_and_relationships(
        first, entities_csv, relationships_csv, today="2026-05-31")

    def mc2_rows():
        with entities_csv.open("r", encoding="utf-8", newline="") as f:
            return [r for r in csv.DictReader(f) if r["entity_name"] == "'=mc2"]

    after_first = mc2_rows()
    assert len(after_first) == 1  # escaped on disk
    first_id = after_first[0]["entity_id"]

    # Second pass: the same concept re-extracted (raw "=mc2") must dedup to the
    # existing row, not append a second one with a fresh id.
    second = {
        "entities": [
            {"entity_id": "C002", "entity_type": "Concept", "entity_name": "=mc2"},
        ],
        "relationships": [],
        "record_id": "RECORD-2",
    }
    ecw.append_entities_and_relationships(
        second, entities_csv, relationships_csv, today="2026-05-31")
    after_second = mc2_rows()
    assert len(after_second) == 1  # no duplicate allocated
    assert after_second[0]["entity_id"] == first_id


def test_relationship_snippet_stays_within_cap_after_escaping(tmp_path):
    # A trigger-led context_snippet at the 200-char cap must not exceed it once
    # the formula escape is prepended (escape-then-truncate, like _sanitize_cell).
    entities_csv, relationships_csv = _seed_csvs(tmp_path)
    result = {
        "entities": [
            {"entity_id": "P001", "entity_type": "Person", "entity_name": "Jay Rosen"},
            {"entity_id": "O001", "entity_type": "Organization", "entity_name": "NYU"},
        ],
        "relationships": [
            {"source_entity_id": "P001", "target_entity_id": "O001",
             "relationship_type": "Affiliated With",
             "context_snippet": "=" + ("A" * 250),
             "confidence_score": 1.0},
        ],
        "record_id": "RECORD-CAP",
    }
    ecw.append_entities_and_relationships(
        result, entities_csv, relationships_csv, today="2026-05-31")
    with relationships_csv.open("r", encoding="utf-8", newline="") as f:
        snippet = list(csv.DictReader(f))[-1]["context_snippet"]
    assert snippet.startswith("'=")  # still neutralized
    assert len(snippet) <= 200       # cap preserved after escaping
