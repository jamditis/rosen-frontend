# -*- coding: utf-8 -*-
"""
Publication Date Backfill Script

This script backfills missing publication_date values in the final sheet by:
1. Using AI analysis for date extraction from URLs and content patterns
2. Extracting dates directly from URLs (especially PressThink archives)
3. Using advanced web scraping for publication dates
4. Formatting all dates to MM/DD/YYYY format
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
import google.generativeai as genai

# Anchor to this script's directory so the shared helper resolves whether the
# script is run directly, loaded by file path (tests), or imported as part of
# the `backfill` namespace package by a wrapper script. See issue #189.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from date_extraction import extract_date_from_url

# Load environment variables
load_dotenv()

# Configure Gemini AI
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

class PublicationDateBackfiller:
    def __init__(self):
        # Anchor credentials to backend/ so the script runs from any cwd; an
        # absolute GOOGLE_APPLICATION_CREDENTIALS overrides (pathlib resets to it).
        credentials_filename = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
        credentials_path = Path(__file__).resolve().parents[2] / credentials_filename
        self.gc = gspread.service_account(filename=str(credentials_path))
        self.sh = self.gc.open(os.environ.get('SPREADSHEET_NAME', 'Rosen Archive URL List'))
        self.final_ws = self.sh.worksheet('final')
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    def extract_date_from_url(self, url):
        """Extract a publication date from URL patterns (shared, see #189)."""
        return extract_date_from_url(url)

    def extract_date_from_web(self, url):
        """Extract publication date by scraping the webpage."""
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, headers=headers, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Meta tag selectors for publication date
            date_selectors = [
                'meta[property="article:published_time"]',
                'meta[name="publish-date"]',
                'meta[name="date"]',
                'meta[name="publication-date"]',
                'meta[name="pubdate"]',
                'meta[property="article:published"]',
                'meta[itemprop="datePublished"]',
                'time[datetime]',
                'time[pubdate]',
                '.publish-date', '.publication-date', '.date-published',
                '.post-date', '.entry-date', '.article-date'
            ]

            for selector in date_selectors:
                elem = soup.select_one(selector)
                if elem:
                    date_val = (elem.get('content') or
                              elem.get('datetime') or
                              elem.get_text(strip=True))

                    if date_val:
                        formatted_date = self.format_date_mmddyyyy(date_val)
                        if formatted_date:
                            return formatted_date

            return None

        except Exception as e:
            print(f"Web scraping failed for {url}: {e}")
            return None

    def extract_date_with_ai(self, url, title, content_excerpt=""):
        """Use AI to extract publication date from URL and content."""
        try:
            prompt = f"""
            Extract the publication date for this article:

            URL: {url}
            Title: {title}
            Content excerpt: {content_excerpt[:500]}...

            Rules:
            1. Look for date patterns in the URL path
            2. For PressThink URLs, extract year/month/day from the URL structure
            3. Return date in MM/DD/YYYY format
            4. If exact day is unknown, use the 1st of the month
            5. If you cannot determine a date, respond with "UNKNOWN"

            Examples:
            - URL "pressthink.org/2020/11/article" → "11/01/2020"
            - URL "archive.pressthink.org/2003/08/25/file.html" → "08/25/2003"
            - URL with "2019-08-15" → "08/15/2019"

            Publication Date (MM/DD/YYYY):
            """

            response = self.model.generate_content(prompt)
            date_text = response.text.strip()

            # Validate the response format
            if re.match(r'^\d{2}/\d{2}/\d{4}$', date_text):
                return date_text
            elif date_text != "UNKNOWN":
                # Try to format whatever we got
                return self.format_date_mmddyyyy(date_text)

            return None

        except Exception as e:
            print(f"AI date extraction failed for {url}: {e}")
            return None

    def format_date_mmddyyyy(self, date_str):
        """Convert various date formats to MM/DD/YYYY format."""
        if not date_str:
            return None

        # Clean the date string
        date_str = date_str.strip()

        # Handle common formats
        formats = [
            '%Y-%m-%d',      # 2024-03-15
            '%m/%d/%Y',      # 03/15/2024 (already correct)
            '%d/%m/%Y',      # 15/03/2024
            '%Y-%m-%d %H:%M:%S',  # 2024-03-15 10:30:00
            '%Y-%m-%dT%H:%M:%S',  # ISO format
            '%m-%d-%Y',      # 03-15-2024
            '%B %d, %Y',     # March 15, 2024
            '%b %d, %Y',     # Mar 15, 2024
            '%d %B %Y',      # 15 March 2024
        ]

        for fmt in formats:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime('%m/%d/%Y')
            except ValueError:
                continue

        # Try regex patterns for partial dates
        year_month_pattern = r'(\d{4})-(\d{2})'
        match = re.search(year_month_pattern, date_str)
        if match:
            year, month = match.groups()
            try:
                dt = datetime(int(year), int(month), 1)
                return dt.strftime('%m/%d/%Y')
            except ValueError:
                pass

        return None

    def backfill_publication_dates(self, start_row=2, max_rows=None):
        """Backfill missing publication dates in the final sheet."""
        print("Starting publication date backfill...")

        # Get all data
        data = self.final_ws.get_all_values()
        headers = data[0]
        rows = data[1:]

        # Find relevant column indices
        pub_date_idx = headers.index('publication_date') if 'publication_date' in headers else None
        url_idx = headers.index('url') if 'url' in headers else 2
        title_idx = headers.index('title') if 'title' in headers else 1
        excerpt_idx = headers.index('excerpt') if 'excerpt' in headers else None

        if pub_date_idx is None:
            print("ERROR: publication_date column not found!")
            return

        print(f"Found {len(rows)} total records")
        print(f"publication_date column: {pub_date_idx} (Column {chr(65 + pub_date_idx)})")

        # Process rows
        end_row = min(len(rows), max_rows) if max_rows else len(rows)
        updates = []
        success_count = 0

        for i in range(end_row):
            row_num = start_row + i
            row = rows[i]

            # Skip if already has publication date
            current_date = row[pub_date_idx].strip() if pub_date_idx < len(row) else ''
            if current_date:
                continue

            url = row[url_idx] if url_idx < len(row) else ''
            title = row[title_idx] if title_idx < len(row) else ''
            excerpt = row[excerpt_idx] if excerpt_idx and excerpt_idx < len(row) else ''

            print(f"\\nProcessing row {row_num}: {url[:60]}...")

            # Strategy 1: Extract from URL
            extracted_date = self.extract_date_from_url(url)
            if extracted_date:
                print(f"  [SUCCESS] URL extraction: {extracted_date}")
            else:
                # Strategy 2: Web scraping
                extracted_date = self.extract_date_from_web(url)
                if extracted_date:
                    print(f"  [SUCCESS] Web scraping: {extracted_date}")
                else:
                    # Strategy 3: AI analysis
                    extracted_date = self.extract_date_with_ai(url, title, excerpt)
                    if extracted_date:
                        print(f"  [SUCCESS] AI extraction: {extracted_date}")

            if extracted_date:
                # Update the cell
                cell_address = f"{chr(65 + pub_date_idx)}{row_num}"
                updates.append({
                    'range': cell_address,
                    'values': [[extracted_date]]
                })
                success_count += 1
                print(f"  → Will update {cell_address} with {extracted_date}")

                # Batch update every 25 records to avoid API limits
                if len(updates) >= 25:
                    print(f"\\n⚡ Batch updating {len(updates)} records...")
                    self.final_ws.batch_update(updates)
                    updates = []
                    time.sleep(1)  # Rate limiting
            else:
                print("  [FAILED] No date found")

        # Final batch update
        if updates:
            print(f"\\n⚡ Final batch updating {len(updates)} records...")
            self.final_ws.batch_update(updates)

        print("\\n=== BACKFILL COMPLETE ===")
        print(f"Successfully filled {success_count}/{end_row} publication dates")
        print(f"Success rate: {success_count/end_row*100:.1f}%")

def main():
    """Main execution function."""
    backfiller = PublicationDateBackfiller()

    # Test with first 10 records
    print("Testing with first 10 records...")
    backfiller.backfill_publication_dates(start_row=2, max_rows=10)

    # Ask for confirmation to continue with all records
    response = input("\\nContinue with all records? (yes/no): ").strip().lower()
    if response == 'yes':
        print("\\nProcessing all records...")
        backfiller.backfill_publication_dates(start_row=2)
    else:
        print("Stopped at user request.")

if __name__ == "__main__":
    main()