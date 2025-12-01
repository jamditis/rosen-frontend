"""
Tests for the scraper module.
Tests the scraping cascade: URL Context -> Requests -> Playwright
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from rosen_scraper import scraper


class TestScraperModule:
    """Tests for scraper functionality."""

    def test_extract_article_data_basic(self, sample_article_html):
        """Test basic article extraction from HTML."""
        url = "https://example.com/test"
        result = scraper.extract_article_data(sample_article_html, url)
        
        assert result is not None
        # Result should be JSON string
        assert isinstance(result, str)

    @patch('rosen_scraper.scraper.requests.get')
    def test_fetch_with_requests_success(self, mock_get, sample_article_html):
        """Test successful fetch with requests library."""
        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = sample_article_html
        mock_response.headers = {'content-type': 'text/html'}
        mock_get.return_value = mock_response
        
        url = "https://example.com/test"
        result = scraper.fetch_with_requests(url)
        
        assert result is not None
        assert sample_article_html in result

    @patch('rosen_scraper.scraper.requests.get')
    def test_fetch_with_requests_failure(self, mock_get):
        """Test failed fetch with requests library."""
        # Mock failed response
        mock_get.side_effect = Exception("Connection error")
        
        url = "https://example.com/test"
        result = scraper.fetch_with_requests(url)
        
        assert result is None

    @patch('rosen_scraper.scraper.fetch_with_url_context')
    @patch('rosen_scraper.scraper.fetch_with_requests')
    def test_fetch_article_content_enhanced_url_context_success(
        self, mock_requests, mock_url_context, sample_article_data
    ):
        """Test enhanced fetch with URL Context success."""
        # Mock URL Context success
        mock_url_context.return_value = sample_article_data
        
        url = "https://example.com/test"
        content, is_structured = scraper.fetch_article_content_enhanced(url)
        
        assert content is not None
        assert is_structured is True
        assert content == sample_article_data
        # Should not fallback to requests
        mock_requests.assert_not_called()

    @patch('rosen_scraper.scraper.fetch_with_url_context')
    @patch('rosen_scraper.scraper.fetch_with_requests')
    def test_fetch_article_content_enhanced_fallback_to_requests(
        self, mock_requests, mock_url_context, sample_article_html
    ):
        """Test enhanced fetch falls back to requests when URL Context fails."""
        # Mock URL Context failure
        mock_url_context.return_value = None
        # Mock requests success
        mock_requests.return_value = sample_article_html
        
        url = "https://example.com/test"
        content, is_structured = scraper.fetch_article_content_enhanced(url)
        
        assert content is not None
        assert is_structured is False
        assert content == sample_article_html
        mock_requests.assert_called_once_with(url)

    @patch('rosen_scraper.scraper.fetch_with_url_context')
    @patch('rosen_scraper.scraper.fetch_with_requests')
    @patch('rosen_scraper.scraper.fetch_with_playwright')
    def test_fetch_article_content_enhanced_fallback_to_playwright(
        self, mock_playwright, mock_requests, mock_url_context, sample_article_html
    ):
        """Test enhanced fetch falls back to Playwright when both URL Context and requests fail."""
        # Mock URL Context failure
        mock_url_context.return_value = None
        # Mock requests failure
        mock_requests.return_value = None
        # Mock Playwright success
        mock_playwright.return_value = sample_article_html
        
        url = "https://example.com/test"
        content, is_structured = scraper.fetch_article_content_enhanced(url)
        
        assert content is not None
        assert is_structured is False
        assert content == sample_article_html
        mock_playwright.assert_called_once_with(url)

    @patch('rosen_scraper.scraper.fetch_with_url_context')
    @patch('rosen_scraper.scraper.fetch_with_requests')
    @patch('rosen_scraper.scraper.fetch_with_playwright')
    def test_fetch_article_content_enhanced_all_fail(
        self, mock_playwright, mock_requests, mock_url_context
    ):
        """Test enhanced fetch when all methods fail."""
        # Mock all methods failing
        mock_url_context.return_value = None
        mock_requests.return_value = None
        mock_playwright.return_value = None
        
        url = "https://example.com/test"
        content, is_structured = scraper.fetch_article_content_enhanced(url)
        
        assert content is None
        assert is_structured is False

    def test_user_agents_list_exists(self):
        """Test that user agents list is defined and non-empty."""
        assert hasattr(scraper, 'USER_AGENTS')
        assert len(scraper.USER_AGENTS) > 0
        assert all(isinstance(ua, str) for ua in scraper.USER_AGENTS)
