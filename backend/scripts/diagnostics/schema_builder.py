# -*- coding: utf-8 -*-
"""
This script builds a robust schema of known entities by analyzing the
'test_runs' tab in the Google Sheet.
"""

import gspread
import os
import json
import shutil
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load environment variables from a .env file for secure configuration management.
load_dotenv()

# Anchored to backend/ via the script's own location. A rebuild writes to a
# staging file by default so it cannot clobber the curated, hand-maintained
# known_entities.json; --write-canonical opts into overwriting it (after
# backing the current file up to known_entities.json.bak).
BACKEND_DIR = Path(__file__).resolve().parents[2]
KNOWN_ENTITIES_FILE = BACKEND_DIR / 'known_entities.json'
DISCOVERED_FILE = BACKEND_DIR / 'known_entities.discovered.json'

def main(write_canonical=False):
    """Rebuild the known-entities schema from the sheet.

    By default the result is written to the staging file (known_entities.discovered.json)
    for review. Pass write_canonical=True to overwrite the curated known_entities.json;
    the previous file is backed up to known_entities.json.bak first.
    """
    # --- 1. Connect to Google Sheets ---
    try:
        credentials_filename = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
        credentials_path = BACKEND_DIR / credentials_filename
        gc = gspread.service_account(filename=str(credentials_path))
        sh = gc.open(os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List"))
        processed_worksheet = sh.worksheet("test_runs")
    except Exception as e:
        print(f"Error connecting to Google Sheets: {e}")
        return

    # --- 2. Fetch Data ---
    all_values = processed_worksheet.get_all_values()
    if len(all_values) < 2:
        print("No data to process.")
        return
    
    header = all_values[0]
    data = all_values[1:301]

    # --- 3. Analyze Data and Build Schema ---
    publications = {}
    platforms = {}

    for row in data:
        row_data = dict(zip(header, row))
        
        url = row_data.get('url')
        if not url:
            continue

        domain = urlparse(url).netloc
        publisher = row_data.get('publisher')
        platform = row_data.get('platform')

        if publisher and publisher != 'Not Found':
            if publisher not in publications:
                publications[publisher] = {'aliases': []}
            if domain not in publications[publisher]['aliases']:
                publications[publisher]['aliases'].append(domain)

        if platform and platform != 'Not Found':
            if platform not in platforms:
                platforms[platform] = {'aliases': []}
            if domain not in platforms[platform]['aliases']:
                platforms[platform]['aliases'].append(domain)

    # --- 4. Create and Write Schema ---
    known_entities = {
        'publications': [{'correct_name': k, 'aliases': v['aliases']} for k, v in publications.items()],
        'platforms': [{'correct_name': k, 'aliases': v['aliases']} for k, v in platforms.items()]
    }

    if write_canonical:
        # Back up the curated file before overwriting, so a bad rebuild is recoverable.
        if KNOWN_ENTITIES_FILE.exists():
            backup = KNOWN_ENTITIES_FILE.with_name(KNOWN_ENTITIES_FILE.name + '.bak')
            shutil.copy2(KNOWN_ENTITIES_FILE, backup)
        target = KNOWN_ENTITIES_FILE
    else:
        target = DISCOVERED_FILE

    with open(target, 'w', encoding='utf-8') as f:
        json.dump(known_entities, f, indent=2)

    print(f"Successfully built the schema and wrote it to {target.name}.")
    if not write_canonical:
        print(
            "This is a staging file. Review it, then re-run with --write-canonical "
            "to update the curated known_entities.json (a .bak backup is kept)."
        )

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Rebuild the known-entities schema from the Google Sheet."
    )
    parser.add_argument(
        "--write-canonical",
        action="store_true",
        help="Overwrite the curated known_entities.json (a .bak backup is kept). "
             "The default writes to known_entities.discovered.json for review.",
    )
    args = parser.parse_args()
    main(write_canonical=args.write_canonical)
