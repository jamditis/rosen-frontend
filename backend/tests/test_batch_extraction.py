"""
Tests for the batch entity extraction script.

Tests verify:
1. format_post_for_extraction() — Anthropic Batch API format, entity types in prompt
2. parse_extraction_response() — entity/relationship parsing, field mapping to DB schema
3. parse_extraction_response() with invalid types — rejection of invalid types
4. Type-specific fields mapped to role_or_description
"""

import json
import importlib
import pytest
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
import sys

# Add backend and backend/src to path so both scripts/ and rosen_scraper/ resolve
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(backend_dir / "src"))

# Import the module by file path since scripts/ is not a package
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "batch_entity_extraction",
    backend_dir / "scripts" / "batch_entity_extraction.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

BatchEntityExtractor = _mod.BatchEntityExtractor
format_post_for_extraction = _mod.format_post_for_extraction
parse_extraction_response = _mod.parse_extraction_response
build_extraction_prompt = _mod.build_extraction_prompt
VALID_ENTITY_TYPES = _mod.VALID_ENTITY_TYPES
VALID_RELATIONSHIP_TYPES = _mod.VALID_RELATIONSHIP_TYPES
ENTITY_TYPE_PREFIXES = _mod.ENTITY_TYPE_PREFIXES


class TestFormatPostForExtraction:
    """Tests for format_post_for_extraction()."""

    def test_returns_anthropic_batch_request_format(self):
        """The output must match Anthropic Batch API request structure."""
        post = {
            "id": "BSKY-12345",
            "raw_text": "Jay Rosen discusses the view from nowhere concept at NYU.",
            "publication_date": "2024-06-15",
            "likes": "10",
            "reposts": "3",
        }

        result = format_post_for_extraction(post)

        # Must have custom_id and params at top level
        assert "custom_id" in result
        assert "params" in result
        assert result["custom_id"] == "BSKY-12345"

        # params must have model, max_tokens, messages
        params = result["params"]
        assert "model" in params
        assert "max_tokens" in params
        assert "messages" in params

        # messages must be a list with at least one user message
        messages = params["messages"]
        assert isinstance(messages, list)
        assert len(messages) >= 1

        user_messages = [m for m in messages if m["role"] == "user"]
        assert len(user_messages) >= 1

    def test_prompt_contains_all_entity_types(self):
        """The prompt must mention all 6 entity types."""
        post = {
            "id": "BSKY-99999",
            "raw_text": "Some post content here.",
            "publication_date": "2024-01-01",
            "likes": "0",
            "reposts": "0",
        }

        result = format_post_for_extraction(post)
        # Get all text content from messages
        all_text = ""
        for msg in result["params"]["messages"]:
            content = msg.get("content", "")
            if isinstance(content, str):
                all_text += content
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        all_text += block["text"]

        for entity_type in VALID_ENTITY_TYPES:
            assert entity_type in all_text, f"Entity type '{entity_type}' not found in prompt"

    def test_prompt_contains_all_relationship_types(self):
        """The prompt must mention all 15 relationship types."""
        post = {
            "id": "BSKY-00001",
            "raw_text": "Test content.",
            "publication_date": "2024-01-01",
            "likes": "0",
            "reposts": "0",
        }

        result = format_post_for_extraction(post)
        all_text = ""
        for msg in result["params"]["messages"]:
            content = msg.get("content", "")
            if isinstance(content, str):
                all_text += content
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        all_text += block["text"]

        for rel_type in VALID_RELATIONSHIP_TYPES:
            assert rel_type in all_text, f"Relationship type '{rel_type}' not found in prompt"

    def test_post_content_included_in_user_message(self):
        """The actual post text must appear in the user message."""
        post = {
            "id": "BSKY-54321",
            "raw_text": "Margaret Sullivan criticizes Fox News coverage of the election.",
            "publication_date": "2024-11-05",
            "likes": "42",
            "reposts": "15",
        }

        result = format_post_for_extraction(post)
        user_content = ""
        for msg in result["params"]["messages"]:
            if msg["role"] == "user":
                content = msg.get("content", "")
                if isinstance(content, str):
                    user_content += content
                elif isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            user_content += block["text"]

        assert "Margaret Sullivan criticizes Fox News" in user_content

    def test_custom_id_matches_post_id(self):
        """custom_id must match the post's id field."""
        post = {
            "id": "TW-ABCDEF",
            "raw_text": "Some tweet.",
            "publication_date": "2023-05-01",
            "likes": "1",
            "reposts": "0",
        }

        result = format_post_for_extraction(post)
        assert result["custom_id"] == "TW-ABCDEF"


class TestParseExtractionResponse:
    """Tests for parse_extraction_response()."""

    def test_parses_valid_entities(self):
        """Valid entity extraction JSON should be parsed correctly."""
        response_json = {
            "entities": [
                {
                    "entity_id": "P001",
                    "entity_type": "Person",
                    "entity_name": "Jay Rosen",
                    "role": "Journalism professor",
                    "affiliation": "New York University",
                    "prominence_score": 10,
                },
                {
                    "entity_id": "O001",
                    "entity_type": "Organization",
                    "entity_name": "New York University",
                    "org_type": "Academic institution",
                    "prominence_score": 5,
                },
            ],
            "relationships": [
                {
                    "source_entity_id": "P001",
                    "target_entity_id": "O001",
                    "relationship_type": "Affiliated With",
                    "context_snippet": "journalism professor at NYU",
                    "confidence_score": 0.95,
                }
            ],
        }

        entities, relationships = parse_extraction_response(
            json.dumps(response_json), "BSKY-12345"
        )

        assert len(entities) == 2
        assert len(relationships) == 1

        # Check first entity
        assert entities[0]["entity_name"] == "Jay Rosen"
        assert entities[0]["entity_type"] == "Person"

        # Check relationship
        assert relationships[0]["relationship_type"] == "Affiliated With"
        assert relationships[0]["source_entity_id"] == "P001"

    def test_maps_role_to_role_or_description(self):
        """Person 'role' field must map to 'role_or_description' in DB schema."""
        response_json = {
            "entities": [
                {
                    "entity_id": "P001",
                    "entity_type": "Person",
                    "entity_name": "Jay Rosen",
                    "role": "Journalism professor",
                    "prominence_score": 10,
                }
            ],
            "relationships": [],
        }

        entities, _ = parse_extraction_response(
            json.dumps(response_json), "BSKY-001"
        )

        assert entities[0]["role_or_description"] == "Journalism professor"
        assert "role" not in entities[0]

    def test_maps_org_type_to_role_or_description(self):
        """Organization 'org_type' field must map to 'role_or_description'."""
        response_json = {
            "entities": [
                {
                    "entity_id": "O001",
                    "entity_type": "Organization",
                    "entity_name": "The New York Times",
                    "org_type": "News outlet",
                    "prominence_score": 8,
                }
            ],
            "relationships": [],
        }

        entities, _ = parse_extraction_response(
            json.dumps(response_json), "BSKY-002"
        )

        assert entities[0]["role_or_description"] == "News outlet"
        assert "org_type" not in entities[0]

    def test_maps_work_type_to_role_or_description(self):
        """Work 'work_type' field must map to 'role_or_description'."""
        response_json = {
            "entities": [
                {
                    "entity_id": "W001",
                    "entity_type": "Work",
                    "entity_name": "Why Political Coverage Is Broken",
                    "work_type": "Blog post",
                    "author": "Jay Rosen",
                    "prominence_score": 7,
                }
            ],
            "relationships": [],
        }

        entities, _ = parse_extraction_response(
            json.dumps(response_json), "BSKY-003"
        )

        assert entities[0]["role_or_description"] == "Blog post"
        assert "work_type" not in entities[0]

    def test_maps_event_type_to_role_or_description(self):
        """Event 'event_type' field must map to 'role_or_description'."""
        response_json = {
            "entities": [
                {
                    "entity_id": "E001",
                    "entity_type": "Event",
                    "entity_name": "2016 Presidential Election",
                    "event_type": "Political election",
                    "prominence_score": 9,
                }
            ],
            "relationships": [],
        }

        entities, _ = parse_extraction_response(
            json.dumps(response_json), "BSKY-004"
        )

        assert entities[0]["role_or_description"] == "Political election"
        assert "event_type" not in entities[0]

    def test_maps_location_type_to_role_or_description(self):
        """Location 'location_type' field must map to 'role_or_description'."""
        response_json = {
            "entities": [
                {
                    "entity_id": "L001",
                    "entity_type": "Location",
                    "entity_name": "Washington D.C.",
                    "location_type": "City",
                    "prominence_score": 4,
                }
            ],
            "relationships": [],
        }

        entities, _ = parse_extraction_response(
            json.dumps(response_json), "BSKY-005"
        )

        assert entities[0]["role_or_description"] == "City"
        assert "location_type" not in entities[0]

    def test_rejects_invalid_entity_types(self):
        """Entities with invalid types must be filtered out."""
        response_json = {
            "entities": [
                {
                    "entity_id": "P001",
                    "entity_type": "Person",
                    "entity_name": "Jay Rosen",
                    "role": "Professor",
                    "prominence_score": 10,
                },
                {
                    "entity_id": "X001",
                    "entity_type": "Animal",
                    "entity_name": "Some Dog",
                    "prominence_score": 3,
                },
            ],
            "relationships": [],
        }

        entities, _ = parse_extraction_response(
            json.dumps(response_json), "BSKY-006"
        )

        assert len(entities) == 1
        assert entities[0]["entity_type"] == "Person"

    def test_rejects_invalid_relationship_types(self):
        """Relationships with invalid types must be filtered out."""
        response_json = {
            "entities": [
                {
                    "entity_id": "P001",
                    "entity_type": "Person",
                    "entity_name": "Jay Rosen",
                    "role": "Professor",
                    "prominence_score": 10,
                },
                {
                    "entity_id": "O001",
                    "entity_type": "Organization",
                    "entity_name": "NYU",
                    "org_type": "University",
                    "prominence_score": 5,
                },
            ],
            "relationships": [
                {
                    "source_entity_id": "P001",
                    "target_entity_id": "O001",
                    "relationship_type": "Affiliated With",
                    "context_snippet": "teaches at NYU",
                    "confidence_score": 0.95,
                },
                {
                    "source_entity_id": "P001",
                    "target_entity_id": "O001",
                    "relationship_type": "Loves",
                    "context_snippet": "fake relationship",
                    "confidence_score": 0.5,
                },
            ],
        }

        _, relationships = parse_extraction_response(
            json.dumps(response_json), "BSKY-007"
        )

        assert len(relationships) == 1
        assert relationships[0]["relationship_type"] == "Affiliated With"

    def test_handles_empty_response(self):
        """Empty entities/relationships should return empty lists."""
        response_json = {"entities": [], "relationships": []}

        entities, relationships = parse_extraction_response(
            json.dumps(response_json), "BSKY-008"
        )

        assert entities == []
        assert relationships == []

    def test_handles_malformed_json(self):
        """Malformed JSON should return empty lists, not crash."""
        entities, relationships = parse_extraction_response(
            "this is not json at all", "BSKY-009"
        )

        assert entities == []
        assert relationships == []

    def test_handles_json_wrapped_in_markdown(self):
        """JSON wrapped in markdown code fences should still parse."""
        response_json = {
            "entities": [
                {
                    "entity_id": "P001",
                    "entity_type": "Person",
                    "entity_name": "Jay Rosen",
                    "role": "Professor",
                    "prominence_score": 10,
                }
            ],
            "relationships": [],
        }

        raw = f"```json\n{json.dumps(response_json)}\n```"
        entities, relationships = parse_extraction_response(raw, "BSKY-010")

        assert len(entities) == 1
        assert entities[0]["entity_name"] == "Jay Rosen"

    def test_context_snippet_truncated_to_200_chars(self):
        """context_snippet longer than 200 chars should be truncated."""
        long_snippet = "x" * 300
        response_json = {
            "entities": [
                {
                    "entity_id": "P001",
                    "entity_type": "Person",
                    "entity_name": "Jay Rosen",
                    "role": "Professor",
                    "prominence_score": 10,
                },
                {
                    "entity_id": "O001",
                    "entity_type": "Organization",
                    "entity_name": "NYU",
                    "org_type": "University",
                    "prominence_score": 5,
                },
            ],
            "relationships": [
                {
                    "source_entity_id": "P001",
                    "target_entity_id": "O001",
                    "relationship_type": "Affiliated With",
                    "context_snippet": long_snippet,
                    "confidence_score": 0.9,
                }
            ],
        }

        _, relationships = parse_extraction_response(
            json.dumps(response_json), "BSKY-011"
        )

        assert len(relationships[0]["evidence"]) <= 200

    def test_adds_source_record_id_to_relationships(self):
        """Each relationship should get the post_id as source_record_id."""
        response_json = {
            "entities": [
                {
                    "entity_id": "P001",
                    "entity_type": "Person",
                    "entity_name": "Jay Rosen",
                    "role": "Professor",
                    "prominence_score": 10,
                },
                {
                    "entity_id": "O001",
                    "entity_type": "Organization",
                    "entity_name": "NYU",
                    "org_type": "University",
                    "prominence_score": 5,
                },
            ],
            "relationships": [
                {
                    "source_entity_id": "P001",
                    "target_entity_id": "O001",
                    "relationship_type": "Affiliated With",
                    "context_snippet": "teaches at NYU",
                    "confidence_score": 0.95,
                }
            ],
        }

        _, relationships = parse_extraction_response(
            json.dumps(response_json), "BSKY-012"
        )

        assert relationships[0]["source_record_id"] == "BSKY-012"


class TestEntityTypePrefixes:
    """Tests for entity type prefix mapping."""

    def test_all_six_types_have_prefixes(self):
        """All 6 entity types must have prefix mappings."""
        assert ENTITY_TYPE_PREFIXES["Person"] == "P"
        assert ENTITY_TYPE_PREFIXES["Organization"] == "O"
        assert ENTITY_TYPE_PREFIXES["Work"] == "W"
        assert ENTITY_TYPE_PREFIXES["Concept"] == "C"
        assert ENTITY_TYPE_PREFIXES["Event"] == "E"
        assert ENTITY_TYPE_PREFIXES["Location"] == "L"
        assert len(ENTITY_TYPE_PREFIXES) == 6


class TestValidTypes:
    """Tests for valid entity and relationship type constants."""

    def test_six_entity_types(self):
        """Must have exactly 6 entity types."""
        expected = {"Person", "Organization", "Work", "Concept", "Event", "Location"}
        assert VALID_ENTITY_TYPES == expected

    def test_fifteen_relationship_types(self):
        """Must have exactly 15 relationship types."""
        expected = {
            "Mentions", "Criticizes", "Cites", "Discusses", "Expands On",
            "Affiliated With", "Published In", "Originated By", "Occurred At",
            "Supports", "Owns", "Owned By", "Founded By", "Pioneered",
            "Inspired By",
        }
        assert VALID_RELATIONSHIP_TYPES == expected


class TestBuildExtractionPrompt:
    """Tests for the extraction prompt builder."""

    def test_prompt_requests_json_output(self):
        """The prompt must ask for JSON output."""
        prompt = build_extraction_prompt(
            "Jay Rosen discusses journalism.", "BSKY-001"
        )
        assert "JSON" in prompt or "json" in prompt

    def test_prompt_includes_post_content(self):
        """The prompt must include the actual post text."""
        text = "Margaret Sullivan on media accountability"
        prompt = build_extraction_prompt(text, "BSKY-002")
        assert text in prompt

    def test_prompt_includes_entity_id_format(self):
        """The prompt must show the ID prefix format (P001, O001, etc.)."""
        prompt = build_extraction_prompt("Test post", "BSKY-003")
        # Should show at least some ID prefix examples
        assert "P0" in prompt or "P00" in prompt
