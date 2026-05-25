"""
Tests for the entity extractor module.
"""

import json
from unittest.mock import patch, MagicMock
from rosen_scraper import entity_extractor


class TestEntityExtractor:
    """Tests for entity extraction functionality."""

    def test_load_entity_schema_success(self, tmp_path, monkeypatch):
        """Test successful entity schema loading."""
        # Create a temporary schema file
        schema_data = {
            "entity_types": ["Person", "Organization", "Work"],
            "relationship_types": ["authored", "works_at"],
        }
        schema_file = tmp_path / "entity_extraction_schema.json"
        with open(schema_file, "w") as f:
            json.dump(schema_data, f)

        # Patch the schema file path
        monkeypatch.setattr(
            "rosen_scraper.entity_extractor.ENTITY_SCHEMA_FILE", schema_file
        )

        result = entity_extractor.load_entity_schema()

        assert result is not None
        assert "entity_types" in result
        assert "relationship_types" in result

    def test_load_entity_schema_not_found(self, tmp_path, monkeypatch):
        """Test schema loading when file doesn't exist."""
        schema_file = tmp_path / "nonexistent.json"
        monkeypatch.setattr(
            "rosen_scraper.entity_extractor.ENTITY_SCHEMA_FILE", schema_file
        )

        result = entity_extractor.load_entity_schema()

        assert result == {}

    def test_normalize_entity_list_with_list(self):
        """Test normalizing entity list from list input."""
        entities_data = [
            {"entity_id": "ENT-001", "name": "Jay Rosen", "type": "Person"},
            {"entity_id": "ENT-002", "name": "NYU", "type": "Organization"},
        ]

        result = entity_extractor._normalize_entity_list(entities_data)

        assert len(result) == 2
        assert result[0]["entity_id"] == "ENT-001"

    def test_normalize_entity_list_with_dict(self):
        """Test normalizing entity list from dict input."""
        entities_data = {"entity_id": "ENT-001", "name": "Jay Rosen", "type": "Person"}

        result = entity_extractor._normalize_entity_list(entities_data)

        assert len(result) == 1
        assert result[0]["entity_id"] == "ENT-001"

    def test_normalize_entity_list_with_none(self):
        """Test normalizing entity list with None input."""
        result = entity_extractor._normalize_entity_list(None)

        assert result == []

    def test_normalize_entity_list_with_empty_list(self):
        """Test normalizing entity list with empty list."""
        result = entity_extractor._normalize_entity_list([])

        assert result == []

    def test_normalize_relationship_list_with_list(self):
        """Test normalizing relationship list from list input."""
        relationships_data = [
            {"source": "ENT-001", "target": "ENT-002", "type": "works_at"},
            {"source": "ENT-001", "target": "ENT-003", "type": "authored"},
        ]

        result = entity_extractor._normalize_relationship_list(relationships_data)

        assert len(result) == 2
        assert result[0]["type"] == "works_at"

    def test_normalize_relationship_list_with_none(self):
        """Test normalizing relationship list with None input."""
        result = entity_extractor._normalize_relationship_list(None)

        assert result == []

    @patch("rosen_scraper.entity_extractor.genai.GenerativeModel")
    def test_extract_entities_and_relationships_success(
        self, mock_model, sample_article_data
    ):
        """Test successful entity extraction."""
        # Mock AI response
        mock_response = MagicMock()
        mock_response.text = json.dumps(
            {
                "entities": [
                    {
                        "entity_id": "ENT-001",
                        "entity_name": "Jay Rosen",
                        "entity_type": "Person",
                        "role": "Professor of Journalism",
                        "affiliation": "NYU",
                        "prominence_score": 8,
                    },
                    {
                        "entity_id": "ENT-002",
                        "entity_name": "NYU",
                        "entity_type": "Organization",
                        "org_type": "University",
                        "prominence_score": 7,
                    },
                ],
                "relationships": [
                    {
                        "source_entity_id": "ENT-001",
                        "target_entity_id": "ENT-002",
                        "relationship_type": "Affiliated With",
                        "context": "Jay Rosen is a professor at NYU.",
                        "confidence_score": 0.95,
                    }
                ],
            }
        )

        mock_instance = MagicMock()
        mock_instance.generate_content.return_value = mock_response
        mock_model.return_value = mock_instance

        with patch.dict("os.environ", {"GEMINI_API_KEY": "test_key"}):
            result = entity_extractor.extract_entities_and_relationships(
                text_content=sample_article_data.get("text"),
                record_id="REC-001",
                record_title=sample_article_data.get("title"),
            )

        assert result is not None
        assert "entities" in result
        assert "relationships" in result
        assert result["entities"][0]["entity_name"] == "Jay Rosen"
        assert result["relationships"][0]["relationship_type"] == "Affiliated With"

    def test_format_entities_for_sheet(self):
        """Test formatting entities for Google Sheets."""
        entities = [
            {
                "entity_id": "ENT-001",
                "entity_name": "Jay Rosen",
                "entity_type": "Person",
                "role": "Professor of Journalism",
                "prominence_score": 8,
            }
        ]
        record_id = "REC-001"

        result = entity_extractor.format_entities_for_sheet(entities, record_id, set())

        assert isinstance(result, list)
        assert result == [
            [
                "ENT-001",
                "Person",
                "Jay Rosen",
                "Jay Rosen",
                "Professor of Journalism",
                "",
                "8",
                "REC-001",
                "1",
                "",
                "",
            ]
        ]

    def test_format_relationships_for_sheet(self):
        """Test formatting relationships for Google Sheets."""
        relationships = [
            {
                "source_entity_id": "ENT-001",
                "target_entity_id": "ENT-002",
                "relationship_type": "Affiliated With",
                "context": "Jay Rosen is affiliated with NYU.",
                "confidence_score": 0.95,
            }
        ]
        record_id = "REC-001"

        result = entity_extractor.format_relationships_for_sheet(
            relationships,
            record_id,
            {"ENT-001": "Jay Rosen", "ENT-002": "NYU"},
        )

        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0][:9] == [
            "REC-001_REL_001",
            "REC-001",
            "ENT-001",
            "Jay Rosen",
            "Affiliated With",
            "ENT-002",
            "NYU",
            "Jay Rosen is affiliated with NYU.",
            "0.95",
        ]
