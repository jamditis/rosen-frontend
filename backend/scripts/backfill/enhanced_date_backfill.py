# -*- coding: utf-8 -*-
"""
Enhanced Publication Date Backfill Script

Comprehensive date extraction using:
1. URL pattern extraction (for PressThink URLs)
2. Web scraping for metadata, OpenGraph, RSS, and other structured data
3. Advanced HTML parsing for publication date information
"""

import gspread
import os
import re
import sys
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Anchor to this script's directory so the shared helper resolves whether the
# script is run directly, loaded by file path (tests), or imported as part of
# the `backfill` namespace package by a wrapper script. See issue #189.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from date_extraction import extract_date_from_url

# Load environment variables
load_dotenv()

class EnhancedDateBackfiller:
    def __init__(self):
        self.gc = gspread.service_account(filename='google_credentials.json')
        self.sh = self.gc.open(os.environ.get('SPREADSHEET_NAME', 'Rosen Archive URL List'))
        self.final_ws = self.sh.worksheet('final')

        # User agents for different scraping strategies
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
        }

    def extract_date_from_url(self, url):
        """Extract a publication date from URL patterns (shared, see #189)."""
        return extract_date_from_url(url)

    def extract_date_from_metadata(self, url):
        """Extract publication date from webpage metadata and structured data."""
        try:
            response = requests.get(url, headers=self.headers, timeout=15)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Strategy 1: OpenGraph and meta tags (most reliable)
            meta_selectors = [
                'meta[property="article:published_time"]',
                'meta[property="article:published"]',
                'meta[name="publish-date"]',
                'meta[name="publication-date"]',
                'meta[name="date"]',
                'meta[name="pubdate"]',
                'meta[itemprop="datePublished"]',
                'meta[itemprop="publishDate"]',
                'meta[name="DC.date.issued"]',
                'meta[name="sailthru.date"]',
                'meta[name="article.published"]',
                'meta[property="bt:pubDate"]',
            ]

            for selector in meta_selectors:
                elem = soup.select_one(selector)
                if elem:
                    date_val = elem.get('content') or elem.get_text(strip=True)
                    if date_val:
                        formatted = self.format_date_mmddyyyy(date_val)
                        if formatted:
                            return formatted

            # Strategy 2: Time elements with datetime attributes
            time_elements = soup.find_all('time')
            for elem in time_elements:
                datetime_attr = elem.get('datetime') or elem.get('pubdate')
                if datetime_attr:
                    formatted = self.format_date_mmddyyyy(datetime_attr)
                    if formatted:
                        return formatted

            # Strategy 3: Common CSS selectors for publication dates
            date_selectors = [
                '.publish-date', '.publication-date', '.date-published',
                '.post-date', '.entry-date', '.article-date',
                '.byline-date', '.timestamp', '.published-date',
                '.date-time', '.post-meta .date', '.article-meta .date',
                '.entry-meta .date', '.content-date'
            ]

            for selector in date_selectors:
                elem = soup.select_one(selector)
                if elem:
                    date_text = elem.get_text(strip=True)
                    if date_text and len(date_text) < 50:  # Avoid long text blocks
                        formatted = self.format_date_mmddyyyy(date_text)
                        if formatted:
                            return formatted

            # Strategy 4: JSON-LD structured data
            json_ld_scripts = soup.find_all('script', type='application/ld+json')
            for script in json_ld_scripts:
                try:
                    import json
                    data = json.loads(script.string)
                    # Handle both single objects and arrays
                    if isinstance(data, list):
                        data = data[0] if data else {}

                    # Look for datePublished or publishedDate
                    date_published = data.get('datePublished') or data.get('publishedDate')
                    if date_published:
                        formatted = self.format_date_mmddyyyy(date_published)
                        if formatted:
                            return formatted
                except (json.JSONDecodeError, TypeError, KeyError):
                    continue

            # Strategy 5: Look for date patterns in text content (last resort)
            # Focus on byline areas, headers, and meta content
            likely_date_areas = soup.find_all(['p', 'div', 'span'], class_=re.compile(r'byline|meta|date|time|publish', re.I))
            for elem in likely_date_areas:
                text = elem.get_text(strip=True)
                if len(text) < 100:  # Avoid long paragraphs
                    # Look for date patterns in the text
                    date_match = re.search(r'(\w+\s+\d{1,2},?\s+\d{4})', text)  # "January 15, 2024"
                    if date_match:
                        formatted = self.format_date_mmddyyyy(date_match.group(1))
                        if formatted:
                            return formatted

            return None

        except Exception as e:
            print(f"    [ERROR] Web scraping failed: {e}")
            return None

    def format_date_mmddyyyy(self, date_str):
        """Convert various date formats to MM/DD/YYYY format."""
        if not date_str:
            return None

        date_str = str(date_str).strip()

        # Clean common prefixes/suffixes
        date_str = re.sub(r'^(Published|Posted|Date):\s*', '', date_str, flags=re.I)
        date_str = re.sub(r'\s+(UTC|GMT|EST|PST|EDT|PDT).*$', '', date_str, flags=re.I)

        # Handle common formats
        formats = [
            '%Y-%m-%d',              # 2024-03-15
            '%m/%d/%Y',              # 03/15/2024
            '%d/%m/%Y',              # 15/03/2024
            '%Y-%m-%dT%H:%M:%S',     # ISO format
            '%Y-%m-%dT%H:%M:%S.%fZ', # ISO with microseconds
            '%Y-%m-%dT%H:%M:%SZ',    # ISO with Z
            '%m-%d-%Y',              # 03-15-2024
            '%B %d, %Y',             # March 15, 2024
            '%b %d, %Y',             # Mar 15, 2024
            '%d %B %Y',              # 15 March 2024
            '%d %b %Y',              # 15 Mar 2024
            '%A, %B %d, %Y',         # Monday, March 15, 2024
            '%a, %b %d, %Y',         # Mon, Mar 15, 2024
        ]

        for fmt in formats:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime('%m/%d/%Y')
            except ValueError:
                continue

        # Try partial date patterns (year-month only)
        year_month_match = re.search(r'(\d{4})-(\d{2})', date_str)
        if year_month_match:
            year, month = year_month_match.groups()
            try:
                dt = datetime(int(year), int(month), 1)
                return dt.strftime('%m/%d/%Y')
            except ValueError:
                pass

        return None

    def backfill_missing_dates(self, start_row=2, end_row=None):
        """Backfill missing publication dates with enhanced metadata extraction."""
        print("Starting enhanced publication date backfill...")

        # Get all data
        data = self.final_ws.get_all_values()
        headers = data[0]
        rows = data[1:]

        pub_date_idx = headers.index('publication_date')
        url_idx = headers.index('url')

        print(f"Found {len(rows)} total records")
        print(f"publication_date column: {pub_date_idx} (Column {chr(65 + pub_date_idx)})")

        # Determine processing range
        if end_row is None:
            end_row = len(rows) + 1

        # Process specified range
        updates = []
        success_count = 0
        skipped_count = 0
        url_success = 0
        web_success = 0

        for i in range(start_row - 2, min(end_row - 1, len(rows))):
            row_num = i + 2
            row = rows[i]

            # Skip if already has publication date
            current_date = row[pub_date_idx].strip() if pub_date_idx < len(row) else ''
            if current_date:
                skipped_count += 1
                continue

            url = row[url_idx] if url_idx < len(row) else ''
            print(f"\\nProcessing row {row_num}: {url[:80]}...")

            extracted_date = None

            # Strategy 1: Fast URL extraction (PressThink)
            extracted_date = self.extract_date_from_url(url)
            if extracted_date:
                print(f"    [SUCCESS-URL] {extracted_date}")
                url_success += 1
            else:
                # Strategy 2: Comprehensive metadata extraction
                extracted_date = self.extract_date_from_metadata(url)
                if extracted_date:
                    print(f"    [SUCCESS-WEB] {extracted_date}")
                    web_success += 1
                else:
                    print("    [FAILED] No date found")

            if extracted_date:
                # Update the cell
                cell_address = f"{chr(65 + pub_date_idx)}{row_num}"
                updates.append({
                    'range': cell_address,
                    'values': [[extracted_date]]
                })
                success_count += 1

                # Batch update every 20 records for metadata scraping
                if len(updates) >= 20:
                    print(f"\\n[BATCH UPDATE] Updating {len(updates)} records...")
                    self.final_ws.batch_update(updates)
                    updates = []
                    time.sleep(2)  # Longer delay for web scraping

        # Final batch update
        if updates:
            print(f"\\n[FINAL UPDATE] Updating {len(updates)} records...")
            self.final_ws.batch_update(updates)

        print("\\n=== ENHANCED BACKFILL COMPLETE ===")
        print(f"Successfully filled: {success_count}")
        print(f"  - URL extraction: {url_success}")
        print(f"  - Web scraping: {web_success}")
        print(f"Already had dates: {skipped_count}")
        processed_empty = end_row - start_row + 1 - skipped_count
        print(f"No date found: {processed_empty - success_count}")
        print(f"Success rate: {success_count/max(processed_empty,1)*100:.1f}% of empty dates")

def main():
    """Main execution function."""
    backfiller = EnhancedDateBackfiller()

    # Test with first 20 rows
    print("Testing enhanced backfill with first 20 rows...")
    backfiller.backfill_missing_dates(start_row=2, end_row=21)

    response = input("\\nContinue with all remaining records? (yes/no): ").strip().lower()
    if response == 'yes':
        print("Processing all remaining records...")
        backfiller.backfill_missing_dates(start_row=22)

if __name__ == "__main__":
    main()