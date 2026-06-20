"""
Quick verification script to check extracted_entities and extracted_relationships tabs
"""

import gspread
from google.oauth2.service_account import Credentials
import json
import os
from pathlib import Path

# Set up credentials, anchored to backend/ so the script runs from any cwd; an
# absolute GOOGLE_APPLICATION_CREDENTIALS overrides (pathlib resets to it).
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
credentials_filename = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
credentials_path = Path(__file__).resolve().parents[1] / credentials_filename
creds = Credentials.from_service_account_file(str(credentials_path), scopes=SCOPES)
client = gspread.authorize(creds)

# Open the spreadsheet
SPREADSHEET_NAME = "📎Rosen Archive URL List"
spreadsheet = client.open(SPREADSHEET_NAME)

print("=" * 80)
print("ENTITY & RELATIONSHIP EXTRACTION VERIFICATION")
print("=" * 80)

# Check extracted_entities tab
print("\n[ENTITIES TAB]")
try:
    entities_sheet = spreadsheet.worksheet("extracted_entities")
    entities_data = entities_sheet.get_all_values()

    print("[OK] Sheet found: extracted_entities")
    print(f"  Total rows: {len(entities_data)}")
    print(f"  Data rows (excl. header): {len(entities_data) - 1}")

    if len(entities_data) > 1:
        headers = entities_data[0]
        print(f"  Columns: {', '.join(headers)}")

        # Sample first 5 data rows
        print("\n  Sample data (first 5 entities):")
        for i, row in enumerate(entities_data[1:6], 1):
            entity_id = row[0] if len(row) > 0 else "N/A"
            entity_name = row[1] if len(row) > 1 else "N/A"
            entity_type = row[2] if len(row) > 2 else "N/A"
            print(f"    {i}. {entity_id} | {entity_name} | {entity_type}")

        # Check for unique entity IDs
        entity_ids = [row[0] for row in entities_data[1:] if len(row) > 0]
        unique_ids = set(entity_ids)
        print(f"\n  Total entity IDs: {len(entity_ids)}")
        print(f"  Unique entity IDs: {len(unique_ids)}")
        if len(entity_ids) == len(unique_ids):
            print("  [OK] All entity IDs are unique (no duplicates)")
        else:
            print(f"  [WARNING] Found {len(entity_ids) - len(unique_ids)} duplicate entity IDs")

        # Count by entity type
        entity_types = {}
        for row in entities_data[1:]:
            if len(row) > 2:
                etype = row[2]
                entity_types[etype] = entity_types.get(etype, 0) + 1

        print("\n  Entities by type:")
        for etype, count in sorted(entity_types.items(), key=lambda x: x[1], reverse=True):
            print(f"    {etype}: {count}")

except gspread.exceptions.WorksheetNotFound:
    print("[ERROR] Sheet not found: extracted_entities")

# Check extracted_relationships tab
print("\n[RELATIONSHIPS TAB]")
try:
    rels_sheet = spreadsheet.worksheet("extracted_relationships")
    rels_data = rels_sheet.get_all_values()

    print("[OK] Sheet found: extracted_relationships")
    print(f"  Total rows: {len(rels_data)}")
    print(f"  Data rows (excl. header): {len(rels_data) - 1}")

    if len(rels_data) > 1:
        headers = rels_data[0]
        print(f"  Columns: {', '.join(headers)}")

        # Sample first 5 data rows
        print("\n  Sample data (first 5 relationships):")
        for i, row in enumerate(rels_data[1:6], 1):
            source = row[0] if len(row) > 0 else "N/A"
            rel_type = row[1] if len(row) > 1 else "N/A"
            target = row[2] if len(row) > 2 else "N/A"
            record = row[3] if len(row) > 3 else "N/A"
            print(f"    {i}. {source} -> [{rel_type}] -> {target} (in {record})")

        # Count by relationship type
        rel_types = {}
        for row in rels_data[1:]:
            if len(row) > 1:
                rtype = row[1]
                rel_types[rtype] = rel_types.get(rtype, 0) + 1

        print("\n  Relationships by type:")
        for rtype, count in sorted(rel_types.items(), key=lambda x: x[1], reverse=True):
            print(f"    {rtype}: {count}")

except gspread.exceptions.WorksheetNotFound:
    print("[ERROR] Sheet not found: extracted_relationships")

# Load progress file for comparison
print("\n[PROGRESS FILE COMPARISON]")
try:
    with open('logs/entity_extraction_progress.json', 'r') as f:
        progress = json.load(f)

    print("[OK] Progress file found")
    print(f"  Records processed: {progress['total_processed']}")
    print(f"  Entities extracted: {progress['entities_extracted']}")
    print(f"  Relationships extracted: {progress['relationships_extracted']}")
    print(f"  Errors: {progress['errors']}")

    # Compare with sheet data
    if len(entities_data) > 1:
        sheet_entities = len(entities_data) - 1
        progress_entities = progress['entities_extracted']
        if sheet_entities == progress_entities:
            print(f"\n  [OK] Entity count matches: {sheet_entities} rows in sheet = {progress_entities} in progress")
        else:
            print(f"\n  [WARNING] Entity count mismatch: {sheet_entities} rows in sheet vs {progress_entities} in progress")

    if len(rels_data) > 1:
        sheet_rels = len(rels_data) - 1
        progress_rels = progress['relationships_extracted']
        if sheet_rels == progress_rels:
            print(f"  [OK] Relationship count matches: {sheet_rels} rows in sheet = {progress_rels} in progress")
        else:
            print(f"  [WARNING] Relationship count mismatch: {sheet_rels} rows in sheet vs {progress_rels} in progress")

except FileNotFoundError:
    print("[ERROR] Progress file not found")

print("\n" + "=" * 80)
print("VERIFICATION COMPLETE")
print("=" * 80)
