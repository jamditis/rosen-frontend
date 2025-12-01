"""
Tests for the entity deduplicator module.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from rosen_scraper.entity_deduplicator import EntityDeduplicator


class TestEntityDeduplicator:
    """Tests for entity deduplication functionality."""

    def test_init(self):
        """Test EntityDeduplicator initialization."""
        deduper = EntityDeduplicator(spreadsheet_name="Test Sheet")
        
        assert deduper.spreadsheet_name == "Test Sheet"
        assert deduper.canonical_entities == {}
        assert deduper.id_mapping == {}

    def test_normalize_entity_name_basic(self):
        """Test basic entity name normalization."""
        deduper = EntityDeduplicator()
        
        # Test case normalization
        assert deduper._normalize_entity_name("Jay Rosen") == "jay rosen"
        assert deduper._normalize_entity_name("JAY ROSEN") == "jay rosen"
        
        # Test whitespace handling
        assert deduper._normalize_entity_name("  Jay   Rosen  ") == "jay rosen"

    def test_normalize_entity_name_special_chars(self):
        """Test entity name normalization with special characters."""
        deduper = EntityDeduplicator()
        
        # Test punctuation removal
        normalized = deduper._normalize_entity_name("O'Brien, Jr.")
        assert "," not in normalized
        assert "." not in normalized

    def test_is_duplicate_exact_match(self):
        """Test duplicate detection with exact match."""
        deduper = EntityDeduplicator()
        
        # Add a canonical entity
        deduper.canonical_entities["jay rosen"] = {
            'canonical_name': 'Jay Rosen',
            'canonical_id': 'ENT-001',
            'type': 'Person'
        }
        
        # Test exact match
        assert deduper._is_duplicate("Jay Rosen", "jay rosen") is True
        assert deduper._is_duplicate("Different Person", "jay rosen") is False

    def test_get_canonical_entity(self):
        """Test retrieving canonical entity."""
        deduper = EntityDeduplicator()
        
        # Add canonical entity
        canonical_data = {
            'canonical_name': 'Jay Rosen',
            'canonical_id': 'ENT-001',
            'type': 'Person'
        }
        deduper.canonical_entities["jay rosen"] = canonical_data
        
        # Test retrieval
        result = deduper._get_canonical_entity("jay rosen")
        assert result == canonical_data

    def test_add_canonical_entity(self):
        """Test adding a new canonical entity."""
        deduper = EntityDeduplicator()
        
        entity_data = {
            'name': 'Jay Rosen',
            'type': 'Person',
            'description': 'Professor of Journalism'
        }
        
        deduper._add_canonical_entity("jay rosen", entity_data, "ENT-001")
        
        assert "jay rosen" in deduper.canonical_entities
        canonical = deduper.canonical_entities["jay rosen"]
        assert canonical['canonical_name'] == 'Jay Rosen'
        assert canonical['canonical_id'] == 'ENT-001'
        assert canonical['type'] == 'Person'

    def test_deduplicate_entities_list(self):
        """Test deduplicating a list of entities."""
        deduper = EntityDeduplicator()
        
        entities = [
            {'name': 'Jay Rosen', 'type': 'Person', 'entity_id': 'ENT-001'},
            {'name': 'jay rosen', 'type': 'Person', 'entity_id': 'ENT-002'},
            {'name': 'JAY ROSEN', 'type': 'Person', 'entity_id': 'ENT-003'},
            {'name': 'Dan Rather', 'type': 'Person', 'entity_id': 'ENT-004'}
        ]
        
        deduplicated = deduper._deduplicate_entity_list(entities)
        
        # Should have only 2 unique entities (Jay Rosen variants deduplicated)
        assert len(deduplicated) == 2
        
        # Check that Jay Rosen variants map to same canonical ID
        jay_entities = [e for e in entities if 'rosen' in e['name'].lower()]
        canonical_ids = [deduper.id_mapping.get(e['entity_id'], e['entity_id']) 
                        for e in jay_entities]
        assert len(set(canonical_ids)) == 1  # All should map to same ID

    def test_process_entity_batch(self):
        """Test processing a batch of entity records."""
        deduper = EntityDeduplicator()
        
        records = [
            {
                'record_id': 'REC-001',
                'entities': [
                    {'name': 'Jay Rosen', 'type': 'Person', 'entity_id': 'ENT-001'},
                    {'name': 'PressThink', 'type': 'Publication', 'entity_id': 'ENT-002'}
                ]
            },
            {
                'record_id': 'REC-002',
                'entities': [
                    {'name': 'jay rosen', 'type': 'Person', 'entity_id': 'ENT-003'},
                    {'name': 'New York Times', 'type': 'Publication', 'entity_id': 'ENT-004'}
                ]
            }
        ]
        
        processed = deduper._process_entity_batch(records)
        
        assert len(processed) == 2
        # Jay Rosen should be deduplicated across records
        assert 'ENT-003' in deduper.id_mapping

    @patch('rosen_scraper.entity_deduplicator.gspread.service_account')
    def test_connect_to_sheets(self, mock_service_account, mock_env_vars):
        """Test connecting to Google Sheets."""
        # Mock the gspread client
        mock_gc = MagicMock()
        mock_spreadsheet = MagicMock()
        mock_gc.open.return_value = mock_spreadsheet
        mock_service_account.return_value = mock_gc
        
        deduper = EntityDeduplicator(spreadsheet_name="Test Sheet")
        deduper.connect_to_sheets()
        
        assert deduper.gc is not None
        assert deduper.spreadsheet is not None

    def test_generate_canonical_id(self):
        """Test canonical ID generation."""
        deduper = EntityDeduplicator()
        
        # Generate some IDs
        id1 = deduper._generate_canonical_id('Person', 1)
        id2 = deduper._generate_canonical_id('Person', 2)
        id3 = deduper._generate_canonical_id('Organization', 1)
        
        # IDs should be unique
        assert id1 != id2
        assert id1 != id3
        
        # IDs should follow expected format
        assert 'PERSON' in id1.upper() or 'ENT' in id1.upper()
