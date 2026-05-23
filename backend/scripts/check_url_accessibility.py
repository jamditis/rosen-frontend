#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
URL Accessibility Checker for Archive Records

Checks the accessibility of all URLs in the archive records CSV file.
Uses async HTTP requests to check URLs in parallel batches.

Features:
- Async/parallel URL checking (10-20 URLs at a time)
- 5-second timeout per URL
- Rate limiting to avoid overwhelming servers
- Categorizes results: accessible, redirected, not found, error, timeout
- Handles SSL errors, connection errors, and other edge cases
- Progress saving for resumability
- Detailed report generation
- CSV export of broken URLs

Run with: python backend/scripts/check_url_accessibility.py

Dependencies (add to pyproject.toml):
    aiohttp>=3.9.0
    aiofiles>=23.0.0
"""

import csv
import json
import asyncio
import aiohttp
from collections import Counter
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple
from urllib.parse import urlparse
import time


# Configuration
DATA_DIR = Path(__file__).parent.parent.parent / "data"
ARCHIVE_CSV = DATA_DIR / "archive_records-public.csv"
OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

PROGRESS_FILE = OUTPUT_DIR / "url_check_progress.json"
REPORT_FILE = OUTPUT_DIR / f"url_accessibility_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
BROKEN_URLS_CSV = OUTPUT_DIR / f"broken_urls_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

# Request configuration
TIMEOUT = 5  # seconds
BATCH_SIZE = 15  # URLs to check concurrently
DELAY_BETWEEN_BATCHES = 1.0  # seconds
MAX_RETRIES = 2
USER_AGENT = "Mozilla/5.0 (compatible; ArchiveBot/1.0; +https://github.com/jamditis/rosen-frontend)"

# Status categories
STATUS_CATEGORIES = {
    'accessible': [200, 201, 202, 203, 204, 205, 206],
    'redirected': [301, 302, 303, 307, 308],
    'client_error': [400, 401, 403, 404, 405, 406, 407, 408, 409, 410],
    'server_error': [500, 501, 502, 503, 504, 505],
}


class URLChecker:
    """Async URL accessibility checker with progress tracking."""

    def __init__(self):
        self.results: Dict[str, dict] = {}
        self.stats = Counter()
        self.checked_count = 0
        self.total_count = 0
        self.start_time = None
        self.domain_last_request: Dict[str, float] = {}
        self.domain_delay = 0.5  # seconds between requests to same domain

    def load_progress(self) -> None:
        """Load previously saved progress if exists."""
        if PROGRESS_FILE.exists():
            try:
                with open(PROGRESS_FILE, 'r') as f:
                    data = json.load(f)
                    self.results = data.get('results', {})
                    self.stats = Counter(data.get('stats', {}))
                    self.checked_count = data.get('checked_count', 0)
                    print(f"✓ Loaded progress: {self.checked_count} URLs already checked")
            except Exception as e:
                print(f"⚠ Could not load progress file: {e}")
                print("Starting fresh...")

    def save_progress(self) -> None:
        """Save current progress to file."""
        try:
            with open(PROGRESS_FILE, 'w') as f:
                json.dump({
                    'results': self.results,
                    'stats': dict(self.stats),
                    'checked_count': self.checked_count,
                    'last_updated': datetime.now().isoformat()
                }, f, indent=2)
        except Exception as e:
            print(f"⚠ Could not save progress: {e}")

    async def rate_limit_domain(self, url: str) -> None:
        """Apply per-domain rate limiting."""
        try:
            domain = urlparse(url).netloc
            if domain in self.domain_last_request:
                elapsed = time.time() - self.domain_last_request[domain]
                if elapsed < self.domain_delay:
                    await asyncio.sleep(self.domain_delay - elapsed)
            self.domain_last_request[domain] = time.time()
        except Exception as e:
            # Rate limiting is best-effort; skip it if the URL cannot be parsed.
            # ``domain`` may be unbound if urlparse itself raised, so log ``url``.
            print(f"⚠ Could not apply per-domain rate limiting for {url}: {e}")

    async def check_url(
        self,
        session: aiohttp.ClientSession,
        record_id: str,
        url: str,
        title: str
    ) -> Tuple[str, dict]:
        """Check a single URL and return its status."""

        # Apply rate limiting
        await self.rate_limit_domain(url)

        result = {
            'record_id': record_id,
            'url': url,
            'title': title,
            'status': None,
            'category': None,
            'final_url': None,
            'error': None,
            'checked_at': datetime.now().isoformat()
        }

        for attempt in range(MAX_RETRIES):
            try:
                async with session.head(
                    url,
                    timeout=aiohttp.ClientTimeout(total=TIMEOUT),
                    allow_redirects=True,
                    ssl=False  # Disable SSL verification to handle cert issues
                ) as response:
                    result['status'] = response.status
                    result['final_url'] = str(response.url)
                    result['category'] = self._categorize_status(response.status)
                    self.stats[result['category']] += 1
                    return record_id, result

            except asyncio.TimeoutError:
                result['category'] = 'timeout'
                result['error'] = 'Request timeout'
                if attempt == MAX_RETRIES - 1:
                    self.stats['timeout'] += 1
                    return record_id, result
                await asyncio.sleep(1)  # Brief delay before retry

            except aiohttp.ClientSSLError as e:
                result['category'] = 'ssl_error'
                result['error'] = f'SSL Error: {str(e)[:100]}'
                self.stats['ssl_error'] += 1
                return record_id, result

            except aiohttp.ClientConnectionError as e:
                result['category'] = 'connection_error'
                result['error'] = f'Connection Error: {str(e)[:100]}'
                if attempt == MAX_RETRIES - 1:
                    self.stats['connection_error'] += 1
                    return record_id, result
                await asyncio.sleep(1)

            except aiohttp.InvalidURL as e:
                result['category'] = 'invalid_url'
                result['error'] = f'Invalid URL: {str(e)[:100]}'
                self.stats['invalid_url'] += 1
                return record_id, result

            except aiohttp.ClientError as e:
                result['category'] = 'client_error_exception'
                result['error'] = f'Client Error: {str(e)[:100]}'
                if attempt == MAX_RETRIES - 1:
                    self.stats['client_error_exception'] += 1
                    return record_id, result
                await asyncio.sleep(1)

            except Exception as e:
                result['category'] = 'unknown_error'
                result['error'] = f'Unknown Error: {str(e)[:100]}'
                if attempt == MAX_RETRIES - 1:
                    self.stats['unknown_error'] += 1
                    return record_id, result
                await asyncio.sleep(1)

        return record_id, result

    def _categorize_status(self, status_code: int) -> str:
        """Categorize HTTP status code."""
        for category, codes in STATUS_CATEGORIES.items():
            if status_code in codes:
                return category
        return 'other'

    async def check_batch(
        self,
        session: aiohttp.ClientSession,
        batch: List[Tuple[str, str, str]]
    ) -> None:
        """Check a batch of URLs concurrently."""
        tasks = [
            self.check_url(session, record_id, url, title)
            for record_id, url, title in batch
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                print(f"⚠ Task exception: {result}")
                continue

            record_id, data = result
            self.results[record_id] = data
            self.checked_count += 1

        # Save progress every batch
        self.save_progress()

    async def check_all_urls(self, records: List[Tuple[str, str, str]]) -> None:
        """Check all URLs in batches."""
        self.total_count = len(records)
        self.start_time = time.time()

        print(f"\n🔍 Checking {self.total_count} URLs...")
        print(f"   Batch size: {BATCH_SIZE}")
        print(f"   Timeout: {TIMEOUT}s per URL")
        print(f"   Delay between batches: {DELAY_BETWEEN_BATCHES}s\n")

        # Filter out already checked URLs
        remaining = [
            (rid, url, title) for rid, url, title in records
            if rid not in self.results
        ]

        if len(remaining) < len(records):
            print(f"↻ Resuming: {len(remaining)} URLs remaining\n")

        # Create session with custom headers
        connector = aiohttp.TCPConnector(limit=BATCH_SIZE, ssl=False)
        timeout = aiohttp.ClientTimeout(total=TIMEOUT)
        headers = {'User-Agent': USER_AGENT}

        async with aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers=headers
        ) as session:

            # Process in batches
            for i in range(0, len(remaining), BATCH_SIZE):
                batch = remaining[i:i + BATCH_SIZE]
                batch_num = (i // BATCH_SIZE) + 1
                total_batches = (len(remaining) + BATCH_SIZE - 1) // BATCH_SIZE

                await self.check_batch(session, batch)

                # Progress update
                elapsed = time.time() - self.start_time
                rate = self.checked_count / elapsed if elapsed > 0 else 0
                eta = (self.total_count - self.checked_count) / rate if rate > 0 else 0

                print(f"Batch {batch_num}/{total_batches} | "
                      f"Checked: {self.checked_count}/{self.total_count} | "
                      f"Rate: {rate:.1f} URLs/s | "
                      f"ETA: {eta/60:.1f} min")

                # Delay between batches
                if i + BATCH_SIZE < len(remaining):
                    await asyncio.sleep(DELAY_BETWEEN_BATCHES)

    def generate_report(self) -> str:
        """Generate detailed text report."""
        elapsed = time.time() - self.start_time if self.start_time else 0

        report = []
        report.append("=" * 80)
        report.append("URL ACCESSIBILITY REPORT")
        report.append("=" * 80)
        report.append(f"\nGenerated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append(f"Total URLs checked: {self.checked_count}")
        report.append(f"Time elapsed: {elapsed/60:.1f} minutes")
        report.append(f"Average rate: {self.checked_count/elapsed:.1f} URLs/second" if elapsed > 0 else "")

        # Statistics
        report.append("\n" + "-" * 80)
        report.append("STATUS SUMMARY")
        report.append("-" * 80)

        for category, count in sorted(self.stats.items(), key=lambda x: -x[1]):
            percentage = (count / self.checked_count * 100) if self.checked_count > 0 else 0
            report.append(f"  {category:25} {count:6} ({percentage:5.1f}%)")

        # Problematic URLs by category
        problematic_categories = [
            'client_error', 'server_error', 'timeout', 'ssl_error',
            'connection_error', 'invalid_url', 'unknown_error'
        ]

        for category in problematic_categories:
            urls_in_category = [
                r for r in self.results.values()
                if r['category'] == category
            ]

            if urls_in_category:
                report.append("\n" + "-" * 80)
                report.append(f"{category.upper().replace('_', ' ')} ({len(urls_in_category)} URLs)")
                report.append("-" * 80)

                for result in sorted(urls_in_category, key=lambda x: x['record_id'])[:50]:
                    report.append(f"\n  ID: {result['record_id']}")
                    report.append(f"  Title: {result['title'][:70]}")
                    report.append(f"  URL: {result['url']}")
                    if result.get('status'):
                        report.append(f"  Status: {result['status']}")
                    if result.get('error'):
                        report.append(f"  Error: {result['error']}")

                if len(urls_in_category) > 50:
                    report.append(f"\n  ... and {len(urls_in_category) - 50} more")

        # Redirected URLs
        redirected = [r for r in self.results.values() if r['category'] == 'redirected']
        if redirected:
            report.append("\n" + "-" * 80)
            report.append(f"REDIRECTED URLs ({len(redirected)})")
            report.append("-" * 80)

            for result in sorted(redirected, key=lambda x: x['record_id'])[:30]:
                report.append(f"\n  ID: {result['record_id']}")
                report.append(f"  Original: {result['url']}")
                report.append(f"  Final: {result['final_url']}")

            if len(redirected) > 30:
                report.append(f"\n  ... and {len(redirected) - 30} more")

        report.append("\n" + "=" * 80)

        return "\n".join(report)

    def export_broken_urls_csv(self) -> None:
        """Export broken URLs to CSV file."""
        broken_categories = [
            'client_error', 'server_error', 'timeout', 'ssl_error',
            'connection_error', 'invalid_url', 'unknown_error'
        ]

        broken_urls = [
            r for r in self.results.values()
            if r['category'] in broken_categories
        ]

        if not broken_urls:
            print("\n✓ No broken URLs to export")
            return

        with open(BROKEN_URLS_CSV, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=[
                'record_id', 'title', 'url', 'category', 'status', 'error', 'checked_at'
            ])
            writer.writeheader()

            for result in sorted(broken_urls, key=lambda x: x['record_id']):
                writer.writerow({
                    'record_id': result['record_id'],
                    'title': result['title'],
                    'url': result['url'],
                    'category': result['category'],
                    'status': result.get('status', ''),
                    'error': result.get('error', ''),
                    'checked_at': result['checked_at']
                })

        print(f"\n✓ Exported {len(broken_urls)} broken URLs to:")
        print(f"  {BROKEN_URLS_CSV}")


def load_records() -> List[Tuple[str, str, str]]:
    """Load records from CSV file."""
    records = []

    print(f"\n📖 Loading records from {ARCHIVE_CSV}...")

    try:
        with open(ARCHIVE_CSV, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)

            for row in reader:
                record_id = row.get('id', '')
                url = row.get('url', '').strip()
                title = row.get('title', '')

                # Skip records without URLs
                if not url or url == '':
                    continue

                # Skip invalid URLs
                if not url.startswith(('http://', 'https://')):
                    continue

                records.append((record_id, url, title))

        print(f"✓ Loaded {len(records)} records with valid URLs")
        return records

    except FileNotFoundError:
        print(f"❌ Error: Could not find {ARCHIVE_CSV}")
        return []
    except Exception as e:
        print(f"❌ Error loading records: {e}")
        return []


async def main():
    """Main execution function."""
    print("\n" + "=" * 80)
    print("URL ACCESSIBILITY CHECKER")
    print("=" * 80)

    # Load records
    records = load_records()
    if not records:
        print("\n❌ No records to check. Exiting.")
        return

    # Initialize checker
    checker = URLChecker()
    checker.load_progress()

    # Check URLs
    await checker.check_all_urls(records)

    # Generate report
    print("\n\n📊 Generating report...")
    report = checker.generate_report()

    # Save report
    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        f.write(report)

    print("\n✓ Report saved to:")
    print(f"  {REPORT_FILE}")

    # Export broken URLs
    checker.export_broken_urls_csv()

    # Print summary to console
    print("\n" + report)

    # Cleanup progress file
    if PROGRESS_FILE.exists():
        PROGRESS_FILE.unlink()
        print("\n✓ Cleaned up progress file")

    print("\n✓ Done!")


if __name__ == "__main__":
    asyncio.run(main())
