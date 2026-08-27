"""schema.json is the single source for the archive's controlled vocabularies.

The reviewer, the auto-categorizer, and the ADDING-RECORDS guide used to carry
their own hardcoded copies of the thematic categories, eras, concepts, scopes,
and formats. These tests fail if any consumer drifts from
backend/schema.json's `taxonomy` block, so adding or removing a category is a
schema.json edit (plus the ADDING-RECORDS list these tests pin) rather than a
code change across scripts (issue #524, Jay's self-service ask). They also
confirm the loader fails loud rather than running with an empty allow-list.
"""
import json
import re
from pathlib import Path

import pytest

from scripts import archive_record_reviewer, auto_categorize_records, taxonomy

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
SCHEMA = BACKEND / "schema.json"
ADDING_RECORDS = REPO / "ADDING-RECORDS.md"


def _schema_names(key):
    taxonomy_block = json.loads(SCHEMA.read_text(encoding="utf-8-sig"))["taxonomy"]
    return [item["name"] if isinstance(item, dict) else item for item in taxonomy_block[key]]


def test_loader_matches_schema_json():
    assert taxonomy.thematic_categories() == _schema_names("thematic_categories")
    assert taxonomy.eras() == _schema_names("era")
    assert taxonomy.key_concepts() == _schema_names("key_concepts")
    assert taxonomy.content_formats() == _schema_names("content_format")
    assert taxonomy.scopes() == _schema_names("scope")
    # A non-empty vocabulary is the whole point; an empty one guards nothing.
    assert taxonomy.thematic_categories()


def test_reviewer_vocab_comes_from_schema():
    # Reddens if any list is re-hardcoded and then drifts from schema.
    assert archive_record_reviewer.VALID_CATEGORIES == _schema_names("thematic_categories")
    assert archive_record_reviewer.VALID_ERAS == _schema_names("era")
    assert archive_record_reviewer.VALID_CONCEPTS == _schema_names("key_concepts")
    assert archive_record_reviewer.VALID_SCOPES == _schema_names("scope")
    assert archive_record_reviewer.VALID_FORMATS == _schema_names("content_format")


def test_auto_categorize_rules_reference_only_known_buckets():
    canonical = set(_schema_names("thematic_categories"))
    # The enforced invariant is subset, not equality: a rule may never name an
    # unknown bucket, but a canonical bucket may stay manual-only with no rule.
    assert set(auto_categorize_records.CATEGORY_PATTERNS) <= canonical
    assert set(auto_categorize_records.URL_PATTERNS) <= canonical


def test_adding_records_doc_lists_the_schema_categories():
    text = ADDING_RECORDS.read_text(encoding="utf-8")
    section = text.split("### Thematic categories to use", 1)[1].split("###", 1)[0]
    # Only bullet lines shaped `- \`Category\``; the blockquote note below the
    # list uses `> ` lines, so its backticked paths are excluded.
    listed = set(re.findall(r"^- `([^`]+)`\s*$", section, re.MULTILINE))
    assert listed == set(_schema_names("thematic_categories"))


def test_loader_fails_closed_on_missing_schema(monkeypatch, tmp_path):
    monkeypatch.setattr(taxonomy, "SCHEMA_PATH", tmp_path / "gone.json")
    with pytest.raises(RuntimeError, match="not found"):
        taxonomy.thematic_categories()


def test_loader_fails_closed_on_empty_vocabulary(monkeypatch, tmp_path):
    broken = tmp_path / "schema.json"
    broken.write_text(json.dumps({"taxonomy": {"thematic_categories": []}}), encoding="utf-8")
    monkeypatch.setattr(taxonomy, "SCHEMA_PATH", broken)
    with pytest.raises(RuntimeError, match="missing or empty"):
        taxonomy.thematic_categories()


def test_auto_categorize_guard_raises_on_unknown_bucket(monkeypatch):
    # A rule keyed to a bucket schema no longer lists is a real bug: the guard
    # must stop the run. Drop a bucket that has a rule so its key goes unknown.
    shrunk = [c for c in _schema_names("thematic_categories") if c != "Journalism Education"]
    monkeypatch.setattr(auto_categorize_records, "thematic_categories", lambda: shrunk)
    with pytest.raises(SystemExit, match="not in backend/schema.json"):
        auto_categorize_records._assert_patterns_match_schema()


def test_auto_categorize_guard_passes_when_rule_removed_with_bucket(monkeypatch):
    # Pins the "To remove a category" runbook step in ADDING-RECORDS.md: a
    # category removal must also drop its CATEGORY_PATTERNS / URL_PATTERNS
    # entries in the same change. Do both, and the guard is satisfied (this
    # is the counterpart to test_auto_categorize_guard_raises_on_unknown_bucket
    # above, which proves the guard fires when only schema.json is edited).
    shrunk = [c for c in _schema_names("thematic_categories") if c != "Journalism Education"]
    monkeypatch.setattr(auto_categorize_records, "thematic_categories", lambda: shrunk)
    monkeypatch.setattr(
        auto_categorize_records,
        "CATEGORY_PATTERNS",
        {k: v for k, v in auto_categorize_records.CATEGORY_PATTERNS.items() if k != "Journalism Education"},
    )
    monkeypatch.setattr(
        auto_categorize_records,
        "URL_PATTERNS",
        {k: v for k, v in auto_categorize_records.URL_PATTERNS.items() if k != "Journalism Education"},
    )
    auto_categorize_records._assert_patterns_match_schema()  # must not raise


def test_auto_categorize_allows_manual_only_category(monkeypatch):
    # A new canonical bucket with no keyword rule must not block the run: a new
    # category needs no placeholder rules to be valid (issue #524).
    monkeypatch.setattr(
        auto_categorize_records,
        "thematic_categories",
        lambda: [*_schema_names("thematic_categories"), "Manual Only Bucket"],
    )
    auto_categorize_records._assert_patterns_match_schema()  # must not raise
