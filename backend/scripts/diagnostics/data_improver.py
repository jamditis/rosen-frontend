# -*- coding: utf-8 -*-
"""
This script analyzes and improves the accuracy of the data in the 'test_runs'
tab of the Google Sheet. It can use existing raw_text to avoid re-scraping
and leaves notes after processing.
"""

import gspread
import os
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv
import time
from datetime import datetime # Import datetime for timestamped notes

ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

from src import entity_resolver, dispatcher

# Load environment variables from a .env file for secure configuration management.
load_dotenv()

# Define key file paths relative to the repository root.
SCHEMA_FILE = ROOT_DIR / 'schema.json'
KNOWN_ENTITIES_FILE = SRC_DIR / 'known_entities.json'

# Define column indices for clarity (using 1-based indexing for gspread)
RAW_TEXT_COL_INDEX = 31 # Column AF (zero-based index for list access)
NOTES_COL = 34          # Column AH (one-based index for gspread)

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

def _truncate(text, max_length=75):
    """Truncates text to a max length, adding '...' if needed."""
    if text is None:
        return ''
    return text if len(text) <= max_length else text[:max_length-3] + "..."

def compare_and_update(worksheet, row_index, header, existing_data, new_data, field_name, notes):
    """
    Compares a field and updates the sheet if the new data is better, with descriptive notes.
    """
    existing_value = existing_data.get(field_name)
    new_value = new_data.get(field_name)

    if new_value and existing_value != new_value:
        try:
            col_index = header.index(field_name) + 1
            worksheet.update_cell(row_index, col_index, new_value)
            notes.append(f"Updated {field_name}: from '{_truncate(existing_value)}' to '{_truncate(new_value)}'.")
            time.sleep(1)
        except Exception as e:
            print(f"  [FAIL] Could not update {field_name} for row {row_index}. Error: {e}")

import re

def _parse_existing_list(value_str):
    """
    Parses a string from a sheet cell into a list, handling various formats.
    """
    if not value_str:
        return []
    
    if value_str.startswith('[') and value_str.endswith(']'):
        try:
            return json.loads(value_str)
        except json.JSONDecodeError:
            pass

    return [item.strip() for item in re.split(r'[;,]', value_str) if item.strip()]

def compare_and_update_list(worksheet, row_index, header, existing_data, new_data, field_name, notes):
    """
    Compares a list field, cleans data, and updates the sheet with descriptive notes.
    """
    existing_values_str = existing_data.get(field_name, "")
    existing_values = set(_parse_existing_list(existing_values_str))
    
    new_values = new_data.get(field_name, [])
    if not isinstance(new_values, list):
        new_values = [str(new_values)]
    new_values = set(item.strip() for item in new_values if item.strip())

    # Combine and create a sorted final list
    final_values = sorted(list(existing_values.union(new_values)))

    if final_values != sorted(list(existing_values)):
        added = sorted(list(new_values - existing_values))
        removed = sorted(list(existing_values - new_values))
        
        note_parts = []
        if added:
            note_parts.append(f"Added {field_name}: {', '.join(added)}.")
        if removed:
            note_parts.append(f"Removed {field_name}: {', '.join(removed)}.")

        if note_parts:
            try:
                col_index = header.index(field_name) + 1
                worksheet.update_cell(row_index, col_index, ", ".join(final_values))
                notes.extend(note_parts)
                time.sleep(1)
            except Exception as e:
                print(f"  [FAIL] Could not update {field_name} for row {row_index}. Error: {e}")

def main():
    """The main function for the data improver."""
    # --- 1. Connect to Google Sheets ---
    try:
        credentials_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json"))
        gc = gspread.service_account(filename=credentials_path)
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
        row_index = i + 2 # gspread uses 1-based indexing
        
        # Skip row if a note already exists in column AH
        if len(row) > NOTES_COL - 1 and row[NOTES_COL - 1]:
            continue

        row_data = dict(zip(header, row))
        url = row_data.get('url')
        if not url:
            test_worksheet.update_cell(row_index, NOTES_COL, f"Skipped: No URL in row.")
            continue

        print(f"--- Analyzing Row {row_index}: {url} ---")

        improvement_notes = []
        final_note = ""
        processed_data = None
        
        # Check for existing raw text in column AF
        existing_raw_text = row_data.get('raw_text')

        if existing_raw_text:
            print("  [INFO] Raw text found. Reprocessing based on existing content.")
            try:
                # This function needs to be implemented in the dispatcher to only run analysis
                processed_data = dispatcher.reprocess_text(existing_raw_text, schema)
                if not processed_data:
                    final_note = f"Improvement failed: Could not reprocess existing text on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}."
            except AttributeError:
                final_note = f"Improvement failed: `dispatcher.reprocess_text` not implemented."
            except Exception as e:
                final_note = f"Improvement failed: Error during text reprocessing on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}."
        else:
            print("  [INFO] Raw text not found. Processing URL from scratch.")
            processed_data = dispatcher.dispatch_url(url, schema)
            if not processed_data:
                final_note = f"Improvement failed: Could not process URL on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}."

        if processed_data:
            # Compare and update fields
            compare_and_update(test_worksheet, row_index, header, row_data, processed_data, 'title', improvement_notes)
            compare_and_update(test_worksheet, row_index, header, row_data, processed_data, 'author', improvement_notes)
            compare_and_update(test_worksheet, row_index, header, row_data, processed_data, 'publication_date', improvement_notes)
            compare_and_update(test_worksheet, row_index, header, row_data, processed_data, 'summary', improvement_notes)
            
            # Compare and update list fields
            compare_and_update_list(test_worksheet, row_index, header, row_data, processed_data, 'thematic_categories', improvement_notes)
            compare_and_update_list(test_worksheet, row_index, header, row_data, processed_data, 'key_concepts', improvement_notes)
            compare_and_update_list(test_worksheet, row_index, header, row_data, processed_data, 'tags', improvement_notes)

            if improvement_notes:
                final_note = f"Improved on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}: {'; '.join(improvement_notes)}"
            else:
                final_note = f"No improvements needed as of {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}."
        
        # Update the final notes column (AH)
        try:
            test_worksheet.update_cell(row_index, NOTES_COL, final_note)
            print(f"  [SUCCESS] Finished processing row {row_index}. Notes: {final_note}")
        except Exception as e:
            print(f"  [FAIL] Could not update notes for row {row_index}. Error: {e}")

if __name__ == "__main__":
    main()
