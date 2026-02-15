"""
Tests for the batch metadata filler script.

Tests verify:
1. find_records_missing_field() — correctly identifies records missing categories/key_concepts,
   excludes social post types (Tweet/Thread, Social Media Thread)
2. format_record_for_classification() — formats Anthropic Batch API request with taxonomy in prompt
3. parse_classification_response() — validates categories against allowed list, rejects invalid ones
4. parse_classification_response() — validates concepts against allowed list
"""

import json
import csv
import io
import importlib
import importlib.util
import pytest
from pathlib import Path
import sys

# Add backend and backend/src to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(backend_dir / "src"))

# Import the module by file path since scripts/ is not a package
_spec = importlib.util.spec_from_file_location(
    "batch_metadata_filler",
    backend_dir / "scripts" / "batch_metadata_filler.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

find_records_missing_field = _mod.find_records_missing_field
format_record_for_classification = _mod.format_record_for_classification
parse_classification_response = _mod.parse_classification_response
VALID_CATEGORIES = _mod.VALID_CATEGORIES
VALID_KEY_CONCEPTS = _mod.VALID_KEY_CONCEPTS
SOCIAL_CONTENT_TYPES = _mod.SOCIAL_CONTENT_TYPES


# ---------------------------------------------------------------------------
# Test data helpers
# ---------------------------------------------------------------------------


def _make_record(**overrides):
    """Create a minimal archive record dict with sensible defaults."""
    defaults = {
        "id": "PRESSTH-00001",
        "title": "Why Political Coverage Is Broken",
        "url": "https://pressthink.org/2011/08/why-political-coverage-is-broken/",
        "summary": "Jay Rosen explains how political journalism fails the public.",
        "excerpt": "The quest for innocence is the deepest form of bias.",
        "thematic_categories": "Press & Media Criticism|Journalism Theory & Practice",
        "key_concepts": "View from Nowhere|Church of the Savvy",
        "content_type": "Article",
    }
    defaults.update(overrides)
    return defaults


# ---------------------------------------------------------------------------
# Tests for find_records_missing_field
# ---------------------------------------------------------------------------


class TestFindRecordsMissingField:
    """Tests for find_records_missing_field()."""

    def test_finds_records_missing_categories(self):
        """Records with empty thematic_categories should be returned."""
        records = [
            _make_record(id="R1", thematic_categories="Press & Media Criticism"),
            _make_record(id="R2", thematic_categories=""),
            _make_record(id="R3", thematic_categories=""),
        ]
        missing = find_records_missing_field(records, "thematic_categories")
        assert len(missing) == 2
        assert {r["id"] for r in missing} == {"R2", "R3"}

    def test_finds_records_missing_key_concepts(self):
        """Records with empty key_concepts should be returned."""
        records = [
            _make_record(id="R1", key_concepts="View from Nowhere"),
            _make_record(id="R2", key_concepts=""),
            _make_record(id="R3", key_concepts=""),
            _make_record(id="R4", key_concepts=""),
        ]
        missing = find_records_missing_field(records, "key_concepts")
        assert len(missing) == 3

    def test_excludes_social_post_types(self):
        """Tweet/Thread and Social Media Thread types should be excluded."""
        records = [
            _make_record(id="R1", key_concepts="", content_type="Article"),
            _make_record(id="R2", key_concepts="", content_type="Tweet/Thread"),
            _make_record(id="R3", key_concepts="", content_type="Social Media Thread"),
            _make_record(id="R4", key_concepts="", content_type="Interview (Audio/Video)"),
        ]
        missing = find_records_missing_field(records, "key_concepts")
        assert len(missing) == 2
        assert {r["id"] for r in missing} == {"R1", "R4"}

    def test_whitespace_only_counts_as_missing(self):
        """Fields with only whitespace should count as missing."""
        records = [
            _make_record(id="R1", thematic_categories="   "),
            _make_record(id="R2", thematic_categories="  \t  "),
        ]
        missing = find_records_missing_field(records, "thematic_categories")
        assert len(missing) == 2


# ---------------------------------------------------------------------------
# Tests for format_record_for_classification
# ---------------------------------------------------------------------------


class TestFormatRecordForClassification:
    """Tests for format_record_for_classification()."""

    def test_returns_anthropic_batch_request_format(self):
        """Output must match the Anthropic Batch API request structure."""
        record = _make_record()
        result = format_record_for_classification(record, "thematic_categories")

        assert "custom_id" in result
        assert "params" in result
        assert result["custom_id"] == record["id"]

        params = result["params"]
        assert "model" in params
        assert "max_tokens" in params
        assert "messages" in params
        assert isinstance(params["messages"], list)
        assert len(params["messages"]) >= 1

    def test_prompt_contains_category_names_for_categories_field(self):
        """When filling categories, prompt must list all valid categories."""
        record = _make_record(thematic_categories="")
        result = format_record_for_classification(record, "thematic_categories")

        prompt_text = result["params"]["messages"][0]["content"]
        for category in VALID_CATEGORIES:
            assert category in prompt_text, f"Category '{category}' not in prompt"

    def test_prompt_contains_concept_names_for_concepts_field(self):
        """When filling key_concepts, prompt must list all valid concepts."""
        record = _make_record(key_concepts="")
        result = format_record_for_classification(record, "key_concepts")

        prompt_text = result["params"]["messages"][0]["content"]
        for concept in VALID_KEY_CONCEPTS:
            assert concept in prompt_text, f"Concept '{concept}' not in prompt"

    def test_prompt_includes_record_context(self):
        """Prompt must include the record's title, summary, and excerpt."""
        record = _make_record(
            title="Test Title ABC",
            summary="Summary of the article XYZ.",
            excerpt="A compelling quote here.",
        )
        result = format_record_for_classification(record, "thematic_categories")
        prompt_text = result["params"]["messages"][0]["content"]

        assert "Test Title ABC" in prompt_text
        assert "Summary of the article XYZ" in prompt_text
        assert "A compelling quote here" in prompt_text

    def test_prompt_includes_url(self):
        """Prompt should include the record URL for context."""
        record = _make_record(url="https://pressthink.org/test")
        result = format_record_for_classification(record, "thematic_categories")
        prompt_text = result["params"]["messages"][0]["content"]
        assert "https://pressthink.org/test" in prompt_text

    def test_custom_id_matches_record_id(self):
        """custom_id must match the record's id field."""
        record = _make_record(id="NYT-00042")
        result = format_record_for_classification(record, "thematic_categories")
        assert result["custom_id"] == "NYT-00042"


# ---------------------------------------------------------------------------
# Tests for parse_classification_response
# ---------------------------------------------------------------------------


class TestParseClassificationResponse:
    """Tests for parse_classification_response()."""

    def test_parses_valid_categories(self):
        """Valid category names should be returned."""
        response = json.dumps({
            "thematic_categories": [
                "Press & Media Criticism",
                "Politics & Democracy",
            ]
        })
        result = parse_classification_response(response, "thematic_categories")
        assert result == ["Press & Media Criticism", "Politics & Democracy"]

    def test_rejects_invalid_categories(self):
        """Categories not in the allowed list should be filtered out."""
        response = json.dumps({
            "thematic_categories": [
                "Press & Media Criticism",
                "Underwater Basket Weaving",
                "Journalism Theory & Practice",
            ]
        })
        result = parse_classification_response(response, "thematic_categories")
        assert "Underwater Basket Weaving" not in result
        assert len(result) == 2

    def test_parses_valid_concepts(self):
        """Valid key concepts should be returned."""
        response = json.dumps({
            "key_concepts": [
                "View from Nowhere",
                "Church of the Savvy",
            ]
        })
        result = parse_classification_response(response, "key_concepts")
        assert result == ["View from Nowhere", "Church of the Savvy"]

    def test_rejects_invalid_concepts(self):
        """Concepts not in the allowed list should be filtered out."""
        response = json.dumps({
            "key_concepts": [
                "View from Nowhere",
                "Made Up Concept",
            ]
        })
        result = parse_classification_response(response, "key_concepts")
        assert result == ["View from Nowhere"]

    def test_handles_empty_list(self):
        """Empty list should return empty list."""
        response = json.dumps({"key_concepts": []})
        result = parse_classification_response(response, "key_concepts")
        assert result == []

    def test_handles_malformed_json(self):
        """Malformed JSON should return empty list."""
        result = parse_classification_response("not json", "thematic_categories")
        assert result == []

    def test_handles_markdown_wrapped_json(self):
        """JSON wrapped in markdown code fences should parse correctly."""
        inner = json.dumps({
            "thematic_categories": ["Press & Media Criticism"]
        })
        raw = f"```json\n{inner}\n```"
        result = parse_classification_response(raw, "thematic_categories")
        assert result == ["Press & Media Criticism"]

    def test_limits_categories_to_three(self):
        """At most 3 categories should be returned."""
        response = json.dumps({
            "thematic_categories": [
                "Press & Media Criticism",
                "Journalism Theory & Practice",
                "Journalism Education",
                "Politics & Democracy",
                "Technology & Digital Media",
            ]
        })
        result = parse_classification_response(response, "thematic_categories")
        assert len(result) <= 3

    def test_limits_concepts_to_two(self):
        """At most 2 key concepts should be returned."""
        response = json.dumps({
            "key_concepts": [
                "View from Nowhere",
                "Church of the Savvy",
                "Horse-race journalism",
                "False balance",
            ]
        })
        result = parse_classification_response(response, "key_concepts")
        assert len(result) <= 2

    def test_returns_empty_for_missing_field_key(self):
        """If the expected field key is missing from JSON, return empty list."""
        response = json.dumps({"wrong_key": ["something"]})
        result = parse_classification_response(response, "thematic_categories")
        assert result == []


# ---------------------------------------------------------------------------
# Tests for constants
# ---------------------------------------------------------------------------


class TestConstants:
    """Tests for taxonomy constants."""

    def test_six_valid_categories(self):
        """Must have exactly 6 valid thematic categories."""
        assert len(VALID_CATEGORIES) == 6
        assert "Press & Media Criticism" in VALID_CATEGORIES
        assert "Journalism Theory & Practice" in VALID_CATEGORIES
        assert "Journalism Education" in VALID_CATEGORIES
        assert "Politics & Democracy" in VALID_CATEGORIES
        assert "Technology & Digital Media" in VALID_CATEGORIES
        assert "Audience & Public Engagement" in VALID_CATEGORIES

    def test_thirteen_valid_concepts(self):
        """Must have exactly 13 valid key concepts."""
        assert len(VALID_KEY_CONCEPTS) == 13
        assert "View from Nowhere" in VALID_KEY_CONCEPTS
        assert "Mindcasting" in VALID_KEY_CONCEPTS

    def test_social_content_types(self):
        """Social content types used for exclusion."""
        assert "Tweet/Thread" in SOCIAL_CONTENT_TYPES
        assert "Social Media Thread" in SOCIAL_CONTENT_TYPES
