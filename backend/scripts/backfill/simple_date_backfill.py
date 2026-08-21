# -*- coding: utf-8 -*-
"""URL-pattern publication-date backfill strategy."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import gspread
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from date_backfill import select_row_window
from date_extraction import extract_date_from_url

load_dotenv()


class SimpleDateBackfiller:
    def __init__(self, worksheet: str = "final"):
        credentials_override = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        credentials_filename = credentials_override or "google_credentials.json"
        credentials_path = Path(__file__).resolve().parents[2] / credentials_filename
        self.gc = gspread.service_account(filename=str(credentials_path))
        self.sh = self.gc.open(
            os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List")
        )
        self.final_ws = self.sh.worksheet(worksheet)

    def extract_date_from_url(self, url):
        """Extract a publication date from URL patterns (shared, see #189)."""
        return extract_date_from_url(url)

    def backfill_publication_dates(self, start_row=2, max_rows=None):
        """Backfill missing dates within an explicit sheet-row window."""
        print("Starting publication date backfill (URL extraction focus)...")

        data = self.final_ws.get_all_values()
        if not data:
            print("No worksheet rows found.")
            return

        headers = data[0]
        rows = data[1:]
        pub_date_idx = headers.index("publication_date")
        url_idx = headers.index("url")
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

        for offset, row in enumerate(selected_rows):
            row_num = start_row + offset
            current_date = row[pub_date_idx].strip() if pub_date_idx < len(row) else ""
            if current_date:
                skipped_count += 1
                continue

            url = row[url_idx] if url_idx < len(row) else ""
            print(f"Processing row {row_num}: {url[:70]}...")

            extracted_date = self.extract_date_from_url(url)
            if extracted_date:
                cell_address = f"{chr(65 + pub_date_idx)}{row_num}"
                updates.append({"range": cell_address, "values": [[extracted_date]]})
                success_count += 1
                print(f"  [SUCCESS] {cell_address} <- {extracted_date}")

                if len(updates) >= 50:
                    print(f"\n[BATCH UPDATE] Updating {len(updates)} records...")
                    self.final_ws.batch_update(updates)
                    updates = []
                    time.sleep(1)
            else:
                print("  [SKIP] No date pattern in URL")

        if updates:
            print(f"\n[FINAL UPDATE] Updating {len(updates)} records...")
            self.final_ws.batch_update(updates)

        empty_count = len(selected_rows) - skipped_count
        print("\n=== BACKFILL COMPLETE ===")
        print(f"Successfully filled: {success_count}")
        print(f"Already had dates: {skipped_count}")
        print(f"No date found: {empty_count - success_count}")
        print(f"Total inspected: {len(selected_rows)}")
        print(
            f"Success rate: {success_count / max(empty_count, 1) * 100:.1f}% "
            "of empty dates"
        )


def main():
    backfiller = SimpleDateBackfiller()
    backfiller.backfill_publication_dates()


if __name__ == "__main__":
    main()
