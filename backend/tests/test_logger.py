"""
Tests for the logger module.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from rosen_scraper.logger import init_logger, get_logger, PoisonPillType
import os


class TestLoggerModule:
    """Tests for logging functionality."""

    def test_poison_pill_type_enum(self):
        """Test that PoisonPillType enum exists and has expected values."""
        assert hasattr(PoisonPillType, 'PAYWALL')
        assert hasattr(PoisonPillType, 'ERROR')
        assert hasattr(PoisonPillType, 'TIMEOUT')

    def test_init_logger(self, tmp_path, monkeypatch):
        """Test logger initialization."""
        log_dir = tmp_path / "logs"
        monkeypatch.chdir(tmp_path)
        
        logger = init_logger(run_id="test_run")
        
        assert logger is not None
        assert logger.name == 'rosen_scraper'

    def test_get_logger_without_init(self):
        """Test getting logger without initialization."""
        # Reset any existing logger
        import logging
        logging.getLogger('rosen_scraper').handlers.clear()
        
        logger = get_logger()
        
        # Should still return a logger object
        assert logger is not None

    def test_logger_has_handlers(self, tmp_path, monkeypatch):
        """Test that initialized logger has handlers."""
        log_dir = tmp_path / "logs"
        monkeypatch.chdir(tmp_path)
        
        logger = init_logger(run_id="test_run_2")
        
        # Should have at least one handler
        assert len(logger.handlers) > 0

    def test_logger_can_log_messages(self, tmp_path, monkeypatch):
        """Test that logger can log messages."""
        log_dir = tmp_path / "logs"
        monkeypatch.chdir(tmp_path)
        
        logger = init_logger(run_id="test_run_3")
        
        # Should not raise exceptions
        logger.info("Test info message")
        logger.warning("Test warning message")
        logger.error("Test error message")

    def test_get_logger_returns_same_logger(self):
        """Test that get_logger returns the same logger instance."""
        logger1 = get_logger()
        logger2 = get_logger()
        
        assert logger1 is logger2
        assert logger1.name == logger2.name

    def test_logger_default_name(self):
        """Test that logger has correct default name."""
        logger = get_logger()
        
        assert logger.name == 'rosen_scraper'

    @patch('rosen_scraper.logger.gspread.service_account')
    def test_logger_with_sheets_logging(self, mock_gspread, tmp_path, monkeypatch, mock_env_vars):
        """Test logger initialization with Google Sheets logging."""
        log_dir = tmp_path / "logs"
        monkeypatch.chdir(tmp_path)
        
        # Mock the gspread client
        mock_gc = MagicMock()
        mock_spreadsheet = MagicMock()
        mock_gc.open.return_value = mock_spreadsheet
        mock_gspread.return_value = mock_gc
        
        # Initialize logger
        logger = init_logger(run_id="test_run_sheets")
        
        assert logger is not None
