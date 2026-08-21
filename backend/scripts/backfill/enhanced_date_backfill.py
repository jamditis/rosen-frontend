# -*- coding: utf-8 -*-
"""Metadata-assisted publication-date backfill strategy."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import gspread
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from date_backfill import select_row_window
from date_extraction import extract_date_from_url

load_dotenv()


class EnhancedDateBackfiller:
    def __init__(self, worksheet: str = "final"):
        credentials_override = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        credentials_filename = credentials_override or "google_credentials.json"
        credentials_path = Path(__file__).resolve().parents[2] / credentials_filename
        self.gc = gspread.service_account(filename=str(credentials_path))
        self.sh = self.gc.open(
            os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List")
        )
        self.final_ws = self.sh.worksheet(worksheet)
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
        }

    def extract_date_from_url(self, url):
        """Extract a publication date from URL patterns (shared, see #189)."""
        return extract_date_from_url(url)

    def extract_date_from_metadata(self, url):
        """Extract publication date from webpage metadata and structured data."""
        try:
            response = requests.get(url, headers=self.headers, timeout=15)
            soup = BeautifulSoup(response.content, "html.parser")

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
                    date_val = elem.get("content") or elem.get_text(strip=True)
                    formatted = self.format_date_mmddyyyy(date_val)
                    if formatted:
                        return formatted

            for elem in soup.find_all("time"):
                formatted = self.format_date_mmddyyyy(
                    elem.get("datetime") or elem.get("pubdate")
                )
                if formatted:
                    return formatted

            date_selectors = [
                ".publish-date",
                ".publication-date",
                ".date-published",
                ".post-date",
                ".entry-date",
                ".article-date",
                ".byline-date",
                ".timestamp",
                ".published-date",
                ".date-time",
                ".post-meta .date",
                ".article-meta .date",
                ".entry-meta .date",
                ".content-date",
            ]
            for selector in date_selectors:
                elem = soup.select_one(selector)
                if elem:
                    date_text = elem.get_text(strip=True)
                    if date_text and len(date_text) < 50:
                        formatted = self.format_date_mmddyyyy(date_text)
                        if formatted:
                            return formatted

            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    data = json.loads(script.string)
                    if isinstance(data, list):
                        data = data[0] if data else {}
                    date_published = data.get("datePublished") or data.get(
                        "publishedDate"
                    )
                    formatted = self.format_date_mmddyyyy(date_published)
                    if formatted:
                        return formatted
                except (json.JSONDecodeError, TypeError, KeyError):
                    continue

            likely_date_areas = soup.find_all(
                ["p", "div", "span"],
                class_=re.compile(r"byline|meta|date|time|publish", re.I),
            )
            for elem in likely_date_areas:
                text = elem.get_text(strip=True)
                if len(text) >= 100:
                    continue
                date_match = re.search(r"(\w+\s+\d{1,2},?\s+\d{4})", text)
                if date_match:
                    formatted = self.format_date_mmddyyyy(date_match.group(1))
                    if formatted:
                        return formatted
            return None
        except Exception as exc:  # noqa: BLE001 - legacy best-effort strategy
            print(f"    [ERROR] Web scraping failed: {exc}")
            return None

    def format_date_mmddyyyy(self, date_str):
        """Convert common date formats to MM/DD/YYYY."""
        if not date_str:
            return None

        date_str = str(date_str).strip()
        date_str = re.sub(r"^(Published|Posted|Date):\s*", "", date_str, flags=re.I)
        date_str = re.sub(r"\s+(UTC|GMT|EST|PST|EDT|PDT).*$", "", date_str, flags=re.I)
        formats = [
            "%Y-%m-%d",
            "%m/%d/%Y",
            "%d/%m/%Y",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%SZ",
            "%m-%d-%Y",
            "%B %d, %Y",
            "%b %d, %Y",
            "%d %B %Y",
            "%d %b %Y",
            "%A, %B %d, %Y",
            "%a, %b %d, %Y",
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

    def backfill_missing_dates(self, start_row=2, end_row=None):
        """Backfill missing dates within an inclusive sheet-row window."""
        print("Starting enhanced publication date backfill...")
        if end_row is not None and end_row < start_row:
            raise ValueError("end_row must be greater than or equal to start_row")

        data = self.final_ws.get_all_values()
        if not data:
            print("No worksheet rows found.")
            return

        headers = data[0]
        rows = data[1:]
        pub_date_idx = headers.index("publication_date")
        url_idx = headers.index("url")
        limit = None if end_row is None else end_row - start_row + 1
        selected_rows = select_row_window(rows, start_row, limit)

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
        url_success = 0
        web_success = 0

        for offset, row in enumerate(selected_rows):
            row_num = start_row + offset
            current_date = row[pub_date_idx].strip() if pub_date_idx < len(row) else ""
            if current_date:
                skipped_count += 1
                continue

            url = row[url_idx] if url_idx < len(row) else ""
            print(f"\nProcessing row {row_num}: {url[:80]}...")

            extracted_date = self.extract_date_from_url(url)
            if extracted_date:
                print(f"    [SUCCESS-URL] {extracted_date}")
                url_success += 1
            else:
                extracted_date = self.extract_date_from_metadata(url)
                if extracted_date:
                    print(f"    [SUCCESS-WEB] {extracted_date}")
                    web_success += 1
                else:
                    print("    [FAILED] No date found")

            if extracted_date:
                cell_address = f"{chr(65 + pub_date_idx)}{row_num}"
                updates.append({"range": cell_address, "values": [[extracted_date]]})
                success_count += 1

                if len(updates) >= 20:
                    print(f"\n[BATCH UPDATE] Updating {len(updates)} records...")
                    self.final_ws.batch_update(updates)
                    updates = []
                    time.sleep(2)

        if updates:
            print(f"\n[FINAL UPDATE] Updating {len(updates)} records...")
            self.final_ws.batch_update(updates)

        processed_empty = len(selected_rows) - skipped_count
        print("\n=== ENHANCED BACKFILL COMPLETE ===")
        print(f"Successfully filled: {success_count}")
        print(f"  - URL extraction: {url_success}")
        print(f"  - Web scraping: {web_success}")
        print(f"Already had dates: {skipped_count}")
        print(f"No date found: {processed_empty - success_count}")
        print(
            f"Success rate: {success_count / max(processed_empty, 1) * 100:.1f}% "
            "of empty dates"
        )


def main():
    backfiller = EnhancedDateBackfiller()
    print("Testing enhanced backfill with first 20 rows...")
    backfiller.backfill_missing_dates(start_row=2, end_row=21)

    response = (
        input("\nContinue with all remaining records? (yes/no): ").strip().lower()
    )
    if response == "yes":
        print("Processing all remaining records...")
        backfiller.backfill_missing_dates(start_row=22)


if __name__ == "__main__":
    main()
