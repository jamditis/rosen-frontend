# URL Accessibility Checker

## Overview

The `check_url_accessibility.py` script validates all URLs in the archive records database to identify broken links, redirects, and accessibility issues.

## Features

- **Async/Parallel Processing**: Checks 15 URLs concurrently for fast execution
- **Rate Limiting**: Prevents overwhelming target servers with configurable delays
- **Resumable**: Saves progress periodically and can resume from interruptions
- **Comprehensive Error Handling**: Categorizes SSL errors, timeouts, connection failures, etc.
- **Detailed Reporting**: Generates text reports and CSV exports
- **Smart Retries**: Automatically retries failed requests (up to 2 times)

## Installation

First, add the required dependencies to your Poetry environment:

```bash
cd backend
poetry add aiohttp aiofiles
```

## Usage

### Basic Usage

```bash
# From the repository root
python backend/scripts/check_url_accessibility.py
```

### What It Does

1. Loads all records from `data/archive_records-public.csv`
2. Filters records with valid HTTP/HTTPS URLs (~869 URLs expected)
3. Checks each URL in parallel batches of 15
4. Categorizes results into:
   - **accessible** (200-206): URLs that work correctly
   - **redirected** (301-308): URLs that redirect to new locations
   - **client_error** (400-410): Client errors including 404 Not Found
   - **server_error** (500-505): Server-side errors
   - **timeout**: Requests that took longer than 5 seconds
   - **ssl_error**: SSL certificate problems
   - **connection_error**: Network/connection failures
   - **invalid_url**: Malformed URLs
   - **unknown_error**: Other unexpected errors

### Output Files

All output files are saved to `backend/output/`:

1. **URL Accessibility Report** (`url_accessibility_report_TIMESTAMP.txt`)
   - Summary statistics
   - Detailed lists of problematic URLs by category
   - Redirected URLs with original and final destinations

2. **Broken URLs CSV** (`broken_urls_TIMESTAMP.csv`)
   - Record ID, title, URL, category, status code, error message
   - Easy to import into spreadsheets for review

3. **Progress File** (`url_check_progress.json`)
   - Automatically created during execution
   - Allows resuming if interrupted
   - Deleted automatically on successful completion

## Configuration

Edit these constants in the script to customize behavior:

```python
TIMEOUT = 5              # Seconds to wait per URL
BATCH_SIZE = 15          # URLs to check concurrently
DELAY_BETWEEN_BATCHES = 1.0  # Seconds between batches
MAX_RETRIES = 2          # Retry attempts for failed requests
```

## Performance

- **Estimated time**: ~5-10 minutes for 869 URLs (depending on network speed)
- **Throughput**: 10-20 URLs per second with default settings
- **Memory usage**: Minimal (<100MB)

## Example Output

```
================================================================================
URL ACCESSIBILITY REPORT
================================================================================

Generated: 2025-12-08 14:30:45
Total URLs checked: 869
Time elapsed: 8.5 minutes
Average rate: 1.7 URLs/second

--------------------------------------------------------------------------------
STATUS SUMMARY
--------------------------------------------------------------------------------
  accessible                   750 ( 86.3%)
  redirected                    45 (  5.2%)
  client_error                  35 (  4.0%)
  timeout                       20 (  2.3%)
  server_error                  12 (  1.4%)
  ssl_error                      4 (  0.5%)
  connection_error               3 (  0.3%)
```

## Resuming Interrupted Checks

If the script is interrupted (Ctrl+C, network failure, etc.), simply run it again:

```bash
python backend/scripts/check_url_accessibility.py
```

It will automatically detect the progress file and skip already-checked URLs.

## Troubleshooting

### "No module named 'aiohttp'"

Install the dependencies:
```bash
cd backend
poetry add aiohttp aiofiles
```

### Script runs very slowly

- Check your network connection
- Increase `BATCH_SIZE` (but be cautious of rate limits)
- Reduce `DELAY_BETWEEN_BATCHES`

### Many SSL errors

This is expected for older websites. The script disables SSL verification to handle certificate issues gracefully.

### High timeout rate

- Increase `TIMEOUT` value (e.g., to 10 seconds)
- Some sites may be genuinely slow or blocking automated requests

## Next Steps After Running

1. Review the generated report in `backend/output/`
2. Import `broken_urls_*.csv` into a spreadsheet
3. Prioritize fixing:
   - 404 errors (content truly missing)
   - Server errors (may be temporary)
   - Invalid URLs (data entry errors)
4. Consider updating archive records for redirected URLs to use final destinations
5. Document any intentionally archived dead links (historical value)

## Related Scripts

- `validate_archive_data.py` - Validates data schema and completeness
- `analyze_archive_patterns.py` - Analyzes content patterns
- `merge_new_records.py` - Merges new records into the archive
