"""
Tests for the entity extractor module.
"""
import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from rosen_scraper import entity_extractor


class TestEntityExtractor:
    """Tests for entity extraction functionality."""

    def test_load_entity_schema_success(self, tmp_path, monkeypatch):
        """Test successful entity schema loading."""
        # Create a temporary schema file
        schema_data = {
            'entity_types': ['Person', 'Organization', 'Work'],
            'relationship_types': ['authored', 'works_at']
        }
        schema_file = tmp_path / "entity_extraction_schema.json"
        with open(schema_file, 'w') as f:
            json.dump(schema_data, f)
        
        # Patch the schema file path
        monkeypatch.setattr('rosen_scraper.entity_extractor.ENTITY_SCHEMA_FILE', schema_file)
        
        result = entity_extractor.load_entity_schema()
        
        assert result is not None
        assert 'entity_types' in result
        assert 'relationship_types' in result

    def test_load_entity_schema_not_found(self, tmp_path, monkeypatch):
        """Test schema loading when file doesn't exist."""
        schema_file = tmp_path / "nonexistent.json"
        monkeypatch.setattr('rosen_scraper.entity_extractor.ENTITY_SCHEMA_FILE', schema_file)
        
        result = entity_extractor.load_entity_schema()
        
        assert result == {}

    def test_normalize_entity_list_with_list(self):
        """Test normalizing entity list from list input."""
        entities_data = [
            {'entity_id': 'ENT-001', 'name': 'Jay Rosen', 'type': 'Person'},
            {'entity_id': 'ENT-002', 'name': 'NYU', 'type': 'Organization'}
        ]
        
        result = entity_extractor._normalize_entity_list(entities_data)
        
        assert len(result) == 2
        assert result[0]['entity_id'] == 'ENT-001'

    def test_normalize_entity_list_with_dict(self):
        """Test normalizing entity list from dict input."""
        entities_data = {'entity_id': 'ENT-001', 'name': 'Jay Rosen', 'type': 'Person'}
        
        result = entity_extractor._normalize_entity_list(entities_data)
        
        assert len(result) == 1
        assert result[0]['entity_id'] == 'ENT-001'

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
            {'source': 'ENT-001', 'target': 'ENT-002', 'type': 'works_at'},
            {'source': 'ENT-001', 'target': 'ENT-003', 'type': 'authored'}
        ]
        
        result = entity_extractor._normalize_relationship_list(relationships_data)
        
        assert len(result) == 2
        assert result[0]['type'] == 'works_at'

    def test_normalize_relationship_list_with_none(self):
        """Test normalizing relationship list with None input."""
        result = entity_extractor._normalize_relationship_list(None)
        
        assert result == []

    @patch('rosen_scraper.entity_extractor.genai.GenerativeModel')
    def test_extract_entities_and_relationships_success(self, mock_model, sample_article_data):
        """Test successful entity extraction."""
        # Mock AI response
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            'entities': [
                {
                    'entity_id': 'ENT-001',
                    'name': 'Jay Rosen',
                    'type': 'Person',
                    'description': 'Professor of Journalism at NYU'
                },
                {
                    'entity_id': 'ENT-002',
                    'name': 'NYU',
                    'type': 'Organization',
                    'description': 'New York University'
                }
            ],
            'relationships': [
                {
                    'source': 'ENT-001',
                    'target': 'ENT-002',
                    'type': 'works_at'
                }
            ]
        })
        
        mock_instance = MagicMock()
        mock_instance.generate_content.return_value = mock_response
        mock_model.return_value = mock_instance
        
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test_key'}):
            with patch('rosen_scraper.entity_extractor.load_entity_schema', return_value={'entity_types': ['Person', 'Organization']}):
                result = entity_extractor.extract_entities_and_relationships(
                    record_id='REC-001',
                    text=sample_article_data.get('text'),
                    title=sample_article_data.get('title')
                )
        
        assert result is not None
        if result:  # Might be None if API key handling differs
            assert 'entities' in result
            assert 'relationships' in result

    def test_format_entities_for_sheet(self):
        """Test formatting entities for Google Sheets."""
        entities = [
            {
                'entity_id': 'ENT-001',
                'name': 'Jay Rosen',
                'type': 'Person',
                'description': 'Professor of Journalism'
            }
        ]
        record_id = 'REC-001'
        
        result = entity_extractor.format_entities_for_sheet(entities, record_id)
        
        assert isinstance(result, list)
        if len(result) > 0:
            assert isinstance(result[0], list)  # Each row is a list

    def test_format_relationships_for_sheet(self):
        """Test formatting relationships for Google Sheets."""
        relationships = [
            {
                'source': 'ENT-001',
                'target': 'ENT-002',
                'type': 'works_at'
            }
        ]
        record_id = 'REC-001'
        
        result = entity_extractor.format_relationships_for_sheet(relationships, record_id)
        
        assert isinstance(result, list)
        if len(result) > 0:
            assert isinstance(result[0], list)  # Each row is a list
