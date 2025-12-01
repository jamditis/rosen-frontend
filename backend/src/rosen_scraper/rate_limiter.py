# -*- coding: utf-8 -*-
"""
Rate Limiter Module

This module provides rate limiting functionality for Gemini API calls
to prevent API throttling, manage costs, and avoid service disruption.
"""

import os
from functools import wraps
from ratelimit import limits, sleep_and_retry


# Load rate limit configuration from environment variables
# Default: 60 calls per minute (conservative limit for Gemini API)
API_RATE_LIMIT_CALLS = int(os.environ.get("GEMINI_API_RATE_LIMIT_CALLS", "60"))
API_RATE_LIMIT_PERIOD = int(os.environ.get("GEMINI_API_RATE_LIMIT_PERIOD", "60"))


def rate_limited_gemini_call(func):
    """
    Decorator to apply rate limiting to Gemini API calls.
    
    This decorator wraps functions that make calls to the Gemini API,
    ensuring they respect the configured rate limits. If the rate limit
    is exceeded, the decorator will sleep until the next period begins.
    
    Configuration is done via environment variables:
    - GEMINI_API_RATE_LIMIT_CALLS: Number of allowed calls (default: 60)
    - GEMINI_API_RATE_LIMIT_PERIOD: Time period in seconds (default: 60)
    
    Args:
        func: The function to wrap with rate limiting
        
    Returns:
        The wrapped function with rate limiting applied
        
    Example:
        @rate_limited_gemini_call
        def call_gemini_api(prompt):
            # ... API call logic
            pass
    """
    @wraps(func)
    @sleep_and_retry
    @limits(calls=API_RATE_LIMIT_CALLS, period=API_RATE_LIMIT_PERIOD)
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    
    return wrapper


def get_rate_limit_info():
    """
    Get current rate limit configuration.
    
    Returns:
        dict: Dictionary containing rate limit configuration
    """
    return {
        "calls": API_RATE_LIMIT_CALLS,
        "period": API_RATE_LIMIT_PERIOD,
        "description": f"{API_RATE_LIMIT_CALLS} calls per {API_RATE_LIMIT_PERIOD} seconds"
    }
