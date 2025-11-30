# -*- coding: utf-8 -*-
"""
This script regenerates PDFs for a specified range of rows in the 'test_runs' sheet.
"""

import gspread
import os
from dotenv import load_dotenv
import pdf_generator

# --- Configuration ---
START_ROW = 2  # The row to start processing from (2 is the first data row)
END_ROW = 101  # The row to end processing at (inclusive)
# -------------------

def main():
    """Main function to regenerate PDFs."""
    print("--- Starting PDF Regeneration Process ---")
    load_dotenv()

    # --- 1. Connect to Google Sheets ---
    try:
        credentials_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json"))
        gc = gspread.service_account(filename=credentials_path)
        sh = gc.open(os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List"))
        worksheet = sh.worksheet("test_runs")
        print("  [INFO] Successfully connected to Google Sheet.")
    except Exception as e:
        print(f"  [FATAL] Error connecting to Google Sheets: {e}")
        return

    # --- 2. Fetch Data --- 
    all_data = worksheet.get_all_values()
    if len(all_data) < 2:
        print("  [INFO] No data to process.")
        return
    header = all_data[0]
    rows_to_process = all_data[START_ROW - 1:END_ROW]

    # --- 3. Process Each Row --- 
    for i, row in enumerate(rows_to_process):
        sheet_row_index = START_ROW + i
        row_data = dict(zip(header, row))

        if not row_data.get('title') or not row_data.get('raw_text'):
            print(f"  [SKIP] Row {sheet_row_index}: Missing title or raw_text.")
            continue

        print(f"--- Processing Row {sheet_row_index}: {row_data.get('title')} ---")

        pdf_filepath = pdf_generator.create_article_pdf(row_data)
        if not pdf_filepath:
            print(f"  [FAIL] Could not create PDF for row {sheet_row_index}.")
            continue

    print("--- PDF Regeneration Process Complete ---")

if __name__ == "__main__":
    main()
