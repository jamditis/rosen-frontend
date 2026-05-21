"""
Tests for the categorizer module.
"""
import json
from unittest.mock import patch, MagicMock
from rosen_scraper import categorizer


class TestCategorizerModule:
    """Tests for categorizer/AI analysis functionality."""

    def test_to_list_with_list_input(self):
        """Test _to_list with list input."""
        input_list = ["item1", "item2", "item3"]
        result = categorizer._to_list(input_list)
        
        assert result == ["item1", "item2", "item3"]

    def test_to_list_with_string_input(self):
        """Test _to_list with comma-separated string."""
        input_str = "item1, item2, item3"
        result = categorizer._to_list(input_str)
        
        assert result == ["item1", "item2", "item3"]

    def test_to_list_with_none(self):
        """Test _to_list with None input."""
        result = categorizer._to_list(None)
        
        assert result == []

    def test_to_list_with_empty_string(self):
        """Test _to_list with empty string."""
        result = categorizer._to_list("")
        
        assert result == []

    def test_to_list_with_single_value(self):
        """Test _to_list with single value."""
        result = categorizer._to_list(123)
        
        assert result == ["123"]

    def test_extract_taxonomy_names_old_format(self):
        """Test taxonomy name extraction with old string format."""
        taxonomy_items = ["Press & Media Criticism", "Journalism Theory"]
        result = categorizer._extract_taxonomy_names(taxonomy_items)
        
        assert result == ["Press & Media Criticism", "Journalism Theory"]

    def test_extract_taxonomy_names_new_format(self):
        """Test taxonomy name extraction with new dict format."""
        taxonomy_items = [
            {"name": "Press & Media Criticism", "description": "Analysis of press"},
            {"name": "Journalism Theory", "description": "Theoretical frameworks"}
        ]
        result = categorizer._extract_taxonomy_names(taxonomy_items)
        
        assert result == ["Press & Media Criticism", "Journalism Theory"]

    def test_extract_taxonomy_names_empty(self):
        """Test taxonomy name extraction with empty input."""
        result = categorizer._extract_taxonomy_names([])
        
        assert result == []

    def test_extract_taxonomy_names_none(self):
        """Test taxonomy name extraction with None input."""
        result = categorizer._extract_taxonomy_names(None)
        
        assert result == []

    def test_format_categories_for_prompt_old_format(self):
        """Test category formatting for prompt with old format."""
        taxonomy_items = ["Press & Media Criticism", "Journalism Theory"]
        result = categorizer._format_categories_for_prompt(taxonomy_items)
        
        assert "Press & Media Criticism" in result
        assert "Journalism Theory" in result

    def test_format_categories_for_prompt_new_format(self):
        """Test category formatting for prompt with new format."""
        taxonomy_items = [
            {"name": "Press & Media Criticism", "description": "Analysis of press"},
            {"name": "Journalism Theory", "description": "Theoretical frameworks"}
        ]
        result = categorizer._format_categories_for_prompt(taxonomy_items)
        
        assert "Press & Media Criticism" in result
        assert "Analysis of press" in result

    def test_format_categories_for_prompt_empty(self):
        """Test category formatting with empty input."""
        result = categorizer._format_categories_for_prompt([])
        
        assert result == "[]"

    @patch('rosen_scraper.categorizer.genai.GenerativeModel')
    def test_summarize_and_classify_success(self, mock_model, sample_article_data, sample_schema):
        """Test successful article analysis."""
        # Mock AI response
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            'summary': 'Test summary of the article',
            'thematic_categories': ['Press & Media Criticism'],
            'key_concepts': ['objectivity', 'transparency'],
            'era': 'Digital Age',
            'scope': 'Media Analysis',
            'tags': ['journalism', 'media']
        })
        
        mock_instance = MagicMock()
        mock_instance.generate_content.return_value = mock_response
        mock_model.return_value = mock_instance
        
        # Mock API key
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test_key'}):
            result = categorizer.summarize_and_classify(
                sample_article_data.get('text'),
                sample_schema
            )
        
        assert result is not None
        assert 'summary' in result
        assert 'thematic_categories' in result
        assert 'key_concepts' in result

    @patch('rosen_scraper.categorizer.genai.GenerativeModel')
    def test_summarize_and_classify_invalid_json_response(self, mock_model, sample_article_data, sample_schema):
        """Test article analysis with invalid JSON response."""
        # Mock AI response with invalid JSON
        mock_response = MagicMock()
        mock_response.text = "Invalid JSON response"
        
        mock_instance = MagicMock()
        mock_instance.generate_content.return_value = mock_response
        mock_model.return_value = mock_instance
        
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test_key'}):
            result = categorizer.summarize_and_classify(
                sample_article_data.get('text'),
                sample_schema
            )
        
        # Should return None or handle gracefully
        assert result is None or isinstance(result, dict)

    def test_summarize_and_classify_no_api_key(self, sample_article_data, sample_schema):
        """Test article analysis without API key."""
        with patch.dict('os.environ', {}, clear=True):
            with patch('rosen_scraper.categorizer.os.environ.get', return_value=None):
                result = categorizer.summarize_and_classify(
                    sample_article_data.get('text'),
                    sample_schema
                )
        
        # Should handle missing API key gracefully
        assert result is None

    @patch('rosen_scraper.categorizer.genai.GenerativeModel')
    def test_summarize_and_classify_normalizes_output(self, mock_model, sample_article_data, sample_schema):
        """Test that article analysis normalizes output fields."""
        # Mock AI response with various formats
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            'summary': 'Test summary',
            'thematic_categories': 'Press & Media Criticism, Journalism Theory',  # String instead of list
            'key_concepts': ['objectivity'],
            'era': 'Digital Age',
            'scope': 'Media Analysis',
            'tags': ['journalism']
        })
        
        mock_instance = MagicMock()
        mock_instance.generate_content.return_value = mock_response
        mock_model.return_value = mock_instance
        
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test_key'}):
            result = categorizer.summarize_and_classify(
                sample_article_data.get('text'),
                sample_schema
            )
        
        # Should normalize string to list
        if result and 'thematic_categories' in result:
            assert isinstance(result['thematic_categories'], list)
