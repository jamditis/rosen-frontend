"""Characterization tests for ExtractionDB entity/relationship saves (#492).

These pin the observable behavior of the four save methods before the
duplicated INSERT statement is extracted into a shared per-row helper:
  - entities use INSERT OR REPLACE with UNIQUE(entity_id), so a repeated id
    replaces the row;
  - relationships use a plain INSERT (no unique constraint), so a repeated id
    appends a second row;
  - both apply the same .get() column defaults and set created_at.
The single and bulk variants must stay byte-equivalent after the extraction.
"""
import pytest

from rosen_scraper.extraction_db import ExtractionDB


@pytest.fixture
def db(tmp_path):
    return ExtractionDB(tmp_path / "extract.db")


def _entity(**over):
    base = {
        "entity_id": "E1",
        "entity_type": "person",
        "entity_name": "Jay Rosen",
        "normalized_name": "jay rosen",
    }
    base.update(over)
    return base


def _rel(**over):
    base = {
        "relationship_id": "R1",
        "source_entity_id": "E1",
        "target_entity_id": "E2",
        "relationship_type": "criticizes",
    }
    base.update(over)
    return base


def test_save_entity_inserts_with_defaults(db):
    db.save_entity(_entity())
    rows = db.get_all_entities()
    assert len(rows) == 1
    r = rows[0]
    assert r["entity_id"] == "E1"
    assert r["entity_type"] == "person"
    assert r["entity_name"] == "Jay Rosen"
    assert r["normalized_name"] == "jay rosen"
    assert r["role_or_description"] == ""
    assert r["affiliation"] == ""
    assert r["prominence_score"] == 0
    assert r["first_mention_record_id"] == ""
    assert r["total_mentions"] == 1
    assert r["related_entities"] == ""
    assert r["notes"] == ""
    assert r["created_at"]


def test_save_entity_replaces_on_duplicate_id(db):
    db.save_entity(_entity(entity_name="First"))
    db.save_entity(_entity(entity_name="Second"))
    rows = db.get_all_entities()
    assert len(rows) == 1
    assert rows[0]["entity_name"] == "Second"


def test_save_entities_bulk(db):
    db.save_entities([_entity(entity_id="E1"), _entity(entity_id="E2")])
    assert db.get_entity_count() == 2


def test_save_relationship_inserts_with_defaults(db):
    db.save_relationship(_rel())
    rows = db.get_all_relationships()
    assert len(rows) == 1
    r = rows[0]
    assert r["relationship_id"] == "R1"
    assert r["source_entity_id"] == "E1"
    assert r["target_entity_id"] == "E2"
    assert r["relationship_type"] == "criticizes"
    assert r["description"] == ""
    assert r["evidence"] == ""
    assert r["source_record_id"] == ""
    assert r["strength"] == ""
    assert r["temporal_context"] == ""
    assert r["notes"] == ""
    assert r["created_at"]


def test_save_relationships_bulk_appends_duplicate_ids(db):
    db.save_relationships([_rel(), _rel()])
    assert db.get_relationship_count() == 2
