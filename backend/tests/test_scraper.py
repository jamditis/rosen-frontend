"""
Tests for the scraper module.
Tests the scraping cascade: URL Context -> Requests -> Playwright
"""
import pytest
import requests
from unittest.mock import Mock, patch
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

    @patch('rosen_scraper.scraper.fetch_with_url_context')
    def test_fetch_article_content_enhanced_url_context_success(
        self, mock_url_context, sample_article_data
    ):
        """Test enhanced fetch with URL Context success."""
        # Mock URL Context success with text content
        mock_url_context.return_value = sample_article_data
        
        url = "https://example.com/test"
        content, is_structured = scraper.fetch_article_content_enhanced(url)
        
        assert content is not None
        assert is_structured is True
        assert content == sample_article_data

    @patch('rosen_scraper.scraper.fetch_with_url_context')
    @patch('rosen_scraper.scraper.fetch_article_content')
    def test_fetch_article_content_enhanced_fallback_to_html(
        self, mock_fetch_content, mock_url_context, sample_article_html
    ):
        """Test enhanced fetch falls back to HTML when URL Context fails."""
        # Mock URL Context failure
        mock_url_context.return_value = None
        # Mock HTML fetch success
        mock_fetch_content.return_value = sample_article_html
        
        url = "https://example.com/test"
        content, is_structured = scraper.fetch_article_content_enhanced(url)
        
        assert content is not None
        assert is_structured is False
        assert content == sample_article_html

    @patch('rosen_scraper.scraper.fetch_with_url_context')
    @patch('rosen_scraper.scraper.fetch_article_content')
    def test_fetch_article_content_enhanced_all_fail(
        self, mock_fetch_content, mock_url_context
    ):
        """Test enhanced fetch when all methods fail."""
        # Mock all methods failing
        mock_url_context.return_value = None
        mock_fetch_content.return_value = None
        
        url = "https://example.com/test"
        content, is_structured = scraper.fetch_article_content_enhanced(url)
        
        assert content is None
        assert is_structured is False

    def test_user_agents_list_exists(self):
        """Test that user agents list is defined and non-empty."""
        assert hasattr(scraper, 'USER_AGENTS')
        assert len(scraper.USER_AGENTS) > 0
        assert all(isinstance(ua, str) for ua in scraper.USER_AGENTS)

    @patch('rosen_scraper.scraper.requests.get')
    def test_fetch_article_content_with_requests_success(self, mock_get):
        """A non-redirecting 200 response is returned by the requests path."""
        # Body long enough to clear the 1500-char "minimal content" threshold
        # so the cascade stops at requests and never reaches Playwright.
        body = ('<html><body><article>'
                + ('Rosen on the press. ' * 200)
                + '</article></body></html>')
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = body
        mock_response.headers = {'content-type': 'text/html'}
        mock_response.is_redirect = False
        mock_response.is_permanent_redirect = False
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        # Mock URL Context to fail so it falls back to requests
        with patch('rosen_scraper.scraper.fetch_with_url_context', return_value=None):
            result = scraper.fetch_article_content("https://example.com/test")

        assert result == body
        mock_get.assert_called_once()


class TestRequestsRedirectSafety:
    """The redirect-following SSRF guard in _requests_get_safe (issue #137).

    requests follows redirects on its own, so the entry-point URL check is not
    enough: a public URL can redirect to a private host. _requests_get_safe
    disables automatic redirects and re-validates every hop.
    """

    @patch('rosen_scraper.scraper.requests.get')
    def test_rejects_redirect_to_private_host(self, mock_get):
        """A 302 pointing at a link-local host must raise, not be followed."""
        redirect = Mock()
        redirect.is_redirect = True
        redirect.is_permanent_redirect = False
        redirect.headers = {'Location': 'http://169.254.169.254/latest/meta-data/'}
        mock_get.return_value = redirect

        with pytest.raises(requests.RequestException, match='unsafe redirect target'):
            scraper._requests_get_safe(
                'https://example.com/start', headers={}, timeout=5)

    @patch('rosen_scraper.scraper.requests.get')
    def test_follows_redirect_to_public_host(self, mock_get):
        """A redirect to another public host is followed to the final response."""
        first = Mock()
        first.is_redirect = True
        first.is_permanent_redirect = False
        first.headers = {'Location': 'https://example.org/final'}
        final = Mock()
        final.is_redirect = False
        final.is_permanent_redirect = False
        final.headers = {'content-type': 'text/html'}
        mock_get.side_effect = [first, final]

        result = scraper._requests_get_safe(
            'https://example.com/start', headers={}, timeout=5)

        assert result is final
        assert mock_get.call_count == 2

    @patch('rosen_scraper.scraper.requests.get')
    def test_rejects_overlong_redirect_chain(self, mock_get):
        """A redirect chain longer than the cap raises instead of looping."""
        hop = Mock()
        hop.is_redirect = True
        hop.is_permanent_redirect = False
        hop.headers = {'Location': 'https://example.com/next'}
        mock_get.return_value = hop

        with pytest.raises(requests.RequestException, match='redirect'):
            scraper._requests_get_safe(
                'https://example.com/start', headers={}, timeout=5)
