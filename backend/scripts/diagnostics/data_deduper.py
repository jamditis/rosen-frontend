# -*- coding: utf-8 -*-
"""
This script performs two main functions:
1.  It cleans and deduplicates specified columns in the 'test_runs' Google Sheet.
2.  It updates the 'entities' sheet by finding all mentions of each entity
    within the 'test_runs' sheet and recording the corresponding record IDs.

This script operates without using any AI services and uses batch updates for efficiency.
"""

import argparse
import gspread
import os
import re
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

# This diagnostic script runs directly (poetry run python scripts/.../data_deduper.py),
# so put backend/src on the path before importing the shared Sheets client.
_SRC = Path(__file__).resolve().parents[2] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from rosen_scraper.sheets_client import get_gspread_client

# --- Configuration ---
COLUMNS_TO_DEDUPE = [
    'thematic_categories', 'key_concepts', 'tags',
    'mentioned_entities', 'mentioned_locations', 'mentioned_organizations'
]
COLUMNS_TO_SEARCH_FOR_MENTIONS = [
    'title', 'author', 'original_publication', 'summary', 'excerpt',
    'pull_quote', 'thematic_categories', 'key_concepts', 'tags'
]
BATCH_SIZE = 100
DELAY_BETWEEN_BATCHES = 5
# -------------------

def clean_and_dedupe_cell(cell_value):
    """Cleans, deduplicates, and standardizes a string from a cell."""
    if not isinstance(cell_value, str) or not cell_value.strip():
        return ""
    items = re.split(r'[,;]', cell_value)
    cleaned_items = [item.strip() for item in items if item.strip()]
    unique_items = sorted(list(set(cleaned_items)))
    return ", ".join(unique_items)

def update_entity_mentions(sh, test_runs_data, test_runs_header, dry_run=False):
    """Finds and updates entity mentions in the 'entities' sheet using batch updates.

    When ``dry_run`` is True the queued changes are counted and logged but no
    ``batch_update`` is sent. Returns the number of entity rows changed.
    """
    print("--- Starting Entity Mention Update Process"
          + (" (DRY RUN)" if dry_run else "") + " ---")
    try:
        entities_worksheet = sh.worksheet("entities")
        entities_data = entities_worksheet.get_all_values()
        if len(entities_data) < 2:
            print("  [INFO] No entities to process.")
            return 0
        entities_header = entities_data[0]
        entities_rows = entities_data[1:]
    except Exception as e:
        print(f"  [FATAL] Could not read 'entities' sheet. Error: {e}")
        return 0

    try:
        entity_name_col = entities_header.index('entity_name')
        entity_mentions_col = entities_header.index('entity_mentions')
        record_id_col = test_runs_header.index('id')
        search_col_indices = [test_runs_header.index(col) for col in COLUMNS_TO_SEARCH_FOR_MENTIONS]
    except ValueError as e:
        print(f"  [FATAL] A required column was not found in a sheet header: {e}")
        return 0

    entity_mentions_map = {row[entity_name_col]: set(re.split(r'[,;]\s*', row[entity_mentions_col])) if entity_mentions_col < len(row) and row[entity_mentions_col] else set() for row in entities_rows}

    for record in test_runs_data:
        record_id = record[record_id_col]
        if not record_id:
            continue
        for entity_name in entity_mentions_map.keys():
            for col_idx in search_col_indices:
                if col_idx < len(record) and entity_name in record[col_idx]:
                    entity_mentions_map[entity_name].add(record_id)
                    break

    batch_updates = []
    total_updates = 0
    for i, row in enumerate(entities_rows):
        entity_name = row[entity_name_col]
        sheet_row_index = i + 2
        new_mentions_set = entity_mentions_map.get(entity_name, set())
        new_mentions_list = sorted([item for item in new_mentions_set if item])
        new_mentions_str = ", ".join(new_mentions_list)
        original_mentions_str = row[entity_mentions_col] if entity_mentions_col < len(row) else ""

        if new_mentions_str != original_mentions_str:
            batch_updates.append({
                'range': gspread.utils.rowcol_to_a1(sheet_row_index, entity_mentions_col + 1),
                'values': [[new_mentions_str]]
            })
            print(f"  [QUEUED] Update for entity: '{entity_name}'")

            if len(batch_updates) >= BATCH_SIZE:
                if dry_run:
                    print(f"  [DRY-RUN] would send batch of {len(batch_updates)} updates to 'entities'")
                    total_updates += len(batch_updates)
                    batch_updates = []
                    continue
                try:
                    print(f"  [INFO] Sending batch of {len(batch_updates)} updates to 'entities' sheet...")
                    entities_worksheet.batch_update(batch_updates)
                    total_updates += len(batch_updates)
                    print(f"  [SUCCESS] Batch sent. Pausing for {DELAY_BETWEEN_BATCHES} seconds...")
                    batch_updates = []
                    time.sleep(DELAY_BETWEEN_BATCHES)
                except Exception as e:
                    print(f"  [FAIL] Batch update for 'entities' sheet failed. Error: {e}")
                    return total_updates

    if batch_updates:
        if dry_run:
            print(f"  [DRY-RUN] would send final batch of {len(batch_updates)} updates to 'entities'")
            total_updates += len(batch_updates)
        else:
            try:
                print(f"  [INFO] Sending final batch of {len(batch_updates)} updates to 'entities' sheet...")
                entities_worksheet.batch_update(batch_updates)
                total_updates += len(batch_updates)
                print("  [SUCCESS] Final batch complete.")
            except Exception as e:
                print(f"  [FAIL] Final batch update for 'entities' sheet failed. Error: {e}")

    label = "would update" if dry_run else "updated"
    print(f"--- Entity Mention Process Complete. Total entities {label}: {total_updates} ---")
    return total_updates

def run_deduplication(worksheet, data, header, dry_run=False):
    """Runs the deduplication process on the test_runs sheet using batch updates.

    When ``dry_run`` is True the queued changes are counted and logged but no
    ``batch_update`` is sent. Returns the number of cells changed (or that would
    have changed under a dry run).
    """
    print("--- Starting Data Deduplication and Cleaning Process"
          + (" (DRY RUN)" if dry_run else "") + " ---")
    try:
        col_indices_to_process = [header.index(col_name) for col_name in COLUMNS_TO_DEDUPE]
    except ValueError as e:
        print(f"  [FATAL] A specified column for deduplication was not found: {e}")
        return 0

    batch_updates = []
    total_updates = 0
    for i, row in enumerate(data):
        sheet_row_index = i + 2
        for col_index in col_indices_to_process:
            if col_index < len(row):
                original_value = row[col_index]
                cleaned_value = clean_and_dedupe_cell(original_value)
                if cleaned_value != original_value:
                    batch_updates.append({
                        'range': gspread.utils.rowcol_to_a1(sheet_row_index, col_index + 1),
                        'values': [[cleaned_value]]
                    })
                    print(f"  [QUEUED] Update for Row {sheet_row_index}, Column '{header[col_index]}'")

                    if len(batch_updates) >= BATCH_SIZE:
                        if dry_run:
                            print(f"  [DRY-RUN] would send batch of {len(batch_updates)} updates to 'test_runs'")
                            total_updates += len(batch_updates)
                            batch_updates = []
                            continue
                        try:
                            print(f"  [INFO] Sending batch of {len(batch_updates)} updates to 'test_runs' sheet...")
                            worksheet.batch_update(batch_updates)
                            total_updates += len(batch_updates)
                            print(f"  [SUCCESS] Batch sent. Pausing for {DELAY_BETWEEN_BATCHES} seconds...")
                            batch_updates = []
                            time.sleep(DELAY_BETWEEN_BATCHES)
                        except Exception as e:
                            print(f"  [FAIL] Batch update for 'test_runs' sheet failed. Error: {e}")
                            return total_updates

    if batch_updates:
        if dry_run:
            print(f"  [DRY-RUN] would send final batch of {len(batch_updates)} updates to 'test_runs'")
            total_updates += len(batch_updates)
        else:
            try:
                print(f"  [INFO] Sending final batch of {len(batch_updates)} updates to 'test_runs' sheet...")
                worksheet.batch_update(batch_updates)
                total_updates += len(batch_updates)
                print("  [SUCCESS] Final batch complete.")
            except Exception as e:
                print(f"  [FAIL] Final batch update for 'test_runs' sheet failed. Error: {e}")

    label = "would update" if dry_run else "updated"
    print(f"--- Deduplication Process Complete. Total cells {label}: {total_updates} ---")
    return total_updates

def _parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Normalize multi-value columns and recompute entity mentions "
                    "on the master sheet (deterministic, no AI)."
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Rehearse only: count and log the cells that would change, write nothing'
    )
    parser.add_argument(
        '--limit', type=int, default=0,
        help='Cap how many test_runs rows the dedup pass touches (0 = all). The '
             'entity-mention recompute always uses every row so valid mentions '
             'are never dropped.'
    )
    return parser.parse_args(argv)


def main(argv=None):
    """The main function to run the script. Returns a process exit code."""
    args = _parse_args(argv)
    try:
        load_dotenv()
        credentials_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json"))
        gc = get_gspread_client(credentials_path)
        sh = gc.open(os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List"))
        test_runs_worksheet = sh.worksheet("test_runs")
        print("  [INFO] Successfully connected to Google Sheet.")
    except Exception as e:
        print(f"  [FATAL] Error connecting to Google Sheets: {e}")
        return 1

    test_runs_values = test_runs_worksheet.get_all_values()
    if len(test_runs_values) < 2:
        print("  [INFO] No data in 'test_runs' to process.")
        return 0
    test_runs_header = test_runs_values[0]
    test_runs_data = test_runs_values[1:]

    dedup_data = test_runs_data
    if args.limit and args.limit > 0 and len(test_runs_data) > args.limit:
        dedup_data = test_runs_data[:args.limit]
        print(f"  [INFO] --limit {args.limit}: deduplicating the first {args.limit} "
              f"of {len(test_runs_data)} data rows.")

    dedup_writes = run_deduplication(
        test_runs_worksheet, dedup_data, test_runs_header, dry_run=args.dry_run)
    mention_writes = update_entity_mentions(
        sh, test_runs_data, test_runs_header, dry_run=args.dry_run)

    verb = "would change" if args.dry_run else "changed"
    print(f"  [SUMMARY] {verb} {dedup_writes} test_runs cell(s) + "
          f"{mention_writes} entity row(s).")
    # Deterministic job: zero changes means the sheet is already clean, which is
    # a valid success -- unlike the AI jobs, there is no "spent money, wrote
    # nothing" failure mode to guard against here.
    return 0


if __name__ == "__main__":
    sys.exit(main())
