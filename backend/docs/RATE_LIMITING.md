# Rate Limiting for Gemini API Calls

This document describes the rate limiting implementation for Gemini API calls in the backend.

## Overview

Rate limiting has been implemented for all Gemini API calls to prevent:
- API throttling
- Unexpected costs
- Service disruption

## Implementation

The rate limiting is implemented using the `ratelimit` library and is applied to three key modules:

1. **scraper.py** - `_call_gemini_url_context()` function
2. **categorizer.py** - `_call_gemini_for_classification()` function  
3. **entity_extractor.py** - `_call_gemini_for_entity_extraction()` function

## Configuration

Rate limits can be configured via environment variables:

```bash
# Number of allowed API calls per period (default: 60)
GEMINI_API_RATE_LIMIT_CALLS=60

# Time period in seconds (default: 60)
GEMINI_API_RATE_LIMIT_PERIOD=60
```

The default configuration allows **60 calls per 60 seconds** (1 call per second on average), which is a conservative limit suitable for most use cases.

## Usage

### Standard Usage

No code changes are required. The rate limiting is automatically applied to all Gemini API calls:

```python
# This call is automatically rate limited
result = summarize_and_classify(text_content, schema)
```

### Custom Rate Limits

To use custom rate limits, set the environment variables before running your application:

```bash
# More aggressive rate limiting (30 calls per minute)
export GEMINI_API_RATE_LIMIT_CALLS=30
export GEMINI_API_RATE_LIMIT_PERIOD=60

# Run your application
python src/workflow.py
```

Or add them to your `.env` file:

```env
GEMINI_API_RATE_LIMIT_CALLS=30
GEMINI_API_RATE_LIMIT_PERIOD=60
```

## Behavior

When the rate limit is reached:
1. The decorator will automatically sleep until the next period begins
2. The call will then proceed normally
3. No error is raised - the operation just takes longer

This ensures that your application continues to work even under rate limiting, just at a controlled pace.

## Testing

Comprehensive tests are available in `tests/test_rate_limiting.py`:

```bash
# Run rate limiting tests
pytest tests/test_rate_limiting.py -v

# Run all tests
pytest tests/ -v
```

## Architecture

The rate limiting is implemented in `src/rosen_scraper/rate_limiter.py` as a decorator:

```python
from rosen_scraper.rate_limiter import rate_limited_gemini_call

@rate_limited_gemini_call
def my_api_function():
    # Your Gemini API call here
    pass
```

The decorator uses the `@sleep_and_retry` pattern, which means:
- If rate limit is not exceeded: Call proceeds immediately
- If rate limit is exceeded: Function sleeps until the next period, then retries

## Monitoring

To check the current rate limit configuration in your code:

```python
from rosen_scraper.rate_limiter import get_rate_limit_info

info = get_rate_limit_info()
print(f"Rate limit: {info['description']}")
# Output: "Rate limit: 60 calls per 60 seconds"
```

## Best Practices

1. **Start Conservative**: Use the default 60 calls/minute unless you need more
2. **Monitor Usage**: Keep track of your API usage to avoid unexpected costs
3. **Adjust as Needed**: If you're hitting limits too often, you can increase the rate
4. **Test First**: Test with a lower rate limit in development to ensure your code handles delays gracefully

## Troubleshooting

### Issue: Rate limiting seems too slow

**Solution**: Increase `GEMINI_API_RATE_LIMIT_CALLS` or decrease `GEMINI_API_RATE_LIMIT_PERIOD`

### Issue: Getting API throttling errors

**Solution**: Decrease `GEMINI_API_RATE_LIMIT_CALLS` or increase `GEMINI_API_RATE_LIMIT_PERIOD`

### Issue: Rate limiting not being applied

**Solution**: Verify that:
1. The `ratelimit` package is installed
2. Environment variables are set correctly
3. You're importing from the correct module

## Related Files

- `backend/src/rosen_scraper/rate_limiter.py` - Rate limiting implementation
- `backend/src/rosen_scraper/scraper.py` - Scraper with rate limiting
- `backend/src/rosen_scraper/categorizer.py` - Categorizer with rate limiting
- `backend/src/rosen_scraper/entity_extractor.py` - Entity extractor with rate limiting
- `backend/tests/test_rate_limiting.py` - Comprehensive test suite
- `backend/pyproject.toml` - Dependencies including `ratelimit`
