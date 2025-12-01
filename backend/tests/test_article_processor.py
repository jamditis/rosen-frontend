"""
Tests for the article processor module.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from rosen_scraper.processors import article_processor


class TestArticleProcessor:
    """Tests for article processor functionality."""

    @patch('rosen_scraper.processors.article_processor.scraper.fetch_article_content_enhanced')
    def test_run_scraping_success_structured(self, mock_fetch, sample_article_data):
        """Test successful scraping with structured data from URL Context."""
        # Mock successful structured data fetch
        mock_fetch.return_value = (sample_article_data, True)
        
        url = "https://example.com/test"
        result = article_processor._run_scraping(url)
        
        assert result is not None
        assert result.get('text') is not None
        assert result.get('raw_text') is not None

    @patch('rosen_scraper.processors.article_processor.scraper.fetch_article_content_enhanced')
    @patch('rosen_scraper.processors.article_processor.scraper.extract_article_data')
    def test_run_scraping_success_html(self, mock_extract, mock_fetch, sample_article_data):
        """Test successful scraping with HTML data."""
        # Mock HTML fetch
        html_content = "<html><body><p>Test content</p></body></html>"
        mock_fetch.return_value = (html_content, False)
        # Mock extraction
        import json
        mock_extract.return_value = json.dumps(sample_article_data)
        
        url = "https://example.com/test"
        result = article_processor._run_scraping(url)
        
        assert result is not None
        assert result.get('text') is not None

    @patch('rosen_scraper.processors.article_processor.scraper.fetch_article_content_enhanced')
    def test_run_scraping_fetch_failure(self, mock_fetch):
        """Test scraping when fetch fails."""
        # Mock fetch failure
        mock_fetch.return_value = (None, False)
        
        url = "https://example.com/test"
        result = article_processor._run_scraping(url)
        
        assert result is None

    @patch('rosen_scraper.processors.article_processor.scraper.fetch_article_content_enhanced')
    @patch('rosen_scraper.processors.article_processor.scraper.extract_article_data')
    def test_run_scraping_extraction_failure(self, mock_extract, mock_fetch):
        """Test scraping when extraction fails."""
        # Mock HTML fetch success but extraction failure
        html_content = "<html><body><p>Test content</p></body></html>"
        mock_fetch.return_value = (html_content, False)
        mock_extract.return_value = None
        
        url = "https://example.com/test"
        result = article_processor._run_scraping(url)
        
        assert result is None

    @patch('rosen_scraper.processors.article_processor.scraper.fetch_article_content_enhanced')
    @patch('rosen_scraper.processors.article_processor.scraper.extract_article_data')
    def test_run_scraping_invalid_json(self, mock_extract, mock_fetch):
        """Test scraping when extraction returns invalid JSON."""
        # Mock HTML fetch success but invalid JSON
        html_content = "<html><body><p>Test content</p></body></html>"
        mock_fetch.return_value = (html_content, False)
        mock_extract.return_value = "invalid json {{"
        
        url = "https://example.com/test"
        result = article_processor._run_scraping(url)
        
        assert result is None

    @patch('rosen_scraper.processors.article_processor.scraper.fetch_article_content_enhanced')
    def test_run_scraping_missing_text(self, mock_fetch):
        """Test scraping when extracted data is missing text field."""
        # Mock structured data without text
        incomplete_data = {
            'title': 'Test Title',
            'author': 'Test Author'
            # Missing 'text' field
        }
        mock_fetch.return_value = (incomplete_data, True)
        
        url = "https://example.com/test"
        result = article_processor._run_scraping(url)
        
        assert result is None

    @patch('rosen_scraper.processors.article_processor._run_scraping')
    @patch('rosen_scraper.processors.article_processor.categorizer.analyze_article')
    def test_process_article_success(self, mock_analyze, mock_scrape, sample_article_data, sample_schema):
        """Test full article processing pipeline."""
        # Mock scraping success
        mock_scrape.return_value = sample_article_data
        
        # Mock AI analysis
        analysis_result = {
            'summary': 'Test summary',
            'categories': ['Press Criticism'],
            'concepts': ['objectivity'],
            'sentiment': 'neutral'
        }
        mock_analyze.return_value = analysis_result
        
        url = "https://example.com/test"
        result = article_processor.process_article(url, sample_schema)
        
        assert result is not None
        assert result.get('content') is not None
        assert result.get('content').get('summary') is not None

    @patch('rosen_scraper.processors.article_processor._run_scraping')
    def test_process_article_scraping_failure(self, mock_scrape, sample_schema):
        """Test article processing when scraping fails."""
        # Mock scraping failure
        mock_scrape.return_value = None
        
        url = "https://example.com/test"
        result = article_processor.process_article(url, sample_schema)
        
        assert result is None
