"""
Tests for the dispatcher module.
"""
from unittest.mock import patch
from rosen_scraper import dispatcher


class TestDispatcherModule:
    """Tests for URL dispatcher functionality."""

    @patch('rosen_scraper.dispatcher.video_processor.process_video')
    def test_dispatch_url_youtube_standard(self, mock_process_video, sample_schema):
        """Test dispatching standard YouTube URL."""
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        expected_result = {'type': 'video', 'title': 'Test Video'}
        mock_process_video.return_value = expected_result
        
        result = dispatcher.dispatch_url(url, sample_schema)
        
        assert result == expected_result
        mock_process_video.assert_called_once_with(url, sample_schema)

    @patch('rosen_scraper.dispatcher.video_processor.process_video')
    def test_dispatch_url_youtube_short(self, mock_process_video, sample_schema):
        """Test dispatching short YouTube URL (youtu.be)."""
        url = "https://youtu.be/dQw4w9WgXcQ"
        expected_result = {'type': 'video', 'title': 'Test Video'}
        mock_process_video.return_value = expected_result
        
        result = dispatcher.dispatch_url(url, sample_schema)
        
        assert result == expected_result
        mock_process_video.assert_called_once_with(url, sample_schema)

    @patch('rosen_scraper.dispatcher.article_processor.process_article')
    def test_dispatch_url_article(self, mock_process_article, sample_schema):
        """Test dispatching article URL."""
        url = "https://example.com/article"
        expected_result = {'type': 'article', 'title': 'Test Article'}
        mock_process_article.return_value = expected_result
        
        result = dispatcher.dispatch_url(url, sample_schema)
        
        assert result == expected_result
        mock_process_article.assert_called_once_with(url, sample_schema)

    @patch('rosen_scraper.dispatcher.article_processor.process_article')
    def test_dispatch_url_pressthink(self, mock_process_article, sample_schema):
        """Test dispatching PressThink blog URL."""
        url = "https://pressthink.org/2024/test-article"
        expected_result = {'type': 'article', 'title': 'Test Article'}
        mock_process_article.return_value = expected_result
        
        result = dispatcher.dispatch_url(url, sample_schema)
        
        assert result == expected_result
        mock_process_article.assert_called_once_with(url, sample_schema)

    @patch('rosen_scraper.dispatcher.article_processor.process_article')
    def test_dispatch_url_nytimes(self, mock_process_article, sample_schema):
        """Test dispatching New York Times URL."""
        url = "https://www.nytimes.com/2024/01/15/test-article.html"
        expected_result = {'type': 'article', 'title': 'Test Article'}
        mock_process_article.return_value = expected_result
        
        result = dispatcher.dispatch_url(url, sample_schema)
        
        assert result == expected_result
        mock_process_article.assert_called_once_with(url, sample_schema)

    @patch('rosen_scraper.dispatcher.article_processor._run_ai_analysis')
    def test_reprocess_text_success(self, mock_ai_analysis, sample_schema):
        """Test text reprocessing."""
        raw_text = "This is sample text content for reprocessing."
        expected_result = {
            'summary': 'Test summary',
            'categories': ['Press Criticism'],
            'concepts': ['objectivity']
        }
        mock_ai_analysis.return_value = expected_result
        
        result = dispatcher.reprocess_text(raw_text, sample_schema)
        
        assert result == expected_result
        mock_ai_analysis.assert_called_once_with(raw_text, sample_schema)

    @patch('rosen_scraper.dispatcher.article_processor._run_ai_analysis')
    def test_reprocess_text_empty(self, mock_ai_analysis, sample_schema):
        """Test reprocessing empty text."""
        raw_text = ""
        mock_ai_analysis.return_value = None
        
        result = dispatcher.reprocess_text(raw_text, sample_schema)
        
        assert result is None

    @patch('rosen_scraper.dispatcher.article_processor._run_ai_analysis')
    def test_reprocess_text_long_content(self, mock_ai_analysis, sample_schema):
        """Test reprocessing long text content."""
        raw_text = "Long article content. " * 1000  # Simulate long article
        expected_result = {
            'summary': 'Summary of long article',
            'categories': ['Media Theory'],
            'concepts': ['transparency', 'accountability']
        }
        mock_ai_analysis.return_value = expected_result
        
        result = dispatcher.reprocess_text(raw_text, sample_schema)
        
        assert result == expected_result

    @patch('rosen_scraper.dispatcher.video_processor.process_video')
    def test_dispatch_url_youtube_embedded(self, mock_process_video, sample_schema):
        """Test dispatching YouTube embedded URL."""
        url = "https://www.youtube.com/embed/dQw4w9WgXcQ"
        expected_result = {'type': 'video', 'title': 'Test Video'}
        mock_process_video.return_value = expected_result
        
        result = dispatcher.dispatch_url(url, sample_schema)
        
        assert result == expected_result
        mock_process_video.assert_called_once_with(url, sample_schema)

    @patch('rosen_scraper.dispatcher.article_processor.process_article')
    def test_dispatch_url_with_query_params(self, mock_process_article, sample_schema):
        """Test dispatching URL with query parameters."""
        url = "https://example.com/article?utm_source=test&ref=homepage"
        expected_result = {'type': 'article', 'title': 'Test Article'}
        mock_process_article.return_value = expected_result
        
        result = dispatcher.dispatch_url(url, sample_schema)
        
        assert result == expected_result

    @patch('rosen_scraper.dispatcher.article_processor.process_article')
    def test_dispatch_url_with_fragment(self, mock_process_article, sample_schema):
        """Test dispatching URL with fragment identifier."""
        url = "https://example.com/article#section-2"
        expected_result = {'type': 'article', 'title': 'Test Article'}
        mock_process_article.return_value = expected_result
        
        result = dispatcher.dispatch_url(url, sample_schema)
        
        assert result == expected_result
