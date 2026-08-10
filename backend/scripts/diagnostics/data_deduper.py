# -*- coding: utf-8 -*-
"""
This script cleans and deduplicates configured multi-value columns in the
current archive-records Google Sheet tab.

It can also run the legacy entity-mention recomputation for workbooks that
still have compatible ``entities`` and ``entity_mentions`` schemas. That pass
is opt-in because the live workbook uses separate ``extracted_entities`` and
``extracted_relationships`` tabs.

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
from rosen_scraper.path_utils import find_project_root

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
DEFAULT_MASTER_SHEET_TAB = "archive_records"
# -------------------

def clean_and_dedupe_cell(cell_value):
    """Cleans, deduplicates, and standardizes a string from a cell."""
    if not isinstance(cell_value, str) or not cell_value.strip():
        return ""
    items = re.split(r'[,;]', cell_value)
    cleaned_items = [item.strip() for item in items if item.strip()]
    unique_items = sorted(list(set(cleaned_items)))
    return ", ".join(unique_items)

def update_entity_mentions(sh, master_data, master_header, dry_run=False):
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
        raise

    try:
        entity_name_col = entities_header.index('entity_name')
        entity_mentions_col = entities_header.index('entity_mentions')
        record_id_col = master_header.index('id')
        search_col_indices = [master_header.index(col) for col in COLUMNS_TO_SEARCH_FOR_MENTIONS]
    except ValueError as e:
        print(f"  [FATAL] A required column was not found in a sheet header: {e}")
        raise

    entity_mentions_map = {row[entity_name_col]: set(re.split(r'[,;]\s*', row[entity_mentions_col])) if entity_mentions_col < len(row) and row[entity_mentions_col] else set() for row in entities_rows}

    for record in master_data:
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
                    raise

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
                raise

    label = "would update" if dry_run else "updated"
    print(f"--- Entity Mention Process Complete. Total entities {label}: {total_updates} ---")
    return total_updates

def run_deduplication(
        worksheet, data, header, dry_run=False,
        sheet_tab=DEFAULT_MASTER_SHEET_TAB):
    """Runs the deduplication process on the selected sheet using batch updates.

    When ``dry_run`` is True the queued changes are counted and logged but no
    ``batch_update`` is sent. Returns the number of cells changed (or that would
    have changed under a dry run).
    """
    print("--- Starting Data Deduplication and Cleaning Process"
          + (" (DRY RUN)" if dry_run else "") + " ---")
    columns_to_process = [
        col_name for col_name in COLUMNS_TO_DEDUPE if col_name in header]
    if not columns_to_process:
        configured_columns = ", ".join(COLUMNS_TO_DEDUPE)
        raise ValueError(
            f"Sheet tab '{sheet_tab}' has none of the configured deduplication "
            f"columns: {configured_columns}")

    col_indices_to_process = [
        header.index(col_name) for col_name in columns_to_process]
    missing_columns = [
        col_name for col_name in COLUMNS_TO_DEDUPE if col_name not in header]
    if missing_columns:
        print(
            "  [INFO] Skipping deduplication columns absent from "
            f"'{sheet_tab}': {', '.join(missing_columns)}")

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
                            print(f"  [DRY-RUN] would send batch of {len(batch_updates)} updates to '{sheet_tab}'")
                            total_updates += len(batch_updates)
                            batch_updates = []
                            continue
                        try:
                            print(f"  [INFO] Sending batch of {len(batch_updates)} updates to '{sheet_tab}' sheet...")
                            worksheet.batch_update(batch_updates)
                            total_updates += len(batch_updates)
                            print(f"  [SUCCESS] Batch sent. Pausing for {DELAY_BETWEEN_BATCHES} seconds...")
                            batch_updates = []
                            time.sleep(DELAY_BETWEEN_BATCHES)
                        except Exception as e:
                            print(f"  [FAIL] Batch update for '{sheet_tab}' sheet failed. Error: {e}")
                            raise

    if batch_updates:
        if dry_run:
            print(f"  [DRY-RUN] would send final batch of {len(batch_updates)} updates to '{sheet_tab}'")
            total_updates += len(batch_updates)
        else:
            try:
                print(f"  [INFO] Sending final batch of {len(batch_updates)} updates to '{sheet_tab}' sheet...")
                worksheet.batch_update(batch_updates)
                total_updates += len(batch_updates)
                print("  [SUCCESS] Final batch complete.")
            except Exception as e:
                print(f"  [FAIL] Final batch update for '{sheet_tab}' sheet failed. Error: {e}")
                raise

    label = "would update" if dry_run else "updated"
    print(f"--- Deduplication Process Complete. Total cells {label}: {total_updates} ---")
    return total_updates

def _parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Normalize multi-value columns on the master sheet "
                    "(deterministic, no AI)."
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Rehearse only: count and log the cells that would change, write nothing'
    )
    parser.add_argument(
        '--limit', type=int, default=0,
        help='Cap how many master-sheet rows the dedup pass touches (0 = all). '
             'When enabled, the legacy entity-mention recompute always uses '
             'every row so valid mentions are never dropped.'
    )
    parser.add_argument(
        '--recompute-legacy-entity-mentions', action='store_true',
        help='Also recompute the legacy entities.entity_mentions field. Enable '
             'only for a workbook with compatible entities and master-sheet '
             'schemas.'
    )
    return parser.parse_args(argv)


def main(argv=None):
    """The main function to run the script. Returns a process exit code."""
    args = _parse_args(argv)
    try:
        load_dotenv()
        credentials_filename = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
        credentials_path = str(find_project_root() / credentials_filename)
        gc = get_gspread_client(credentials_path)
        sh = gc.open(os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List"))
        master_sheet_tab = (
            os.environ.get("ROSEN_MASTER_SHEET_TAB")
            or DEFAULT_MASTER_SHEET_TAB
        ).strip()
        if not master_sheet_tab:
            raise ValueError("ROSEN_MASTER_SHEET_TAB must not be empty")
        master_worksheet = sh.worksheet(master_sheet_tab)
        print(f"  [INFO] Successfully connected to Google Sheet tab '{master_sheet_tab}'.")
    except Exception as e:
        print(f"  [FATAL] Error connecting to Google Sheets: {e}")
        return 1

    master_values = master_worksheet.get_all_values()
    if len(master_values) < 2:
        print(f"  [INFO] No data in '{master_sheet_tab}' to process.")
        return 0
    master_header = master_values[0]
    master_data = master_values[1:]

    dedup_data = master_data
    if args.limit and args.limit > 0 and len(master_data) > args.limit:
        dedup_data = master_data[:args.limit]
        print(f"  [INFO] --limit {args.limit}: deduplicating the first {args.limit} "
              f"of {len(master_data)} data rows.")

    try:
        dedup_writes = run_deduplication(
            master_worksheet, dedup_data, master_header,
            dry_run=args.dry_run, sheet_tab=master_sheet_tab)
    except Exception as e:
        print(f"  [FATAL] {e}")
        return 1

    mention_writes = 0
    if args.recompute_legacy_entity_mentions:
        print("  [INFO] Legacy entity-mention recomputation explicitly enabled.")
        try:
            mention_writes = update_entity_mentions(
                sh, master_data, master_header, dry_run=args.dry_run)
        except Exception as e:
            print(f"  [FATAL] Legacy entity-mention recomputation failed: {e}")
            return 1
    else:
        print(
            "  [INFO] Skipping legacy entity-mention recomputation. Use "
            "--recompute-legacy-entity-mentions only with a compatible workbook.")

    verb = "would change" if args.dry_run else "changed"
    print(f"  [SUMMARY] {verb} {dedup_writes} '{master_sheet_tab}' cell(s) + "
          f"{mention_writes} legacy entity row(s).")
    # Deterministic job: zero changes means the sheet is already clean, which is
    # a valid success -- unlike the AI jobs, there is no "spent money, wrote
    # nothing" failure mode to guard against here.
    return 0


if __name__ == "__main__":
    sys.exit(main())
