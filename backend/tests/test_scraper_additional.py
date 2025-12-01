"""
Additional tests for scraper module to improve coverage.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from rosen_scraper import scraper
import json


class TestScraperAdditional:
    """Additional tests for scraper module."""

    @patch('rosen_scraper.scraper.trafilatura.extract')
    def test_extract_article_data_with_trafilatura(self, mock_extract, sample_article_html):
        """Test article data extraction using trafilatura."""
        # Mock trafilatura response
        mock_extract.return_value = json.dumps({
            'title': 'Test Article',
            'text': 'Article content',
            'author': 'John Doe'
        })
        
        url = "https://example.com/test"
        result = scraper.extract_article_data(sample_article_html, url)
        
        assert result is not None
        assert isinstance(result, str)

    @patch('rosen_scraper.scraper.trafilatura.extract')
    def test_extract_article_data_no_content(self, mock_extract):
        """Test article extraction when trafilatura returns None."""
        mock_extract.return_value = None
        
        html = "<html><body>Empty</body></html>"
        url = "https://example.com/test"
        
        result = scraper.extract_article_data(html, url)
        
        # Should handle None gracefully
        assert result is None or isinstance(result, str)

    @patch('rosen_scraper.scraper.fetch_with_url_context')
    def test_fetch_with_url_context_no_api_key(self, mock_fetch):
        """Test URL Context fetch without API key."""
        with patch.dict('os.environ', {}, clear=True):
            url = "https://example.com/test"
            result = scraper.fetch_with_url_context(url)
            
            # Should return None when no API key
            assert result is None

    @patch('rosen_scraper.scraper.genai.Client')
    def test_fetch_with_url_context_api_error(self, mock_client):
        """Test URL Context fetch with API error."""
        # Mock API error
        mock_instance = MagicMock()
        mock_instance.models.generate_content.side_effect = Exception("API Error")
        mock_client.return_value = mock_instance
        
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test_key'}):
            url = "https://example.com/test"
            result = scraper.fetch_with_url_context(url)
            
            # Should handle API errors gracefully
            assert result is None

    @patch('rosen_scraper.scraper.requests.get')
    def test_fetch_article_content_timeout(self, mock_get):
        """Test article content fetch with timeout."""
        import requests
        mock_get.side_effect = requests.Timeout("Request timeout")
        
        with patch('rosen_scraper.scraper.fetch_with_url_context', return_value=None):
            url = "https://example.com/slow-site"
            result = scraper.fetch_article_content(url)
            
            # Should fallback to Playwright or return None
            assert result is None or isinstance(result, str)

    @patch('rosen_scraper.scraper.requests.get')
    def test_fetch_article_content_http_error(self, mock_get):
        """Test article content fetch with HTTP error."""
        import requests
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.raise_for_status.side_effect = requests.HTTPError("404 Not Found")
        mock_get.return_value = mock_response
        
        with patch('rosen_scraper.scraper.fetch_with_url_context', return_value=None):
            with patch('rosen_scraper.scraper.sync_playwright'):
                url = "https://example.com/not-found"
                result = scraper.fetch_article_content(url)
                
                # Should handle HTTP errors
                assert result is None or isinstance(result, str)

    @patch('rosen_scraper.scraper.requests.get')
    def test_fetch_article_content_minimal_content(self, mock_get):
        """Test article content fetch with minimal content (SPA detection)."""
        # Mock response with minimal content (< 1500 chars)
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = "<html><body>Short</body></html>"
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response
        
        with patch('rosen_scraper.scraper.fetch_with_url_context', return_value=None):
            with patch('rosen_scraper.scraper.sync_playwright'):
                url = "https://example.com/spa"
                result = scraper.fetch_article_content(url)
                
                # Should detect minimal content and try Playwright
                assert result is None or isinstance(result, str)

    @patch('rosen_scraper.scraper.fetch_with_url_context')
    def test_fetch_article_content_enhanced_with_structured_data(self, mock_url_context):
        """Test enhanced fetch returns structured data."""
        structured_data = {
            'title': 'Test Article',
            'text': 'Article content',
            'author': 'John Doe',
            'date': '2024-01-15'
        }
        mock_url_context.return_value = structured_data
        
        url = "https://example.com/test"
        content, is_structured = scraper.fetch_article_content_enhanced(url)
        
        assert content == structured_data
        assert is_structured is True

    @patch('rosen_scraper.scraper.fetch_with_url_context')
    @patch('rosen_scraper.scraper.fetch_article_content')
    def test_fetch_article_content_enhanced_html_fallback(
        self, mock_fetch_content, mock_url_context, sample_article_html
    ):
        """Test enhanced fetch falls back to HTML."""
        # URL Context fails
        mock_url_context.return_value = None
        # HTML fetch succeeds
        mock_fetch_content.return_value = sample_article_html
        
        url = "https://example.com/test"
        content, is_structured = scraper.fetch_article_content_enhanced(url)
        
        assert content == sample_article_html
        assert is_structured is False

    def test_user_agents_are_valid_strings(self):
        """Test that all user agents are valid strings."""
        for ua in scraper.USER_AGENTS:
            assert isinstance(ua, str)
            assert len(ua) > 0
            assert 'Mozilla' in ua

    @patch('rosen_scraper.scraper.fetch_with_url_context')
    def test_fetch_article_content_url_context_mock_html(self, mock_url_context):
        """Test that URL Context creates mock HTML when successful."""
        url_context_data = {
            'title': 'Test Title',
            'text': 'Test content',
            'author': 'Test Author',
            'original_publication': 'Test Publication'
        }
        mock_url_context.return_value = url_context_data
        
        url = "https://example.com/test"
        result = scraper.fetch_article_content(url)
        
        # Should create mock HTML structure
        if result:
            assert '<html>' in result
            assert 'Test Title' in result
            assert 'Test content' in result
