# -*- coding: utf-8 -*-
"""
This script backfills the 'pull_quote' and 'raw_text' columns in the 'test_runs'
tab of the Google Sheet for rows where this information is missing.
"""

import gspread
import os
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv



# Ensure core package imports resolve when running from tools/
ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"

from rosen_scraper import dispatcher, entity_resolver

# Load environment variables from a .env file for secure configuration management.
load_dotenv()

# Define key file paths relative to the repo root.
SCHEMA_FILE = ROOT_DIR / 'schema.json'
KNOWN_ENTITIES_FILE = ROOT_DIR / 'known_entities.json'

# Define column indices for clarity
PULL_QUOTE_COL_INDEX = 30 # Column AE (zero-based for list access)
RAW_TEXT_COL_INDEX = 31   # Column AF (zero-based for list access)
NOTES_COL_INDEX = 33      # Column AH (zero-based for list access)

def get_schema(schema_file):
    """
    Loads the JSON schema from the specified file.
    """
    try:
        with open(schema_file, 'r', encoding='utf-8-sig') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"FATAL: Could not load schema. Error: {e}")
        return None

def main():
    """The main function for the backfill worker."""
    # --- 1. Connect to Google Sheets ---
    try:
        credentials_filename = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
        credentials_path = ROOT_DIR / credentials_filename
        gc = gspread.service_account(filename=str(credentials_path))
        sh = gc.open(os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List"))
        test_worksheet = sh.worksheet("test_runs")
    except Exception as e:
        print(f"Error connecting to Google Sheets: {e}")
        return

    # --- 2. Fetch Data ---
    all_values = test_worksheet.get_all_values()
    if len(all_values) < 2:
        print("No data to process.")
        return
    
    header = all_values[0]
    data = all_values[1:]

    # --- 3. Load Schema and Known Entities ---
    schema = get_schema(SCHEMA_FILE)
    if not schema: return
    known_entities = entity_resolver.load_known_entities(str(KNOWN_ENTITIES_FILE))
    if not known_entities: return

    # --- 4. Process Each Row ---
    for i, row in enumerate(data):
        row_index = i + 2  # gspread uses 1-based indexing
        
        # --- ADDED CHECK ---
        # Skip row if a note already exists in column AH, as this indicates
        # it has already been processed or manually reviewed.
        if len(row) > NOTES_COL_INDEX and row[NOTES_COL_INDEX]:
            continue

        row_data = dict(zip(header, row))
        
        # Only process if both pull_quote and raw_text are empty
        pull_quote_exists = len(row) > PULL_QUOTE_COL_INDEX and row[PULL_QUOTE_COL_INDEX]
        raw_text_exists = len(row) > RAW_TEXT_COL_INDEX and row[RAW_TEXT_COL_INDEX]

        if pull_quote_exists and raw_text_exists:
            continue

        url = row_data.get('url')
        if not url:
            continue

        print(f"--- Backfilling Row {row_index}: {url} ---")

        # Re-process the URL to get the pull quote and raw text
        processed_data = dispatcher.dispatch_url(url, schema)

        if processed_data:
            pull_quote = processed_data.get('pull_quote')
            raw_text = processed_data.get('raw_text')

            # Update the sheet
            try:
                if not pull_quote_exists:
                    # Update column AE (index 31)
                    test_worksheet.update_cell(row_index, PULL_QUOTE_COL_INDEX + 1, pull_quote)
                if not raw_text_exists:
                    # Update column AF (index 32)
                    test_worksheet.update_cell(row_index, RAW_TEXT_COL_INDEX + 1, raw_text)
                print(f"  [SUCCESS] Updated row {row_index} with missing data.")
            except Exception as e:
                print(f"  [FAIL] Could not update row {row_index}. Error: {e}")
        else:
            print(f"  [FAIL] Could not process URL: {url}")

if __name__ == "__main__":
    main()
