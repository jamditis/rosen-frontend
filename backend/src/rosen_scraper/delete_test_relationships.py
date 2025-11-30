# -*- coding: utf-8 -*-
"""
Quick script to delete test relationship rows 6161-6170 from Google Sheets
"""

import gspread
from google.oauth2.service_account import Credentials
import os

# Configuration
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
SPREADSHEET_NAME = "📎Rosen Archive URL List"

def main():
    print("[DELETE] Connecting to Google Sheets...")
    creds = Credentials.from_service_account_file('google_credentials.json', scopes=SCOPES)
    client = gspread.authorize(creds)
    spreadsheet = client.open(SPREADSHEET_NAME)
    relationships_sheet = spreadsheet.worksheet('extracted_relationships')

    print("[DELETE] Connected successfully")

    # Rows 6161-6170 in the sheet = rows 6162-6171 in 1-indexed (header is row 1)
    # We need to delete 10 rows starting from row 6162

    print("[DELETE] Deleting rows 6162-6171 (test relationships)...")

    # Delete rows from bottom to top to avoid index shifting
    for row_num in range(6171, 6161, -1):
        relationships_sheet.delete_rows(row_num)
        print(f"[DELETE] Deleted row {row_num}")

    print("[DELETE] Successfully deleted 10 test relationship rows")
    print("[DELETE] Complete!")

if __name__ == "__main__":
    main()
