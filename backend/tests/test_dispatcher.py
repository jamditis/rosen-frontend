"""
Tests for the dispatcher module.
"""

from unittest.mock import patch
from rosen_scraper import dispatcher
from rosen_scraper.processors.twitter_processor import TwitterProcessor
from rosen_scraper.processors.bluesky_processor import BlueskyProcessor


class TestDispatcherModule:
    """Tests for URL dispatcher functionality."""

    @patch("rosen_scraper.dispatcher.video_processor.process_video")
    def test_dispatch_url_youtube_standard(self, mock_process_video, sample_schema):
        """Test dispatching standard YouTube URL."""
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        expected_result = {"type": "video", "title": "Test Video"}
        mock_process_video.return_value = expected_result

        result = dispatcher.dispatch_url(url, sample_schema)

        assert result == expected_result
        mock_process_video.assert_called_once_with(url, sample_schema)

    @patch("rosen_scraper.dispatcher.video_processor.process_video")
    def test_dispatch_url_youtube_short(self, mock_process_video, sample_schema):
        """Test dispatching short YouTube URL (youtu.be)."""
        url = "https://youtu.be/dQw4w9WgXcQ"
        expected_result = {"type": "video", "title": "Test Video"}
        mock_process_video.return_value = expected_result

        result = dispatcher.dispatch_url(url, sample_schema)

        assert result == expected_result
        mock_process_video.assert_called_once_with(url, sample_schema)

    @patch("rosen_scraper.dispatcher.article_processor.process_article")
    def test_dispatch_url_article(self, mock_process_article, sample_schema):
        """Test dispatching article URL."""
        url = "https://example.com/article"
        expected_result = {"type": "article", "title": "Test Article"}
        mock_process_article.return_value = expected_result

        result = dispatcher.dispatch_url(url, sample_schema)

        assert result == expected_result
        mock_process_article.assert_called_once_with(url, sample_schema)

    @patch("rosen_scraper.dispatcher.article_processor.process_article")
    def test_dispatch_url_pressthink(self, mock_process_article, sample_schema):
        """Test dispatching PressThink blog URL."""
        url = "https://pressthink.org/2024/test-article"
        expected_result = {"type": "article", "title": "Test Article"}
        mock_process_article.return_value = expected_result

        result = dispatcher.dispatch_url(url, sample_schema)

        assert result == expected_result
        mock_process_article.assert_called_once_with(url, sample_schema)

    @patch("rosen_scraper.dispatcher.article_processor.process_article")
    def test_dispatch_url_nytimes(self, mock_process_article, sample_schema):
        """Test dispatching New York Times URL."""
        url = "https://www.nytimes.com/2024/01/15/test-article.html"
        expected_result = {"type": "article", "title": "Test Article"}
        mock_process_article.return_value = expected_result

        result = dispatcher.dispatch_url(url, sample_schema)

        assert result == expected_result
        mock_process_article.assert_called_once_with(url, sample_schema)

    @patch("rosen_scraper.dispatcher.article_processor._run_ai_analysis")
    def test_reprocess_text_success(self, mock_ai_analysis, sample_schema):
        """Test text reprocessing."""
        raw_text = "This is sample text content for reprocessing."
        expected_result = {
            "summary": "Test summary",
            "categories": ["Press Criticism"],
            "concepts": ["objectivity"],
        }
        mock_ai_analysis.return_value = expected_result

        result = dispatcher.reprocess_text(raw_text, sample_schema)

        assert result == expected_result
        mock_ai_analysis.assert_called_once_with(raw_text, sample_schema)

    @patch("rosen_scraper.dispatcher.article_processor._run_ai_analysis")
    def test_reprocess_text_empty(self, mock_ai_analysis, sample_schema):
        """Test reprocessing empty text."""
        raw_text = ""
        mock_ai_analysis.return_value = None

        result = dispatcher.reprocess_text(raw_text, sample_schema)

        assert result is None

    @patch("rosen_scraper.dispatcher.article_processor._run_ai_analysis")
    def test_reprocess_text_long_content(self, mock_ai_analysis, sample_schema):
        """Test reprocessing long text content."""
        raw_text = "Long article content. " * 1000  # Simulate long article
        expected_result = {
            "summary": "Summary of long article",
            "categories": ["Media Theory"],
            "concepts": ["transparency", "accountability"],
        }
        mock_ai_analysis.return_value = expected_result

        result = dispatcher.reprocess_text(raw_text, sample_schema)

        assert result == expected_result

    @patch("rosen_scraper.dispatcher.video_processor.process_video")
    def test_dispatch_url_youtube_embedded(self, mock_process_video, sample_schema):
        """Test dispatching YouTube embedded URL."""
        url = "https://www.youtube.com/embed/dQw4w9WgXcQ"
        expected_result = {"type": "video", "title": "Test Video"}
        mock_process_video.return_value = expected_result

        result = dispatcher.dispatch_url(url, sample_schema)

        assert result == expected_result
        mock_process_video.assert_called_once_with(url, sample_schema)

    @patch("rosen_scraper.dispatcher.article_processor.process_article")
    def test_dispatch_url_with_query_params(self, mock_process_article, sample_schema):
        """Test dispatching URL with query parameters."""
        url = "https://example.com/article?utm_source=test&ref=homepage"
        expected_result = {"type": "article", "title": "Test Article"}
        mock_process_article.return_value = expected_result

        result = dispatcher.dispatch_url(url, sample_schema)

        assert result == expected_result

    @patch("rosen_scraper.dispatcher.article_processor.process_article")
    def test_dispatch_url_with_fragment(self, mock_process_article, sample_schema):
        """Test dispatching URL with fragment identifier."""
        url = "https://example.com/article#section-2"
        expected_result = {"type": "article", "title": "Test Article"}
        mock_process_article.return_value = expected_result

        result = dispatcher.dispatch_url(url, sample_schema)

        assert result == expected_result

    @patch("rosen_scraper.dispatcher.article_processor.process_article")
    def test_dispatch_url_tumblr_routes_to_article(
        self, mock_process_article, sample_schema
    ):
        """A live tumblr.com URL routes to the article scraper, not a crash.

        Regression for #286: the Tumblr branch built TumblrProcessor() — which
        requires export_dir and has no .process(url) — so every live Tumblr
        submission raised. Tumblr posts are HTML pages; the article cascade
        (URL Context -> trafilatura -> Playwright) handles them.
        """
        url = "https://jayrosen.tumblr.com/post/123456/a-title"
        expected_result = {"type": "article", "title": "Tumblr post"}
        mock_process_article.return_value = expected_result

        result = dispatcher.dispatch_url(url, sample_schema)

        assert result == expected_result
        mock_process_article.assert_called_once_with(url, sample_schema)

    @patch("rosen_scraper.dispatcher.article_processor.process_article")
    def test_dispatch_url_pdf_routes_to_article(
        self, mock_process_article, sample_schema
    ):
        """A live .pdf URL routes to the article scraper, not a crash.

        Regression for #286: the PDF branch called ClippingProcessor().process(url),
        but ClippingProcessor has no .process() method, so every PDF submission
        raised AttributeError. The URL Context scraper can read PDFs; an
        extraction failure degrades to None (sheet status 'error'), never a crash.
        """
        url = "https://example.com/clippings/rosen-1999.pdf"
        expected_result = {"type": "article", "title": "PDF clipping"}
        mock_process_article.return_value = expected_result

        result = dispatcher.dispatch_url(url, sample_schema)

        assert result == expected_result
        mock_process_article.assert_called_once_with(url, sample_schema)


class TestDispatcherSocial:
    """Twitter/Bluesky dispatch via the shared _process_social path (#490).

    These pin the class-based social branches the if/elif chain used to spell
    out twice; there was no coverage before the table collapse. The class's
    process() method is patched (not the dispatcher name) because
    _SOCIAL_PROCESSORS captures the class objects at import.
    """

    @patch("rosen_scraper.dispatcher.article_processor._run_ai_analysis")
    @patch.object(TwitterProcessor, "process")
    def test_twitter_success_merges_ai(self, mock_process, mock_ai, sample_schema):
        url = "https://twitter.com/jayrosen_nyu/status/123"
        mock_process.return_value = {
            "status": "success",
            "raw_text": "tweet body",
            "author": "Jay Rosen",
        }
        mock_ai.return_value = {"summary": "a summary", "categories": ["Press Criticism"]}

        result = dispatcher.dispatch_url(url, sample_schema)

        mock_process.assert_called_once_with(url)
        mock_ai.assert_called_once_with("tweet body", sample_schema)
        # clobber merge: AI fields land alongside the envelope, author preserved
        assert result["status"] == "success"
        assert result["summary"] == "a summary"
        assert result["categories"] == ["Press Criticism"]
        assert result["author"] == "Jay Rosen"

    @patch("rosen_scraper.dispatcher.article_processor._run_ai_analysis")
    @patch.object(BlueskyProcessor, "process")
    def test_bluesky_success_merges_ai(self, mock_process, mock_ai, sample_schema):
        url = "https://bsky.app/profile/jayrosen.bsky.social/post/abc123"
        mock_process.return_value = {"status": "success", "raw_text": "skeet body"}
        mock_ai.return_value = {"summary": "sky summary"}

        result = dispatcher.dispatch_url(url, sample_schema)

        mock_process.assert_called_once_with(url)
        mock_ai.assert_called_once_with("skeet body", sample_schema)
        assert result["summary"] == "sky summary"

    @patch("rosen_scraper.dispatcher.article_processor._run_ai_analysis")
    @patch.object(TwitterProcessor, "process")
    def test_failed_status_skips_analysis(self, mock_process, mock_ai, sample_schema):
        url = "https://x.com/jayrosen_nyu/status/999"
        mock_process.return_value = {"status": "failed", "error": "nitter down"}

        result = dispatcher.dispatch_url(url, sample_schema)

        mock_ai.assert_not_called()
        assert result == {"status": "failed", "error": "nitter down"}

    @patch("rosen_scraper.dispatcher.article_processor._run_ai_analysis")
    @patch.object(TwitterProcessor, "process")
    def test_success_without_raw_text_skips_analysis(
        self, mock_process, mock_ai, sample_schema
    ):
        url = "https://x.com/jayrosen_nyu/status/1000"
        mock_process.return_value = {"status": "success", "raw_text": ""}

        result = dispatcher.dispatch_url(url, sample_schema)

        mock_ai.assert_not_called()
        assert result == {"status": "success", "raw_text": ""}
