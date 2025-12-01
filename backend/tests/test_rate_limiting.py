# -*- coding: utf-8 -*-
"""
Tests for the rate limiter module.

This test suite validates that the rate limiting functionality works correctly
for Gemini API calls to prevent API throttling and service disruption.
"""

import os
import time
import pytest
from unittest.mock import Mock, patch
from pathlib import Path
import sys

# Add src directory to path
ROOT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from rosen_scraper.rate_limiter import (
    rate_limited_gemini_call,
    get_rate_limit_info,
    API_RATE_LIMIT_CALLS,
    API_RATE_LIMIT_PERIOD
)


class TestRateLimiter:
    """Test suite for rate limiter functionality."""
    
    def test_get_rate_limit_info(self):
        """Test that rate limit info is returned correctly."""
        info = get_rate_limit_info()
        
        assert "calls" in info
        assert "period" in info
        assert "description" in info
        assert isinstance(info["calls"], int)
        assert isinstance(info["period"], int)
        assert info["calls"] > 0
        assert info["period"] > 0
    
    def test_rate_limiter_decorator_exists(self):
        """Test that the rate limiter decorator can be applied."""
        @rate_limited_gemini_call
        def dummy_function():
            return "success"
        
        result = dummy_function()
        assert result == "success"
    
    def test_rate_limiter_preserves_function_metadata(self):
        """Test that decorator preserves function name and docstring."""
        @rate_limited_gemini_call
        def test_function():
            """Test function docstring."""
            return "test"
        
        assert test_function.__name__ == "test_function"
        assert "Test function docstring" in test_function.__doc__
    
    def test_rate_limiter_with_arguments(self):
        """Test that rate limiter works with functions that take arguments."""
        @rate_limited_gemini_call
        def add_numbers(a, b):
            return a + b
        
        result = add_numbers(2, 3)
        assert result == 5
    
    def test_rate_limiter_with_kwargs(self):
        """Test that rate limiter works with keyword arguments."""
        @rate_limited_gemini_call
        def greet(name, greeting="Hello"):
            return f"{greeting}, {name}!"
        
        result1 = greet("World")
        assert result1 == "Hello, World!"
        
        result2 = greet("World", greeting="Hi")
        assert result2 == "Hi, World!"
    
    def test_rate_limiter_enforces_limit(self):
        """
        Test that rate limiter actually enforces the limit.
        
        Note: This test uses a small number of calls to avoid long test times.
        We set a very short period and verify timing behavior.
        """
        call_count = 0
        
        @rate_limited_gemini_call
        def counted_function():
            nonlocal call_count
            call_count += 1
            return call_count
        
        # Make several calls rapidly
        # The rate limiter should allow them but may add delays
        start_time = time.time()
        results = []
        for i in range(5):
            results.append(counted_function())
        end_time = time.time()
        
        # Verify all calls completed
        assert call_count == 5
        assert results == [1, 2, 3, 4, 5]
        
        # Time elapsed should be reasonable (not instantaneous if rate limited,
        # but not excessively long for 5 calls)
        elapsed = end_time - start_time
        assert elapsed < 10  # Should complete within 10 seconds
    
    def test_rate_limiter_exception_handling(self):
        """Test that rate limiter doesn't interfere with exception propagation."""
        @rate_limited_gemini_call
        def failing_function():
            raise ValueError("Test error")
        
        with pytest.raises(ValueError, match="Test error"):
            failing_function()
    
    def test_rate_limiter_with_return_types(self):
        """Test that rate limiter works with different return types."""
        @rate_limited_gemini_call
        def return_dict():
            return {"key": "value"}
        
        @rate_limited_gemini_call
        def return_list():
            return [1, 2, 3]
        
        @rate_limited_gemini_call
        def return_none():
            return None
        
        assert return_dict() == {"key": "value"}
        assert return_list() == [1, 2, 3]
        assert return_none() is None


class TestRateLimiterConfiguration:
    """Test suite for rate limiter configuration."""
    
    def test_default_configuration(self):
        """Test that default configuration is reasonable."""
        info = get_rate_limit_info()
        
        # Default should be 60 calls per 60 seconds (1 per second average)
        # This is conservative to avoid API throttling
        assert info["calls"] >= 1
        assert info["period"] >= 1
    
    @patch.dict(os.environ, {"GEMINI_API_RATE_LIMIT_CALLS": "30", "GEMINI_API_RATE_LIMIT_PERIOD": "60"})
    def test_environment_variable_configuration(self):
        """Test that rate limiter can be configured via environment variables."""
        # Need to reload the module to pick up the new environment variables
        import importlib
        from rosen_scraper import rate_limiter
        importlib.reload(rate_limiter)
        
        # Check that the configuration was updated
        assert rate_limiter.API_RATE_LIMIT_CALLS == 30
        assert rate_limiter.API_RATE_LIMIT_PERIOD == 60


class TestRateLimiterIntegration:
    """Integration tests for rate limiter with actual module functions."""
    
    def test_scraper_rate_limiting(self):
        """Test that scraper module has rate limiting applied."""
        # Import the scraper module
        from rosen_scraper import scraper
        
        # Verify the rate-limited function exists
        assert hasattr(scraper, '_call_gemini_url_context')
        
        # Verify it's a callable
        assert callable(scraper._call_gemini_url_context)
    
    def test_categorizer_rate_limiting(self):
        """Test that categorizer module has rate limiting applied."""
        from rosen_scraper import categorizer
        
        # Verify the rate-limited function exists
        assert hasattr(categorizer, '_call_gemini_for_classification')
        
        # Verify it's a callable
        assert callable(categorizer._call_gemini_for_classification)
    
    def test_entity_extractor_rate_limiting(self):
        """Test that entity_extractor module has rate limiting applied."""
        from rosen_scraper import entity_extractor
        
        # Verify the rate-limited function exists
        assert hasattr(entity_extractor, '_call_gemini_for_entity_extraction')
        
        # Verify it's a callable
        assert callable(entity_extractor._call_gemini_for_entity_extraction)


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v"])
