# -*- coding: utf-8 -*-
"""
Simple Publication Date Backfill Script

Focuses on URL-based date extraction which works very well for PressThink URLs.
"""

import gspread
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# Anchor to this script's directory so the shared helper resolves whether the
# script is run directly, loaded by file path (tests), or imported via the
# `backfill` namespace package (run_date_backfill.py). See issue #189.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from date_extraction import extract_date_from_url

# Load environment variables
load_dotenv()

class SimpleDateBackfiller:
    def __init__(self):
        self.gc = gspread.service_account(filename='google_credentials.json')
        self.sh = self.gc.open(os.environ.get('SPREADSHEET_NAME', 'Rosen Archive URL List'))
        self.final_ws = self.sh.worksheet('final')

    def extract_date_from_url(self, url):
        """Extract a publication date from URL patterns (shared, see #189)."""
        return extract_date_from_url(url)

    def backfill_publication_dates(self):
        """Backfill missing publication dates focusing on URL extraction."""
        print("Starting publication date backfill (URL extraction focus)...")

        # Get all data
        data = self.final_ws.get_all_values()
        headers = data[0]
        rows = data[1:]

        # Find relevant column indices
        pub_date_idx = headers.index('publication_date')
        url_idx = headers.index('url')

        print(f"Found {len(rows)} total records")
        print(f"publication_date column: {pub_date_idx} (Column {chr(65 + pub_date_idx)})")

        # Process all rows
        updates = []
        success_count = 0
        skipped_count = 0

        for i, row in enumerate(rows):
            row_num = i + 2  # Row 2 is first data row

            # Skip if already has publication date
            current_date = row[pub_date_idx].strip() if pub_date_idx < len(row) else ''
            if current_date:
                skipped_count += 1
                continue

            url = row[url_idx] if url_idx < len(row) else ''
            print(f"Processing row {row_num}: {url[:70]}...")

            # Extract from URL
            extracted_date = self.extract_date_from_url(url)
            if extracted_date:
                # Update the cell
                cell_address = f"{chr(65 + pub_date_idx)}{row_num}"
                updates.append({
                    'range': cell_address,
                    'values': [[extracted_date]]
                })
                success_count += 1
                print(f"  [SUCCESS] {cell_address} <- {extracted_date}")

                # Batch update every 50 records to avoid API limits
                if len(updates) >= 50:
                    print(f"\\n[BATCH UPDATE] Updating {len(updates)} records...")
                    self.final_ws.batch_update(updates)
                    updates = []
                    time.sleep(1)  # Rate limiting
            else:
                print("  [SKIP] No date pattern in URL")

        # Final batch update
        if updates:
            print(f"\\n[FINAL UPDATE] Updating {len(updates)} records...")
            self.final_ws.batch_update(updates)

        print("\\n=== BACKFILL COMPLETE ===")
        print(f"Successfully filled: {success_count}")
        print(f"Already had dates: {skipped_count}")
        print(f"No date found: {len(rows) - success_count - skipped_count}")
        print(f"Total processed: {len(rows)}")
        print(f"Success rate: {success_count/(len(rows)-skipped_count)*100:.1f}% of empty dates")

def main():
    """Main execution function."""
    backfiller = SimpleDateBackfiller()
    backfiller.backfill_publication_dates()

if __name__ == "__main__":
    main()