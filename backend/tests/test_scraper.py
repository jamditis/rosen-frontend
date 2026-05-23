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


class TestRenderedContentHeuristic:
    """The JS-detection heuristic in _looks_like_rendered_content (issue #159).

    The old test was ``len(text) > 1500 and "javascript" not in text.lower()``.
    Almost every real page contains the substring "javascript" (script tags,
    <noscript> blocks), so that check forced nearly every page onto the slow
    Playwright path. The replacement strips site chrome and measures the
    main-content text length instead.
    """

    def test_article_element_with_text_is_rendered(self):
        """An <article> element carrying real text needs no browser render."""
        html = ('<html><body><article>'
                + ('The press informs the public. ' * 40)
                + '</article></body></html>')
        assert scraper._looks_like_rendered_content(html) is True

    def test_paragraph_body_is_rendered(self):
        """A body built from <p> blocks is recognised as a rendered article."""
        paragraph = '<p>' + ('Rosen on objectivity in the press. ' * 4) + '</p>'
        html = '<html><body><div>' + paragraph * 6 + '</div></body></html>'
        assert scraper._looks_like_rendered_content(html) is True

    def test_div_based_article_is_rendered(self):
        """Codex finding 1: a body using <div> markup (no <article>/<p>).

        Measuring text instead of counting <article>/<p> tags means div- or
        section-based article bodies are recognised, not forced to Playwright.
        """
        html = ('<html><body><div class="post">'
                + ('<div>Journalism is a public service. </div>' * 30)
                + '</div></body></html>')
        assert scraper._looks_like_rendered_content(html) is True

    def test_page_containing_javascript_word_is_still_rendered(self):
        """The core regression: a real article that mentions "javascript".

        The old substring check classified this as a JS loader and wasted a
        Playwright invocation. A rendered <article> must win regardless.
        """
        html = ('<html><head>'
                '<script type="text/javascript">var x = 1;</script>'
                '</head><body><article>'
                + ('A real article about journalism and the press. ' * 30)
                + '</article></body></html>')
        assert scraper._looks_like_rendered_content(html) is True

    def test_empty_spa_shell_is_not_rendered(self):
        """An empty SPA shell — even with a short <noscript> notice — renders.

        The "enable JavaScript" notice is far below the length threshold, so
        keeping <noscript> in the measured text does not cause a false match.
        """
        html = ('<html><head><script src="/app.js"></script></head>'
                '<body><div id="root"></div>'
                '<noscript>You need to enable JavaScript to run this app.'
                '</noscript></body></html>')
        assert scraper._looks_like_rendered_content(html) is False

    def test_noscript_article_fallback_is_rendered(self):
        """Codex finding (pass 2): a full article inside <noscript> is content.

        Some sites serve the readable article as a no-JS fallback. That text
        must still count, so <noscript> is not stripped before measuring.
        """
        html = ('<html><body><div id="root"></div><noscript>'
                + ('The archive preserves the full text here. ' * 30)
                + '</noscript></body></html>')
        assert scraper._looks_like_rendered_content(html) is True

    def test_spa_shell_with_nav_and_footer_chrome_is_not_rendered(self):
        """Codex finding 2: a verbose nav/footer must not look like content.

        An SPA shell that ships long navigation and legal-footer text in the
        initial HTML still has an empty content region — it needs Playwright.
        """
        nav_text = 'Home About Archive Contact Subscribe Newsletter ' * 12
        footer_text = ('Copyright 2024. All rights reserved. Terms of service '
                       'and privacy policy apply. ') * 12
        html = ('<html><body>'
                '<nav>' + nav_text + '</nav>'
                '<div id="root"></div>'
                '<footer>' + footer_text + '</footer>'
                '</body></html>')
        assert scraper._looks_like_rendered_content(html) is False

    def test_spa_shell_with_cookie_dialog_is_not_rendered(self):
        """Codex finding 2: a role="dialog" cookie banner is not article body.

        Without stripping role-tagged chrome the long consent text would clear
        the length threshold and the unrendered shell would be returned.
        """
        cookie_text = ('We use cookies and similar technologies to improve '
                       'your browsing experience and analyze site traffic. '
                       ) * 8
        html = ('<html><body>'
                '<div role="dialog" aria-label="Cookie consent">'
                + cookie_text + '</div>'
                '<div id="root"></div>'
                '</body></html>')
        assert scraper._looks_like_rendered_content(html) is False

    def test_shell_with_only_short_footer_text_is_not_rendered(self):
        """Boilerplate footer links are too short to count as article body."""
        html = ('<html><body><div id="root"></div>'
                '<footer><p>(c) 2024</p><p>Privacy</p></footer>'
                '</body></html>')
        assert scraper._looks_like_rendered_content(html) is False

    def test_short_article_with_semantic_markup_is_rendered(self):
        """Codex finding (pass 3): a short server-rendered <article> is content.

        The same body text stays below the volume threshold without the
        <article> wrapper, so only the semantic-markup signal can accept it —
        a brief but fully rendered post must not be forced onto Playwright.
        """
        body = ('<p>Journalism is a public service, not a product.</p>'
                '<p>This short post is fully rendered in the server HTML, so '
                'the fast scrape already has every word it needs.</p>')
        assert scraper._looks_like_rendered_content(
            '<html><body>' + body + '</body></html>') is False
        assert scraper._looks_like_rendered_content(
            '<html><body><article>' + body + '</article></body></html>'
        ) is True

    def test_empty_semantic_region_is_not_rendered(self):
        """An empty <main> in an SPA shell does not satisfy the markup signal."""
        html = ('<html><body><main></main>'
                '<div id="root"></div></body></html>')
        assert scraper._looks_like_rendered_content(html) is False

    def test_empty_or_blank_html_is_not_rendered(self):
        """Empty and whitespace-only responses are never rendered articles."""
        assert scraper._looks_like_rendered_content('') is False
        assert scraper._looks_like_rendered_content('   \n  ') is False

    def test_article_with_nested_header_byline_is_rendered(self):
        """Copilot finding (PR #195): a short <article> whose semantic region
        includes a nested <header> byline must be detected as rendered.

        Stripping <header>/<footer>/<aside> globally — including inside
        <article>/<main> — drops the article's own title block from the
        semantic-region text count and pushes short WordPress-style posts
        (<article><header class="entry-header">…</header>…) below
        _MIN_SEMANTIC_REGION_CHARS, forcing an unneeded Playwright fallback.
        """
        html = (
            '<html><body><article>'
            '<header class="entry-header">'
            '<h1>Reflections on objectivity in the modern American press</h1>'
            '<p class="byline">By Jay Rosen, posted June 2024.</p>'
            '</header>'
            '<p>The public is a real audience, not an abstraction.</p>'
            '</article></body></html>')
        assert scraper._looks_like_rendered_content(html) is True

    def test_chrome_header_outside_article_is_still_stripped(self):
        """A page-chrome <header> with no <article>/<main> ancestor is removed.

        Counterpart to the nested-header test: the chrome-only filter must
        still strip site headers that are NOT nested inside an article, or
        an SPA shell with a verbose site header would look like a rendered
        article and skip Playwright.
        """
        chrome = ('Home About Archive Subscribe Newsletter Sign in '
                  'Search Categories Tags Topics Authors Issues ') * 12
        html = ('<html><body>'
                f'<header>{chrome}</header>'
                '<div id="root"></div>'
                '</body></html>')
        assert scraper._looks_like_rendered_content(html) is False


class TestRequestsRetry:
    """Transient-error retry/backoff in _get_with_retry (issue #159).

    A single network blip or 5xx previously skipped straight to the expensive
    Playwright fallback. _get_with_retry retries transient failures with
    exponential backoff before giving up.
    """

    @patch('rosen_scraper.scraper.time.sleep')
    @patch('rosen_scraper.scraper.requests.get')
    def test_retries_transient_connection_error_then_succeeds(
        self, mock_get, mock_sleep
    ):
        """Two connection errors are retried; the third attempt's 200 wins."""
        ok = Mock(status_code=200)
        mock_get.side_effect = [
            requests.ConnectionError('reset'),
            requests.ConnectionError('reset'),
            ok,
        ]

        result = scraper._get_with_retry(
            'https://example.com', headers={}, timeout=5)

        assert result is ok
        assert mock_get.call_count == 3
        assert mock_sleep.call_count == 2

    @patch('rosen_scraper.scraper.time.sleep')
    @patch('rosen_scraper.scraper.requests.get')
    def test_retries_transient_5xx_then_succeeds(self, mock_get, mock_sleep):
        """A 503 is retried; a later 200 is returned instead."""
        busy = Mock(status_code=503)
        ok = Mock(status_code=200)
        mock_get.side_effect = [busy, ok]

        result = scraper._get_with_retry(
            'https://example.com', headers={}, timeout=5)

        assert result is ok
        assert mock_get.call_count == 2
        assert mock_sleep.call_count == 1

    @patch('rosen_scraper.scraper.time.sleep')
    @patch('rosen_scraper.scraper.requests.get')
    def test_gives_up_after_max_attempts_on_persistent_error(
        self, mock_get, mock_sleep
    ):
        """A persistent network error re-raises after the attempt budget."""
        mock_get.side_effect = requests.ConnectionError('host down')

        with pytest.raises(requests.RequestException):
            scraper._get_with_retry(
                'https://example.com', headers={}, timeout=5)

        assert mock_get.call_count == scraper._RETRY_MAX_ATTEMPTS

    @patch('rosen_scraper.scraper.time.sleep')
    @patch('rosen_scraper.scraper.requests.get')
    def test_returns_persistent_5xx_after_exhausting_retries(
        self, mock_get, mock_sleep
    ):
        """A 503 that never clears is returned so raise_for_status can surface it."""
        busy = Mock(status_code=503)
        mock_get.return_value = busy

        result = scraper._get_with_retry(
            'https://example.com', headers={}, timeout=5)

        assert result is busy
        assert mock_get.call_count == scraper._RETRY_MAX_ATTEMPTS

    @patch('rosen_scraper.scraper.time.sleep')
    @patch('rosen_scraper.scraper.requests.get')
    def test_no_retry_on_first_success(self, mock_get, mock_sleep):
        """A clean 200 returns on the first attempt without sleeping."""
        ok = Mock(status_code=200)
        mock_get.return_value = ok

        result = scraper._get_with_retry(
            'https://example.com', headers={}, timeout=5)

        assert result is ok
        assert mock_get.call_count == 1
        mock_sleep.assert_not_called()

    @patch('rosen_scraper.scraper.time.sleep')
    @patch('rosen_scraper.scraper.requests.get')
    def test_no_retry_on_permanent_4xx(self, mock_get, mock_sleep):
        """A 404 is permanent — return it immediately, do not retry."""
        not_found = Mock(status_code=404)
        mock_get.return_value = not_found

        result = scraper._get_with_retry(
            'https://example.com', headers={}, timeout=5)

        assert result is not_found
        assert mock_get.call_count == 1
        mock_sleep.assert_not_called()

    @patch('rosen_scraper.scraper.time.sleep')
    @patch('rosen_scraper.scraper.requests.get')
    def test_backoff_grows_exponentially(self, mock_get, mock_sleep):
        """Each retry waits twice as long as the previous one."""
        mock_get.side_effect = requests.ConnectionError('x')

        with pytest.raises(requests.RequestException):
            scraper._get_with_retry(
                'https://example.com', headers={}, timeout=5)

        delays = [call.args[0] for call in mock_sleep.call_args_list]
        assert delays == [
            scraper._RETRY_BACKOFF_BASE_SECONDS,
            scraper._RETRY_BACKOFF_BASE_SECONDS * 2,
        ]

    @patch('rosen_scraper.scraper.time.sleep')
    @patch('rosen_scraper.scraper.requests.get')
    def test_requests_get_safe_retries_transient_error(
        self, mock_get, mock_sleep
    ):
        """The retry is wired into _requests_get_safe, not just the helper."""
        final = Mock(
            status_code=200, is_redirect=False, is_permanent_redirect=False)
        mock_get.side_effect = [requests.ConnectionError('reset'), final]

        result = scraper._requests_get_safe(
            'https://example.com/start', headers={}, timeout=5)

        assert result is final
        assert mock_get.call_count == 2

    @patch('rosen_scraper.scraper.time.sleep')
    @patch('rosen_scraper.scraper.requests.get')
    def test_transient_response_is_closed_before_sleep(
        self, mock_get, mock_sleep
    ):
        """Copilot finding (PR #195): a retried transient response is closed
        before sleeping so the underlying socket returns to requests'
        connection pool instead of waiting for GC during retry-heavy runs.
        """
        busy = Mock(status_code=503)
        ok = Mock(status_code=200)
        mock_get.side_effect = [busy, ok]

        scraper._get_with_retry(
            'https://example.com', headers={}, timeout=5)

        busy.close.assert_called_once()

    @patch('rosen_scraper.scraper.time.sleep')
    @patch('rosen_scraper.scraper.requests.get')
    def test_returned_response_is_not_closed(self, mock_get, mock_sleep):
        """The successful response stays open so the caller can read .content."""
        ok = Mock(status_code=200)
        mock_get.return_value = ok

        result = scraper._get_with_retry(
            'https://example.com', headers={}, timeout=5)

        assert result is ok
        ok.close.assert_not_called()
