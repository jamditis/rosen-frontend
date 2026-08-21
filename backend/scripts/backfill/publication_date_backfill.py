# -*- coding: utf-8 -*-
"""AI-assisted publication-date backfill strategy."""

from __future__ import annotations

import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import google.generativeai as genai
import gspread
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from date_backfill import select_row_window
from date_extraction import extract_date_from_url

load_dotenv()
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))


class PublicationDateBackfiller:
    def __init__(self, worksheet: str = "final"):
        credentials_override = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        credentials_filename = credentials_override or "google_credentials.json"
        credentials_path = Path(__file__).resolve().parents[2] / credentials_filename
        self.gc = gspread.service_account(filename=str(credentials_path))
        self.sh = self.gc.open(
            os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List")
        )
        self.final_ws = self.sh.worksheet(worksheet)
        self.model = genai.GenerativeModel("gemini-1.5-flash")

    def extract_date_from_url(self, url):
        """Extract a publication date from URL patterns (shared, see #189)."""
        return extract_date_from_url(url)

    def extract_date_from_web(self, url):
        """Extract publication date by scraping the webpage."""
        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " "AppleWebKit/537.36"
                )
            }
            response = requests.get(url, headers=headers, timeout=10)
            soup = BeautifulSoup(response.content, "html.parser")

            date_selectors = [
                'meta[property="article:published_time"]',
                'meta[name="publish-date"]',
                'meta[name="date"]',
                'meta[name="publication-date"]',
                'meta[name="pubdate"]',
                'meta[property="article:published"]',
                'meta[itemprop="datePublished"]',
                "time[datetime]",
                "time[pubdate]",
                ".publish-date",
                ".publication-date",
                ".date-published",
                ".post-date",
                ".entry-date",
                ".article-date",
            ]

            for selector in date_selectors:
                elem = soup.select_one(selector)
                if not elem:
                    continue
                date_val = (
                    elem.get("content")
                    or elem.get("datetime")
                    or elem.get_text(strip=True)
                )
                if date_val:
                    formatted_date = self.format_date_mmddyyyy(date_val)
                    if formatted_date:
                        return formatted_date
            return None
        except Exception as exc:  # noqa: BLE001 - legacy best-effort strategy
            print(f"Web scraping failed for {url}: {exc}")
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

            Publication Date (MM/DD/YYYY):
            """
            response = self.model.generate_content(prompt)
            date_text = response.text.strip()
            if re.match(r"^\d{2}/\d{2}/\d{4}$", date_text):
                return date_text
            if date_text != "UNKNOWN":
                return self.format_date_mmddyyyy(date_text)
            return None
        except Exception as exc:  # noqa: BLE001 - legacy best-effort strategy
            print(f"AI date extraction failed for {url}: {exc}")
            return None

    def format_date_mmddyyyy(self, date_str):
        """Convert common date formats to MM/DD/YYYY."""
        if not date_str:
            return None
        date_str = str(date_str).strip()
        formats = [
            "%Y-%m-%d",
            "%m/%d/%Y",
            "%d/%m/%Y",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%m-%d-%Y",
            "%B %d, %Y",
            "%b %d, %Y",
            "%d %B %Y",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt).strftime("%m/%d/%Y")
            except ValueError:
                continue

        match = re.search(r"(\d{4})-(\d{2})", date_str)
        if match:
            year, month = match.groups()
            try:
                return datetime(int(year), int(month), 1).strftime("%m/%d/%Y")
            except ValueError:
                pass
        return None

    def backfill_publication_dates(self, start_row=2, max_rows=None):
        """Backfill missing dates within an explicit sheet-row window."""
        print("Starting publication date backfill...")

        data = self.final_ws.get_all_values()
        if not data:
            print("No worksheet rows found.")
            return

        headers = data[0]
        rows = data[1:]
        pub_date_idx = (
            headers.index("publication_date") if "publication_date" in headers else None
        )
        url_idx = headers.index("url") if "url" in headers else 2
        title_idx = headers.index("title") if "title" in headers else 1
        excerpt_idx = headers.index("excerpt") if "excerpt" in headers else None

        if pub_date_idx is None:
            print("ERROR: publication_date column not found!")
            return

        selected_rows = select_row_window(rows, start_row, max_rows)
        print(f"Found {len(rows)} total records")
        print(
            f"publication_date column: {pub_date_idx} "
            f"(Column {chr(65 + pub_date_idx)})"
        )
        print(
            f"Inspecting {len(selected_rows)} records beginning at sheet row {start_row}"
        )

        updates = []
        success_count = 0
        skipped_count = 0
        failed_count = 0

        for offset, row in enumerate(selected_rows):
            row_num = start_row + offset
            current_date = row[pub_date_idx].strip() if pub_date_idx < len(row) else ""
            if current_date:
                skipped_count += 1
                continue

            url = row[url_idx] if url_idx < len(row) else ""
            title = row[title_idx] if title_idx < len(row) else ""
            excerpt = (
                row[excerpt_idx]
                if excerpt_idx is not None and excerpt_idx < len(row)
                else ""
            )
            print(f"\nProcessing row {row_num}: {url[:60]}...")

            extracted_date = self.extract_date_from_url(url)
            if extracted_date:
                print(f"  [SUCCESS] URL extraction: {extracted_date}")
            else:
                extracted_date = self.extract_date_from_web(url)
                if extracted_date:
                    print(f"  [SUCCESS] Web scraping: {extracted_date}")
                else:
                    extracted_date = self.extract_date_with_ai(url, title, excerpt)
                    if extracted_date:
                        print(f"  [SUCCESS] AI extraction: {extracted_date}")

            if extracted_date:
                cell_address = f"{chr(65 + pub_date_idx)}{row_num}"
                updates.append({"range": cell_address, "values": [[extracted_date]]})
                success_count += 1
                print(f"  -> Will update {cell_address} with {extracted_date}")

                if len(updates) >= 25:
                    print(f"\n[BATCH UPDATE] Updating {len(updates)} records...")
                    self.final_ws.batch_update(updates)
                    updates = []
                    time.sleep(1)
            else:
                failed_count += 1
                print("  [FAILED] No date found")

        if updates:
            print(f"\n[FINAL UPDATE] Updating {len(updates)} records...")
            self.final_ws.batch_update(updates)

        attempted_count = success_count + failed_count
        print("\n=== BACKFILL COMPLETE ===")
        print(f"Successfully filled: {success_count}")
        print(f"Already had dates: {skipped_count}")
        print(f"No date found: {failed_count}")
        print(f"Total inspected: {len(selected_rows)}")
        print(
            f"Success rate: {success_count / max(attempted_count, 1) * 100:.1f}% "
            "of empty dates"
        )


def main():
    backfiller = PublicationDateBackfiller()
    print("Testing with first 10 records...")
    backfiller.backfill_publication_dates(start_row=2, max_rows=10)

    response = input("\nContinue with all records? (yes/no): ").strip().lower()
    if response == "yes":
        print("\nProcessing all records...")
        backfiller.backfill_publication_dates(start_row=2)
    else:
        print("Stopped at user request.")


if __name__ == "__main__":
    main()
