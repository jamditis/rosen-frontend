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

    def test_clean_text_basic(self):
        """Test basic text cleaning."""
        text = "  Test   text   with   spaces  "
        result = workflow.clean_text(text)
        
        assert result == "Test text with spaces"

    def test_clean_text_empty(self):
        """Test text cleaning with empty string."""
        result = workflow.clean_text("")
        
        assert result == ""

    def test_clean_text_none(self):
        """Test text cleaning with None."""
        result = workflow.clean_text(None)
        
        assert result == ""

    @patch('rosen_scraper.workflow.categorizer.analyze_article')
    def test_enrich_data_success(self, mock_analyze, sample_article_data, sample_schema):
        """Test data enrichment."""
        # Mock AI analysis
        analysis = {
            'summary': 'Test summary',
            'categories': ['Press Criticism'],
            'concepts': ['objectivity']
        }
        mock_analyze.return_value = analysis
        
        result = workflow.enrich_data(sample_article_data, sample_schema)
        
        assert result is not None
        assert 'summary' in result
        assert 'categories' in result

    def test_validate_record_valid(self, sample_article_data):
        """Test record validation with valid data."""
        record = {
            'url': 'https://example.com/test',
            'title': 'Test Article',
            'content': sample_article_data
        }
        
        result = workflow.validate_record(record)
        
        assert result is True

    def test_validate_record_missing_url(self, sample_article_data):
        """Test record validation with missing URL."""
        record = {
            'title': 'Test Article',
            'content': sample_article_data
        }
        
        result = workflow.validate_record(record)
        
        assert result is False

    def test_validate_record_missing_title(self, sample_article_data):
        """Test record validation with missing title."""
        record = {
            'url': 'https://example.com/test',
            'content': sample_article_data
        }
        
        result = workflow.validate_record(record)
        
        assert result is False

    def test_paywalled_domains_list(self):
        """Test that paywalled domains list is defined."""
        assert hasattr(workflow, 'PAYWALLED_DOMAINS')
        assert isinstance(workflow.PAYWALLED_DOMAINS, list)
        assert len(workflow.PAYWALLED_DOMAINS) > 0
