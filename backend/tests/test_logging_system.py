# -*- coding: utf-8 -*-
"""
Test script for the new logging and poison pill detection system.
"""

import sys
from pathlib import Path

# Pytest exposes backend/src via [tool.pytest.ini_options] pythonpath, but the
# `python tests/test_logging_system.py` standalone entrypoint needs its own
# bootstrap.
BACKEND_SRC = Path(__file__).resolve().parents[1] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from rosen_scraper.logger import init_logger
from rosen_scraper.poison_pill_handler import get_poison_pill_manager

def test_logging_system():
    """Test the logging system with various scenarios."""
    print("Testing Rosen Archive Logging System")
    print("=" * 50)

    # Initialize logging
    logger = init_logger("test_logs")
    poison_manager = get_poison_pill_manager()

    # Test basic logging
    logger.logger.info("Starting logging system test")

    # Test URL poison pill detection
    test_urls = [
        "https://www.nytimes.com/2024/01/15/test-article.html",  # Paywall
        "https://example.com/article.html",  # Clean
        "http://localhost:3000/test",  # Suspicious
    ]

    for url in test_urls:
        should_process, poison_result = poison_manager.check_url(url)
        if not should_process:
            logger.logger.warning(f"URL {url} flagged as poison pill: {poison_result.pill_type}")
        else:
            logger.logger.info(f"URL {url} passed poison pill check")

    # Test content poison pill detection
    test_contents = [
        "",  # Empty content
        "Short",  # Too short
        "This is a reasonably long piece of content that should pass the poison pill detection. " * 20,  # Good content
        "Please verify you are human to continue...",  # Anti-bot
    ]

    for i, content in enumerate(test_contents):
        should_continue, poison_result = poison_manager.check_content(content, f"test://content-{i}")
        if not should_continue:
            logger.logger.warning(f"Content {i} flagged: {poison_result.pill_type}")
        else:
            logger.logger.info(f"Content {i} passed quality check")

    # Test processing simulation
    start_time = logger.log_processing_start("https://example.com/test", "TEST-00001")
    logger.log_scraping_attempt("https://example.com/test", "url_context", True, {"tokens": 1500})
    logger.log_ai_analysis("TEST-00001", True, tokens_used=2000, duration=2.5)
    logger.log_pdf_generation("TEST-00001", "/test/path.pdf", True, file_size=256000)
    logger.log_processing_end("TEST-00001", start_time, True)

    # Test error handling
    error_result = poison_manager.handle_processing_error("network_error", "Connection timeout", "https://example.com/timeout")
    logger.logger.info(f"Error handling result: {error_result.recommended_action}")

    # Generate summary
    session_summary = logger.generate_session_summary()
    print("\nSession Summary:")
    for key, value in session_summary.items():
        print(f"  {key}: {value}")

    poison_summary = poison_manager.get_poison_pill_summary()
    print(f"\nPoison Pills Detected: {poison_summary['total']}")
    if poison_summary['by_type']:
        print("By Type:")
        for pill_type, count in poison_summary['by_type'].items():
            print(f"  {pill_type}: {count}")

    # End session
    logger.log_session_end()

    print("\nTest completed. Check the test_logs directory for log files.")

if __name__ == "__main__":
    test_logging_system()
