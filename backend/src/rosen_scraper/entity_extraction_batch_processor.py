# -*- coding: utf-8 -*-
"""
Entity Extraction Batch Processor

This script reads article text from the "test_runs" sheet (column AH: raw_text),
extracts entities and relationships using AI, and writes the results to the
"extracted_entities" and "extracted_relationships" tabs.

The processor includes:
- Progress tracking with resume capability
- Rate limiting to respect API quotas
- Batch processing for Google Sheets API efficiency
- Comprehensive error handling and logging
"""

import os
import json
import time
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set

import gspread
from dotenv import load_dotenv

from rosen_scraper import entity_extractor
from rosen_scraper.entity_registry import EntityRegistry
from rosen_scraper.path_utils import find_project_root

# Load environment variables
load_dotenv()

# Configuration
BASE_DIR = find_project_root()
PROGRESS_FILE = Path("logs/entity_extraction_progress.json")
DEFAULT_BATCH_SIZE = 50
RATE_LIMIT_DELAY = 6  # seconds between extractions (10 per minute)
BATCH_DELAY = 30  # seconds between batches


class EntityExtractionProcessor:
    """
    Batch processor for extracting entities and relationships from archived content.
    """

    def __init__(self, spreadsheet_name: Optional[str] = None, test_mode: bool = False):
        """
        Initialize the processor.

        Args:
            spreadsheet_name: Name of the Google Sheet (from env if not provided)
            test_mode: If True, process only first 5 records
        """
        self.spreadsheet_name = spreadsheet_name or os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List")
        self.test_mode = test_mode
        self.schema = entity_extractor.load_entity_schema()

        # Entity Registry for deduplication
        self.entity_registry = EntityRegistry()

        # Progress tracking
        self.progress = self._load_progress()

        # Google Sheets connection
        self.gc = None
        self.spreadsheet = None
        self.test_runs_sheet = None
        self.entities_sheet = None
        self.relationships_sheet = None

    def _load_progress(self) -> Dict:
        """Load progress from JSON file."""
        if PROGRESS_FILE.exists():
            try:
                with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"[PROGRESS] Warning: Could not load progress file: {e}")
                return self._init_progress()
        return self._init_progress()

    def _init_progress(self) -> Dict:
        """Initialize a new progress tracking structure."""
        return {
            "last_processed_row": 1,  # Start from row 2 (row 1 is headers)
            "total_processed": 0,
            "entities_extracted": 0,
            "relationships_extracted": 0,
            "errors": 0,
            "last_run": None,
            "processed_record_ids": []
        }

    def _save_progress(self):
        """Save progress to JSON file."""
        try:
            PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.progress, f, indent=2)
            print(f"[PROGRESS] Progress saved: {self.progress['total_processed']} records processed")
        except Exception as e:
            print(f"[PROGRESS] Warning: Could not save progress: {e}")

    def connect_to_sheets(self):
        """Establish connection to Google Sheets."""
        try:
            credentials_path = BASE_DIR / "google_credentials.json"

            print("[SHEETS] Connecting to Google Sheets...")
            print(f"[SHEETS] Using credentials: {credentials_path}")

            self.gc = gspread.service_account(filename=str(credentials_path))
            self.spreadsheet = self.gc.open(self.spreadsheet_name)

            # Open or create worksheets
            self.test_runs_sheet = self.spreadsheet.worksheet("test_runs")
            self.entities_sheet = self._get_or_create_sheet("extracted_entities")
            self.relationships_sheet = self._get_or_create_sheet("extracted_relationships")

            # Load existing entities into registry for deduplication
            self._load_entity_registry()

            # Safe print for success message
            try:
                print(f"[SHEETS] Successfully connected to '{self.spreadsheet_name}'")
            except UnicodeEncodeError:
                print("[SHEETS] Successfully connected to spreadsheet")
            return True

        except Exception as e:
            # Safe error printing
            error_msg = str(e)
            try:
                print(f"[SHEETS] ERROR: Failed to connect to Google Sheets: {error_msg}")
            except UnicodeEncodeError:
                error_msg_safe = error_msg.encode('ascii', 'ignore').decode('ascii')
                print(f"[SHEETS] ERROR: Failed to connect to Google Sheets: {error_msg_safe}")
            return False

    def _get_or_create_sheet(self, sheet_name: str):
        """Get existing sheet or create new one with headers."""
        try:
            return self.spreadsheet.worksheet(sheet_name)
        except gspread.WorksheetNotFound:
            print(f"[SHEETS] Creating new sheet: {sheet_name}")

            if sheet_name == "extracted_entities":
                headers = self.schema.get("output_format", {}).get("entities_sheet_columns", [
                    "entity_id", "entity_type", "entity_name", "normalized_name",
                    "role_or_description", "affiliation", "prominence_score",
                    "first_mention_record_id", "total_mentions", "related_entities", "notes"
                ])
            elif sheet_name == "extracted_relationships":
                headers = self.schema.get("output_format", {}).get("relationships_sheet_columns", [
                    "relationship_id", "source_record_id", "source_entity_id", "source_entity_name",
                    "relationship_type", "target_entity_id", "target_entity_name",
                    "context_snippet", "confidence_score", "extracted_date"
                ])
            else:
                headers = []

            # Create new sheet
            worksheet = self.spreadsheet.add_worksheet(title=sheet_name, rows=1000, cols=len(headers))

            # Add headers
            if headers:
                worksheet.append_row(headers)

            return worksheet

    def _load_entity_registry(self):
        """Load existing entities from the sheet into the registry."""
        try:
            print("[REGISTRY] Loading existing entities into registry...")
            all_values = self.entities_sheet.get_all_values()

            if len(all_values) < 2:
                print("[REGISTRY] No existing entities found (empty sheet)")
                return

            headers = all_values[0]
            entities_data = all_values[1:]  # Skip header row

            # Load into registry
            self.entity_registry.load_from_sheet(entities_data, headers)

            # Print stats
            stats = self.entity_registry.get_stats()
            print(f"[REGISTRY] Loaded {stats['total_entities']} entities")
            print(f"[REGISTRY] Entity counts by type: {stats['by_type']}")

        except Exception as e:
            print(f"[REGISTRY] Warning: Could not load entity registry: {e}")
            print("[REGISTRY] Will start with empty registry")

    def get_existing_entity_ids(self) -> Set[str]:
        """Get set of entity IDs that already exist in the extracted_entities sheet."""
        try:
            entity_ids = self.entities_sheet.col_values(1)[1:]  # Skip header
            return set(entity_ids)
        except Exception as e:
            print(f"[SHEETS] Warning: Could not load existing entity IDs: {e}")
            return set()

    def fetch_records_to_process(self, batch_size: int) -> List[Dict]:
        """
        Fetch records from test_runs sheet that need entity extraction.

        Args:
            batch_size: Number of records to fetch

        Returns:
            list: List of record dictionaries with id, raw_text, and row_number
        """
        try:
            # Get all values from test_runs
            all_values = self.test_runs_sheet.get_all_values()

            if len(all_values) < 2:
                print("[FETCH] No records found in test_runs sheet")
                return []

            headers = all_values[0]

            # Find column indices
            try:
                id_col = headers.index("id")
                raw_text_col = headers.index("raw_text")  # Column AH (index 33)
            except ValueError as e:
                print(f"[FETCH] ERROR: Required column not found: {e}")
                print(f"[FETCH] Available columns: {headers}")
                return []

            # Get starting row
            start_row = self.progress["last_processed_row"] + 1

            # Limit for test mode
            if self.test_mode:
                batch_size = min(5, batch_size)

            records = []
            processed_ids = set(self.progress["processed_record_ids"])

            for row_idx in range(start_row, min(start_row + batch_size, len(all_values))):
                row = all_values[row_idx]

                # Get record ID and raw text
                record_id = row[id_col] if id_col < len(row) else ""
                raw_text = row[raw_text_col] if raw_text_col < len(row) else ""

                # Skip if no ID or text, or already processed
                if not record_id or not raw_text or record_id in processed_ids:
                    continue

                # Skip if text is too short (likely not meaningful)
                if len(raw_text.strip()) < 100:
                    print(f"[FETCH] Skipping {record_id}: text too short ({len(raw_text)} chars)")
                    continue

                records.append({
                    "record_id": record_id,
                    "raw_text": raw_text,
                    "row_number": row_idx + 1  # 1-indexed for sheets
                })

            print(f"[FETCH] Fetched {len(records)} records to process (starting from row {start_row})")
            return records

        except Exception as e:
            print(f"[FETCH] ERROR: Failed to fetch records: {e}")
            return []

    def process_record(self, record: Dict, existing_entity_ids: Set[str]) -> Optional[Dict]:
        """
        Process a single record through entity extraction.

        Args:
            record: Record dictionary with record_id and raw_text
            existing_entity_ids: Set of existing entity IDs

        Returns:
            dict: Extraction result or None if failed
        """
        record_id = record["record_id"]
        raw_text = record["raw_text"]

        print(f"\n[PROCESS] Processing {record_id}...")

        # Extract entities and relationships
        result = entity_extractor.extract_entities_and_relationships(
            text_content=raw_text,
            record_id=record_id,
            schema=self.schema
        )

        if not result:
            print(f"[PROCESS] Failed to extract entities from {record_id}")
            return None

        # Use entity registry to reassign IDs and prevent duplicates
        updated_entities, id_mapping, existing_count, new_count = self.entity_registry.reassign_entity_ids(
            result["entities"]
        )

        # Update relationships with canonical entity IDs
        updated_relationships = self.entity_registry.update_relationship_ids(
            result["relationships"],
            id_mapping
        )

        print(f"[REGISTRY] Entity deduplication: {existing_count} existing, {new_count} new")

        # Format for sheets
        entity_lookup = {e["entity_id"]: e["entity_name"] for e in updated_entities}

        # Only create rows for NEW entities (not already in sheet)
        new_entities_only = [e for e in updated_entities if e["entity_id"] not in existing_entity_ids]

        entity_rows = entity_extractor.format_entities_for_sheet(
            new_entities_only,
            record_id,
            existing_entity_ids
        )

        relationship_rows = entity_extractor.format_relationships_for_sheet(
            updated_relationships,
            record_id,
            entity_lookup
        )

        print(f"[PROCESS] Entities: {len(updated_entities)} total, {len(new_entities_only)} new rows to write")
        print(f"[PROCESS] Relationships: {len(updated_relationships)} to write")

        return {
            "record_id": record_id,
            "entity_rows": entity_rows,
            "relationship_rows": relationship_rows,
            "entities_count": len(entity_rows),
            "relationships_count": len(relationship_rows),
            "total_entities": len(updated_entities)
        }

    def write_results_to_sheets(self, results: List[Dict]):
        """
        Write extraction results to Google Sheets.

        Args:
            results: List of extraction results from process_record
        """
        if not results:
            print("[WRITE] No results to write")
            return

        # Collect all rows
        all_entity_rows = []
        all_relationship_rows = []

        for result in results:
            all_entity_rows.extend(result["entity_rows"])
            all_relationship_rows.extend(result["relationship_rows"])

        # Write entities in batches
        if all_entity_rows:
            try:
                print(f"[WRITE] Writing {len(all_entity_rows)} entity rows...")
                for i in range(0, len(all_entity_rows), 100):
                    batch = all_entity_rows[i:i+100]
                    self.entities_sheet.append_rows(batch)
                    time.sleep(2)  # Rate limit
                print(f"[WRITE] Successfully wrote {len(all_entity_rows)} entities")
            except Exception as e:
                print(f"[WRITE] ERROR: Failed to write entities: {e}")

        # Write relationships in batches
        if all_relationship_rows:
            try:
                print(f"[WRITE] Writing {len(all_relationship_rows)} relationship rows...")
                for i in range(0, len(all_relationship_rows), 100):
                    batch = all_relationship_rows[i:i+100]
                    self.relationships_sheet.append_rows(batch)
                    time.sleep(2)  # Rate limit
                print(f"[WRITE] Successfully wrote {len(all_relationship_rows)} relationships")
            except Exception as e:
                print(f"[WRITE] ERROR: Failed to write relationships: {e}")

    def run(self, batch_size: int = DEFAULT_BATCH_SIZE, limit: Optional[int] = None):
        """
        Run the batch extraction process.

        Args:
            batch_size: Number of records to process per batch
            limit: Maximum total records to process (None = all)
        """
        print("\n" + "="*80)
        print("ENTITY EXTRACTION BATCH PROCESSOR")
        print("="*80)
        # Handle emoji in spreadsheet name for Windows console
        try:
            print(f"Spreadsheet: {self.spreadsheet_name}")
        except UnicodeEncodeError:
            safe_name = self.spreadsheet_name.encode('ascii', 'ignore').decode('ascii')
            print(f"Spreadsheet: {safe_name}")
        print(f"Batch size: {batch_size}")
        print(f"Test mode: {self.test_mode}")
        print(f"Starting from row: {self.progress['last_processed_row'] + 1}")
        print("="*80 + "\n")

        # Connect to Google Sheets
        if not self.connect_to_sheets():
            print("[ERROR] Could not connect to Google Sheets. Exiting.")
            return

        # Get existing entity IDs
        existing_entity_ids = self.get_existing_entity_ids()
        print(f"[INFO] Found {len(existing_entity_ids)} existing entities in sheet\n")

        total_processed = 0
        session_start = datetime.now()

        while True:
            # Check limit
            if limit and total_processed >= limit:
                print(f"[INFO] Reached processing limit of {limit} records")
                break

            # Fetch next batch
            records = self.fetch_records_to_process(batch_size)

            if not records:
                print("[INFO] No more records to process")
                break

            # Process each record
            batch_results = []

            for idx, record in enumerate(records):
                try:
                    # Process record
                    result = self.process_record(record, existing_entity_ids)

                    if result:
                        batch_results.append(result)

                        # Update tracking
                        self.progress["total_processed"] += 1
                        self.progress["entities_extracted"] += result["entities_count"]
                        self.progress["relationships_extracted"] += result["relationships_count"]
                        self.progress["last_processed_row"] = record["row_number"]
                        self.progress["processed_record_ids"].append(record["record_id"])

                        # Update existing entity IDs
                        for row in result["entity_rows"]:
                            existing_entity_ids.add(row[0])  # entity_id is first column

                        total_processed += 1

                    else:
                        self.progress["errors"] += 1

                    # Save progress periodically
                    if (idx + 1) % 5 == 0:
                        self._save_progress()

                    # Rate limiting
                    if idx < len(records) - 1:  # Don't delay after last record
                        print(f"[RATE] Waiting {RATE_LIMIT_DELAY}s before next extraction...")
                        time.sleep(RATE_LIMIT_DELAY)

                except Exception as e:
                    print(f"[ERROR] Failed to process {record['record_id']}: {e}")
                    self.progress["errors"] += 1
                    continue

            # Write batch results to sheets
            if batch_results:
                self.write_results_to_sheets(batch_results)

            # Save progress after batch
            self.progress["last_run"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self._save_progress()

            # Check if we should continue
            if self.test_mode or (limit and total_processed >= limit):
                break

            # Delay between batches
            print(f"\n[BATCH] Batch complete. Waiting {BATCH_DELAY}s before next batch...")
            time.sleep(BATCH_DELAY)

        # Final summary
        session_end = datetime.now()
        duration = (session_end - session_start).total_seconds() / 60

        print("\n" + "="*80)
        print("PROCESSING COMPLETE")
        print("="*80)
        print(f"Duration: {duration:.1f} minutes")
        print(f"Records processed: {self.progress['total_processed']}")
        print(f"Entities extracted: {self.progress['entities_extracted']}")
        print(f"Relationships extracted: {self.progress['relationships_extracted']}")
        print(f"Errors: {self.progress['errors']}")
        print(f"Last processed row: {self.progress['last_processed_row']}")
        print("="*80 + "\n")


def main():
    """Main entry point for the batch processor."""
    parser = argparse.ArgumentParser(
        description="Extract entities and relationships from Jay Rosen's Internet Archive"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Number of records to process per batch (default: {DEFAULT_BATCH_SIZE})"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of records to process (default: all)"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Test mode: process only first 5 records"
    )
    parser.add_argument(
        "--reset-progress",
        action="store_true",
        help="Reset progress and start from beginning"
    )
    parser.add_argument(
        "--spreadsheet",
        type=str,
        default=None,
        help="Google Sheet name (default: from environment)"
    )

    args = parser.parse_args()

    # Reset progress if requested
    if args.reset_progress:
        if PROGRESS_FILE.exists():
            PROGRESS_FILE.unlink()
            print("[INFO] Progress reset successfully\n")

    # Initialize processor
    processor = EntityExtractionProcessor(
        spreadsheet_name=args.spreadsheet,
        test_mode=args.test
    )

    # Run extraction
    processor.run(batch_size=args.batch_size, limit=args.limit)


if __name__ == "__main__":
    main()
