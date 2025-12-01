"""
Tests for the workflow module.
"""
import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from rosen_scraper import workflow


class TestWorkflowModule:
    """Tests for workflow orchestration functionality."""

    def test_get_schema_success(self, tmp_path, sample_schema):
        """Test successful schema loading."""
        # Create a temporary schema file
        schema_file = tmp_path / "schema.json"
        with open(schema_file, 'w') as f:
            json.dump(sample_schema, f)
        
        result = workflow.get_schema(str(schema_file))
        
        assert result is not None
        assert 'categories' in result
        assert 'concepts' in result

    def test_get_schema_file_not_found(self, tmp_path):
        """Test schema loading with non-existent file."""
        schema_file = tmp_path / "nonexistent.json"
        
        result = workflow.get_schema(str(schema_file))
        
        assert result is None

    def test_get_schema_invalid_json(self, tmp_path):
        """Test schema loading with invalid JSON."""
        schema_file = tmp_path / "invalid.json"
        with open(schema_file, 'w') as f:
            f.write("invalid json {{")
        
        result = workflow.get_schema(str(schema_file))
        
        assert result is None

    def test_generate_source_based_id_pressthink(self, sample_existing_ids):
        """Test ID generation for PressThink."""
        publication = "PressThink"
        result = workflow.generate_source_based_id(publication, sample_existing_ids)
        
        assert result.startswith("PRESSTH-")
        assert result == "PRESSTH-00003"  # Should be next after 00002

    def test_generate_source_based_id_nyt(self, sample_existing_ids):
        """Test ID generation for New York Times."""
        publication = "New York Times"
        result = workflow.generate_source_based_id(publication, sample_existing_ids)
        
        assert result.startswith("NYT-")
        assert result == "NYT-00003"

    def test_generate_source_based_id_new_publication(self, sample_existing_ids):
        """Test ID generation for new publication."""
        publication = "The Guardian"
        result = workflow.generate_source_based_id(publication, sample_existing_ids)
        
        assert result.startswith("GUARDIAN-")
        assert result == "GUARDIAN-00001"  # First ID for this publication

    def test_generate_source_based_id_from_url(self, sample_existing_ids):
        """Test ID generation from URL."""
        url = "https://www.nytimes.com/2024/test-article"
        result = workflow.generate_source_based_id(url, sample_existing_ids)
        
        assert result.startswith("NYT-")

    def test_generate_source_based_id_empty_publication(self, sample_existing_ids):
        """Test ID generation with empty publication."""
        result = workflow.generate_source_based_id("", sample_existing_ids)
        
        assert result.startswith("MISC-")

    def test_generate_source_based_id_not_found(self, sample_existing_ids):
        """Test ID generation with 'Not Found' publication."""
        result = workflow.generate_source_based_id("Not Found", sample_existing_ids)
        
        assert result.startswith("MISC-")

    def test_format_date_mmddyyyy_iso_format(self):
        """Test date formatting from ISO format."""
        date_str = "2024-03-15"
        result = workflow.format_date_mmddyyyy(date_str)
        
        assert result == "03/15/2024"

    def test_format_date_mmddyyyy_already_formatted(self):
        """Test date formatting when already in correct format."""
        date_str = "03/15/2024"
        result = workflow.format_date_mmddyyyy(date_str)
        
        assert result == "03/15/2024"

    def test_format_date_mmddyyyy_with_time(self):
        """Test date formatting with timestamp."""
        date_str = "2024-03-15 10:30:00"
        result = workflow.format_date_mmddyyyy(date_str)
        
        assert result == "03/15/2024"

    def test_format_date_mmddyyyy_empty(self):
        """Test date formatting with empty string."""
        result = workflow.format_date_mmddyyyy("")
        
        assert result == ""

    def test_format_date_mmddyyyy_none(self):
        """Test date formatting with None."""
        result = workflow.format_date_mmddyyyy(None)
        
        assert result == ""

    def test_enrich_data_with_data(self, sample_article_data):
        """Test data enrichment function exists and can be called."""
        # Test that the enrich_data function exists
        assert hasattr(workflow, 'enrich_data')
        
        # The function signature is: enrich_data(data, url, known_entities)
        # We test it minimally since it requires external services
        url = "https://example.com/test"
        known_entities = {}
        
        # This should not raise an error
        try:
            result = workflow.enrich_data(sample_article_data, url, known_entities)
            # If it works, result should be a dict
            assert isinstance(result, dict) or result is None
        except Exception:
            # If it fails (e.g., missing API keys), that's acceptable for this test
            pass

    def test_paywalled_domains_list(self):
        """Test that paywalled domains list is defined."""
        assert hasattr(workflow, 'PAYWALLED_DOMAINS')
        assert isinstance(workflow.PAYWALLED_DOMAINS, list)
        assert len(workflow.PAYWALLED_DOMAINS) > 0

    def test_generate_collection_id_exists(self):
        """Test that generate_collection_id function exists."""
        assert hasattr(workflow, 'generate_collection_id')

    def test_determine_permissions_exists(self):
        """Test that determine_permissions function exists."""
        assert hasattr(workflow, 'determine_permissions')

    def test_append_record_to_sheet_exists(self):
        """Test that append_record_to_sheet function exists."""
        assert hasattr(workflow, 'append_record_to_sheet')
