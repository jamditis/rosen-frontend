# -*- coding: utf-8 -*-
"""
This script builds a robust schema of known entities by analyzing the
'test_runs' tab in the Google Sheet.
"""

import gspread
import os
import json
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load environment variables from a .env file for secure configuration management.
load_dotenv()

def main():
    """The main function for the schema builder."""
    # --- 1. Connect to Google Sheets ---
    try:
        credentials_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json"))
        gc = gspread.service_account(filename=credentials_path)
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

    with open('known_entities.json', 'w', encoding='utf-8') as f:
        json.dump(known_entities, f, indent=2)

    print("Successfully built and saved the known_entities.json schema.")

if __name__ == "__main__":
    main()
