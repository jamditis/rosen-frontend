# -*- coding: utf-8 -*-
"""
This script reviews the results of a test run and evaluates the outputs.
"""

import gspread
import os
import json
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load environment variables from a .env file for secure configuration management.
load_dotenv()

# Anchored to backend/ via the script's own location, so the curated
# known_entities.json and credentials resolve regardless of the working directory.
ROOT_DIR = Path(__file__).resolve().parents[2]
KNOWN_ENTITIES_FILE = ROOT_DIR / 'known_entities.json'

def main():
    """The main function for the review script."""
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
        print("No data to review.")
        return
    
    header = all_values[0]
    data = all_values[1:]

    # --- 3. Load Known Entities ---
    try:
        with open(KNOWN_ENTITIES_FILE, 'r', encoding='utf-8-sig') as f:
            known_entities = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Could not load known entities. Error: {e}")
        return

    # --- 4. Evaluate Data ---
    for i, row in enumerate(data):
        row_data = dict(zip(header, row))
        url = row_data.get('url')
        if not url:
            continue

        print(f"--- Reviewing Row {i+2}: {url} ---")
        
        domain = urlparse(url).netloc
        publisher = row_data.get('publisher')
        platform = row_data.get('platform')

        # Evaluate Publisher
        expected_publisher = None
        for entity in known_entities.get('publications', []):
            if domain in entity.get('aliases', []):
                expected_publisher = entity.get('correct_name')
                break
        
        if expected_publisher:
            if publisher == expected_publisher:
                print(f"  [PASS] Publisher: Correctly identified as '{publisher}'")
            else:
                print(f"  [FAIL] Publisher: Expected '{expected_publisher}', but got '{publisher}'")
        else:
            print(f"  [INFO] Publisher: No known publisher for domain '{domain}'. Found '{publisher}'")

        # Evaluate Platform
        expected_platform = None
        for entity in known_entities.get('platforms', []):
            if domain in entity.get('aliases', []):
                expected_platform = entity.get('correct_name')
                break
        
        if expected_platform:
            if platform == expected_platform:
                print(f"  [PASS] Platform: Correctly identified as '{platform}'")
            else:
                print(f"  [FAIL] Platform: Expected '{expected_platform}', but got '{platform}'")
        else:
            print(f"  [INFO] Platform: No known platform for domain '{domain}'. Found '{platform}'")


if __name__ == "__main__":
    main()
