"""
Tests for backend/scripts/extract_entities_claude.py.

Covers the pure helpers that orchestrate dedup + id allocation + row shaping.
The claude -p subprocess invocation is NOT exercised here (no live LLM in
unit tests); that path is covered by the pilot run itself, which lands the
real data and the data-integrity tests then prove the CSVs parse and round-
trip cleanly.
"""

import importlib.util
import json
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location(
    "extract_entities_claude",
    BACKEND_DIR / "scripts" / "extract_entities_claude.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)


def test_normalize_name_collapses_whitespace_and_lowercases():
    assert _mod.normalize_name("  The New   York Times  ") == "the new york times"
    assert _mod.normalize_name("") == ""
    assert _mod.normalize_name(None) == ""


def test_index_entities_by_normalized_name():
    existing = [
        {"entity_id": "P0001", "entity_name": "Jay Rosen", "entity_type": "Person"},
        {"entity_id": "O0001", "entity_name": "  The   New York Times ",
         "entity_type": "Organization"},
    ]
    idx = _mod.index_entities_by_normalized_name(existing)
    assert idx[("jay rosen", "Person")]["entity_id"] == "P0001"
    assert idx[("the new york times", "Organization")]["entity_id"] == "O0001"


def test_index_entities_keys_separate_for_cross_type_name_collision():
    """A name like 'Open Source' that exists as both Concept and Work in
    the real CSV must produce two distinct index keys, not collide."""
    existing = [
        {"entity_id": "C0318", "entity_name": "Open Source", "entity_type": "Concept"},
        {"entity_id": "O1194", "entity_name": "Open Source", "entity_type": "Organization"},
        {"entity_id": "W0467", "entity_name": "Open Source", "entity_type": "Work"},
    ]
    idx = _mod.index_entities_by_normalized_name(existing)
    assert idx[("open source", "Concept")]["entity_id"] == "C0318"
    assert idx[("open source", "Organization")]["entity_id"] == "O1194"
    assert idx[("open source", "Work")]["entity_id"] == "W0467"


def test_next_entity_ids_by_prefix_starts_at_one_when_empty():
    seq = _mod.next_entity_ids_by_prefix([])
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
    seq = _mod.next_entity_ids_by_prefix(existing)
    assert seq["P"] == 2215
    assert seq["O"] == 11
    assert seq["C"] == 654
    # unseen prefixes start at 1
    assert seq["W"] == 1
    assert seq["E"] == 1
    assert seq["L"] == 1


def test_alloc_entity_id_pads_to_four_digits_and_advances():
    seq = {"P": 7}
    assert _mod.alloc_entity_id("P", seq) == "P0007"
    assert _mod.alloc_entity_id("P", seq) == "P0008"
    assert seq["P"] == 9


def test_next_rel_seq_for_record():
    rels = [
        {"relationship_id": "RECORD-00002_REL_001"},
        {"relationship_id": "RECORD-00002_REL_003"},
        {"relationship_id": "RECORD-00005_REL_001"},  # different record
    ]
    assert _mod.next_rel_seq_for_record("RECORD-00002", rels) == 4
    assert _mod.next_rel_seq_for_record("RECORD-00099", rels) == 1


def test_parse_claude_json_handles_bare_and_fenced():
    bare = '{"entities": [], "relationships": []}'
    assert _mod.parse_claude_json(bare) == {"entities": [], "relationships": []}
    fenced = "```json\n{\"x\": 1}\n```"
    assert _mod.parse_claude_json(fenced) == {"x": 1}
    fenced_no_lang = "```\n{\"y\": 2}\n```"
    assert _mod.parse_claude_json(fenced_no_lang) == {"y": 2}


def test_normalize_extracted_entity_drops_unknown_type():
    assert _mod.normalize_extracted_entity({
        "entity_type": "Spaceship", "entity_name": "Enterprise"
    }) is None


def test_normalize_extracted_entity_drops_empty_name():
    assert _mod.normalize_extracted_entity({
        "entity_type": "Person", "entity_name": ""
    }) is None


def test_normalize_extracted_entity_collapses_type_specific_role_field():
    out = _mod.normalize_extracted_entity({
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
    out = _mod.normalize_extracted_entity({
        "entity_type": "Organization",
        "entity_name": "The New York Times",
        "org_type": "Newspaper",
    })
    assert out["role_or_description"] == "Newspaper"


def test_process_record_dedups_against_existing_entities(monkeypatch):
    # Existing entity index includes Jay Rosen (P0001).
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
    next_seq = _mod.next_entity_ids_by_prefix(existing_entities)

    fake_response = json.dumps({
        "entities": [
            # Should dedup to existing P0001:
            {"entity_id": "P001", "entity_type": "Person",
             "entity_name": "Jay Rosen", "role": "Professor"},
            # New entity, allocates next O id (here O0001):
            {"entity_id": "O001", "entity_type": "Organization",
             "entity_name": "NYU", "org_type": "University"},
        ],
        "relationships": [
            {"source_entity_id": "P001", "target_entity_id": "O001",
             "relationship_type": "Affiliated With",
             "context_snippet": "Jay Rosen teaches at NYU",
             "confidence_score": 1.0},
        ],
    })

    def _fake_invoke(prompt, timeout_s=240, claude_bin="claude"):
        return fake_response

    monkeypatch.setattr(_mod, "invoke_claude_p", _fake_invoke)

    record = {"id": "RECORD-99999", "raw_text": "Jay Rosen teaches at NYU."}
    new_ents, new_rels, _ = _mod.process_record(
        record, existing_entities, existing_rels, next_seq,
        max_input_chars=10000, today="2026-05-27",
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
    assert rel["target_entity_id"] == "O0001"  # freshly allocated
    assert rel["target_entity_name"] == "NYU"
    assert rel["relationship_type"] == "Affiliated With"
    assert rel["context_snippet"] == "Jay Rosen teaches at NYU"
    assert rel["confidence_score"] == "1"
    assert rel["extracted_date"] == "2026-05-27"


def test_process_record_truncates_long_context_snippet(monkeypatch):
    existing_entities = []
    existing_rels = []
    next_seq = _mod.next_entity_ids_by_prefix(existing_entities)

    long_snippet = "x" * 500
    fake_response = json.dumps({
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
    })
    monkeypatch.setattr(_mod, "invoke_claude_p",
                        lambda prompt, timeout_s=240, claude_bin="claude": fake_response)
    record = {"id": "RECORD-99998", "raw_text": "A mentions B."}
    _, new_rels, _ = _mod.process_record(
        record, existing_entities, existing_rels, next_seq,
        max_input_chars=10000, today="2026-05-27",
    )
    assert len(new_rels[0]["context_snippet"]) == 200


def test_process_record_drops_invalid_relationship_type(monkeypatch):
    existing_entities = []
    existing_rels = []
    next_seq = _mod.next_entity_ids_by_prefix(existing_entities)

    fake_response = json.dumps({
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
    })
    monkeypatch.setattr(_mod, "invoke_claude_p",
                        lambda prompt, timeout_s=240, claude_bin="claude": fake_response)
    record = {"id": "RECORD-99997", "raw_text": "A and B."}
    _, new_rels, _ = _mod.process_record(
        record, existing_entities, existing_rels, next_seq,
        max_input_chars=10000, today="2026-05-27",
    )
    assert new_rels == []


def test_process_record_allocates_new_id_when_name_matches_but_type_differs(monkeypatch):
    """If an existing entity named 'Open Source' exists as a Concept (C0318)
    and the LLM emits 'Open Source' typed as an Organization, the script
    must NOT reuse C0318 — it must allocate a new O-prefixed id."""
    existing_entities = [
        {
            "entity_id": "C0318", "entity_type": "Concept",
            "entity_name": "Open Source", "normalized_name": "open source",
            "role_or_description": "", "affiliation": "",
            "prominence_score": "", "first_mention_record_id": "RECORD-00001",
            "total_mentions": "1", "related_entities": "", "notes": "",
        },
    ]
    next_seq = _mod.next_entity_ids_by_prefix(existing_entities)

    fake_response = json.dumps({
        "entities": [
            {"entity_id": "O001", "entity_type": "Organization",
             "entity_name": "Open Source", "org_type": "Software project"},
        ],
        "relationships": [],
    })
    monkeypatch.setattr(_mod, "invoke_claude_p",
                        lambda prompt, timeout_s=240, claude_bin="claude": fake_response)
    record = {"id": "RECORD-99995", "raw_text": "..."}
    new_ents, _, _ = _mod.process_record(
        record, existing_entities, [], next_seq,
        max_input_chars=10000, today="2026-05-27",
    )
    assert len(new_ents) == 1
    assert new_ents[0]["entity_id"].startswith("O")
    assert new_ents[0]["entity_id"] != "C0318"


def test_process_record_preserves_display_case_in_normalized_name(monkeypatch):
    """normalized_name should mirror entity_name's display case to match the
    existing CSV convention (5033/5078 rows have normalized_name == entity_name).
    The dedup KEY is lowercased internally, but the stored COLUMN preserves
    case so data/export-archive-data.js doesn't add lowercase duplicates to
    the autocomplete index for every new entity."""
    existing_entities = []
    next_seq = _mod.next_entity_ids_by_prefix(existing_entities)

    fake_response = json.dumps({
        "entities": [
            {"entity_id": "P001", "entity_type": "Person",
             "entity_name": "Jay Rosen", "role": "Professor"},
        ],
        "relationships": [],
    })
    monkeypatch.setattr(_mod, "invoke_claude_p",
                        lambda prompt, timeout_s=240, claude_bin="claude": fake_response)
    record = {"id": "RECORD-99994", "raw_text": "..."}
    new_ents, _, _ = _mod.process_record(
        record, existing_entities, [], next_seq,
        max_input_chars=10000, today="2026-05-27",
    )
    assert new_ents[0]["entity_name"] == "Jay Rosen"
    assert new_ents[0]["normalized_name"] == "Jay Rosen"


def test_process_record_dedups_within_batch(monkeypatch):
    """If the LLM emits the same entity twice in one response, we should
    allocate ONE id and reuse it, not two."""
    existing_entities = []
    existing_rels = []
    next_seq = _mod.next_entity_ids_by_prefix(existing_entities)

    fake_response = json.dumps({
        "entities": [
            {"entity_id": "P001", "entity_type": "Person", "entity_name": "Jay Rosen"},
            {"entity_id": "P002", "entity_type": "Person", "entity_name": "  jay rosen  "},
        ],
        "relationships": [],
    })
    monkeypatch.setattr(_mod, "invoke_claude_p",
                        lambda prompt, timeout_s=240, claude_bin="claude": fake_response)
    record = {"id": "RECORD-99996", "raw_text": "Jay Rosen."}
    new_ents, _, _ = _mod.process_record(
        record, existing_entities, existing_rels, next_seq,
        max_input_chars=10000, today="2026-05-27",
    )
    assert len(new_ents) == 1
    assert new_ents[0]["entity_name"] == "Jay Rosen"
