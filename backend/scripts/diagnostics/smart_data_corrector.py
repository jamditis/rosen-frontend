# -*- coding: utf-8 -*-
"""
Smart Data Corrector
Intelligent data correction and enrichment for the Rosen Archive.

Uses existing raw_text when quality is good, or reprocesses multimedia content
with advanced cost optimizations (2x audio speed, smart caching).
"""

import os
import sys
from pathlib import Path
from typing import Dict, List, Optional
import gspread
from dotenv import load_dotenv

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

# Import smart corrector modules
from smart_corrector import (
    ContentDetector,
    QualityValidator,
    AudioOptimizer,
    CostTracker
)

# Import existing project modules
from src import dispatcher

# Load environment
load_dotenv()


class SmartDataCorrector:
    """Main class for intelligent data correction."""

    def __init__(
        self,
        max_budget: float = 35.00,
        speed_optimization: bool = True,
        dry_run: bool = False
    ):
        """
        Initialize the Smart Data Corrector.

        Args:
            max_budget: Maximum spending limit (USD)
            speed_optimization: Enable 2x audio speed optimization
            dry_run: If True, preview changes without writing to sheet
        """
        self.max_budget = max_budget
        self.speed_optimization = speed_optimization
        self.dry_run = dry_run

        # Initialize modules
        self.content_detector = ContentDetector()
        self.quality_validator = QualityValidator()
        self.audio_optimizer = AudioOptimizer() if speed_optimization else None
        self.cost_tracker = CostTracker(max_budget, speed_optimization)

        # Google Sheets connection
        self.gc = None
        self.spreadsheet = None
        self.worksheet = None

        # Processing stats
        self.stats = {
            'total_rows': 0,
            'processed': 0,
            'skipped': 0,
            'cached_used': 0,
            'reprocessed': 0,
            'failed': 0,
            'by_content_type': {
                'article': 0,
                'audio': 0,
                'video': 0,
                'social': 0
            }
        }

        print(f"\n{'='*60}")
        print("SMART DATA CORRECTOR")
        print(f"{'='*60}")
        print(f"Max Budget:          ${max_budget:.2f}")
        print(f"Speed Optimization:  {'Enabled (2x audio)' if speed_optimization else 'Disabled'}")
        print(f"Mode:                {'DRY RUN (preview only)' if dry_run else 'LIVE'}")
        print(f"{'='*60}\n")

    def connect_to_sheets(self):
        """Connect to Google Sheets."""
        try:
            credentials_filename = os.environ.get(
                "GOOGLE_APPLICATION_CREDENTIALS",
                "google_credentials.json"
            )
            credentials_path = ROOT_DIR / credentials_filename

            print("[CONNECT] Connecting to Google Sheets...")
            self.gc = gspread.service_account(filename=str(credentials_path))
            self.spreadsheet = self.gc.open(
                os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List")
            )
            self.worksheet = self.spreadsheet.worksheet("test_runs")
            print("[CONNECT] ✓ Successfully connected\n")
            return True

        except Exception as e:
            print(f"[ERROR] Failed to connect to Google Sheets: {e}")
            return False

    def load_rows(self, limit: Optional[int] = None) -> List[Dict]:
        """Load rows from Google Sheets."""
        print("[LOAD] Fetching data from Google Sheets...")

        all_values = self.worksheet.get_all_values()
        if len(all_values) < 2:
            print("[LOAD] No data found")
            return []

        headers = all_values[0]
        rows = all_values[1:]

        # Convert to list of dicts
        data = []
        for i, row in enumerate(rows):
            row_data = dict(zip(headers, row))
            row_data['_row_index'] = i + 2  # 1-based + header row
            data.append(row_data)

        # Apply limit if specified
        if limit:
            data = data[:limit]

        self.stats['total_rows'] = len(data)
        print(f"[LOAD] ✓ Loaded {len(data)} rows\n")

        return data

    def process_row(self, row_data: Dict, schema: Dict) -> Dict:
        """
        Process a single row.

        Args:
            row_data: Row data dict
            schema: Processing schema

        Returns:
            Dict with processing result
        """
        url = row_data.get('url', '')
        raw_text = row_data.get('raw_text', '')
        row_index = row_data['_row_index']

        print(f"\n[ROW {row_index}] Processing: {url[:70]}...")

        # Step 1: Detect content type
        content_type = self.content_detector.detect(url)
        self.stats['by_content_type'][content_type] += 1
        print(f"  Content Type: {content_type}")

        # Step 2: Validate existing raw_text quality
        is_valid, quality_score, issues = self.quality_validator.validate(
            raw_text, url, content_type
        )

        quality_label = self.quality_validator.get_quality_label(quality_score)
        print(f"  Quality Score: {quality_score:.2f} ({quality_label})")

        if issues:
            print(f"  Issues: {', '.join(issues)}")

        # Step 3: Decide whether to use cached or reprocess
        if is_valid and quality_score >= 0.7:
            # Use cached raw_text
            print(f"  ✓ Using cached raw_text (quality: {quality_score:.2f})")
            self.stats['cached_used'] += 1

            # Estimate cost (just AI analysis)
            estimated_cost = self.cost_tracker.estimate_cost(
                content_type,
                text_length=len(raw_text)
            )

            # Check budget
            if not self.cost_tracker.can_afford(estimated_cost):
                print("  ⛔ Budget limit reached. Stopping.")
                return {'status': 'budget_exceeded'}

            # Reprocess cached text through AI (cheap)
            result = dispatcher.reprocess_text(raw_text, schema)

            # Record cost
            self.cost_tracker.record_cost(
                'gemini_flash',
                estimated_cost,
                f'AI analysis (cached text) - Row {row_index}'
            )

            return {
                'status': 'success',
                'source': 'cached',
                'data': result,
                'cost': estimated_cost
            }

        else:
            # Need to reprocess from source
            print(f"  ⟳ Reprocessing from source (quality: {quality_score:.2f})")
            self.stats['reprocessed'] += 1

            # Estimate cost
            duration = None
            if content_type in ['audio', 'video']:
                # Try to get duration from existing data
                length_seconds = row_data.get('length_in_seconds', '')
                if length_seconds:
                    try:
                        duration = float(length_seconds) / 60.0  # Convert to minutes
                    except Exception:
                        duration = 30  # Default 30 minutes

            estimated_cost = self.cost_tracker.estimate_cost(
                content_type,
                duration=duration
            )

            print(f"  Estimated cost: ${estimated_cost:.4f}")

            # Check budget
            if not self.cost_tracker.can_afford(estimated_cost):
                print("  ⛔ Budget limit reached. Stopping.")
                return {'status': 'budget_exceeded'}

            # Process from source
            try:
                result = dispatcher.dispatch_url(url, schema)

                if result:
                    # Record actual cost
                    self.cost_tracker.record_cost(
                        'gemini_flash',
                        estimated_cost,
                        f'{content_type} reprocessing - Row {row_index}'
                    )

                    return {
                        'status': 'success',
                        'source': 'reprocessed',
                        'data': result,
                        'cost': estimated_cost
                    }
                else:
                    self.stats['failed'] += 1
                    return {'status': 'failed', 'error': 'Processing returned no data'}

            except Exception as e:
                self.stats['failed'] += 1
                print(f"  ✗ Processing failed: {e}")
                return {'status': 'failed', 'error': str(e)}

    def update_sheet_row(self, row_index: int, data: Dict, headers: List[str]):
        """Update a row in Google Sheets."""
        if self.dry_run:
            print(f"  [DRY RUN] Would update row {row_index}")
            return

        try:
            # Map data to sheet columns and update
            updates = []

            field_mapping = {
                'title': 'title',
                'author': 'author',
                'publication_date': 'publication_date',
                'summary': 'summary',
                'thematic_categories': 'thematic_categories',
                'key_concepts': 'key_concepts',
                'era': 'era',
                'scope': 'scope',
                'tags': 'tags',
                'pull_quote': 'pull_quote',
                'raw_text': 'raw_text'
            }

            for sheet_field, data_field in field_mapping.items():
                if data_field in data and sheet_field in headers:
                    col_index = headers.index(sheet_field) + 1  # 1-based
                    value = data[data_field]

                    # Convert lists to comma-separated strings
                    if isinstance(value, list):
                        value = ', '.join(str(v) for v in value)

                    updates.append({
                        'range': f'{gspread.utils.rowcol_to_a1(row_index, col_index)}',
                        'values': [[str(value)]]
                    })

            # Batch update
            if updates:
                self.worksheet.batch_update(updates)
                print(f"  ✓ Updated {len(updates)} fields")

        except Exception as e:
            print(f"  ✗ Failed to update row: {e}")

    def process_batch(
        self,
        rows: List[Dict],
        schema: Dict,
        batch_size: int = 25
    ):
        """Process rows in batches."""
        headers = self.worksheet.row_values(1) if not self.dry_run else []

        for i in range(0, len(rows), batch_size):
            batch = rows[i:i+batch_size]
            batch_num = (i // batch_size) + 1
            total_batches = (len(rows) + batch_size - 1) // batch_size

            print(f"\n{'='*60}")
            print(f"BATCH {batch_num}/{total_batches}")
            print(f"{'='*60}")

            for row_data in batch:
                result = self.process_row(row_data, schema)

                if result['status'] == 'success':
                    self.stats['processed'] += 1

                    # Update sheet
                    if not self.dry_run:
                        self.update_sheet_row(
                            row_data['_row_index'],
                            result['data'],
                            headers
                        )

                elif result['status'] == 'budget_exceeded':
                    print(f"\n⛔ Budget limit reached. Stopping at row {row_data['_row_index']}")
                    return False  # Stop processing

                else:
                    self.stats['skipped'] += 1

            # Print batch summary
            print(f"\n[BATCH {batch_num}] Summary:")
            print(f"  Processed: {self.stats['processed']}/{self.stats['total_rows']}")
            self.cost_tracker.print_summary()

        return True  # Completed successfully

    def run(self, limit: Optional[int] = None, batch_size: int = 25):
        """
        Run the smart data corrector.

        Args:
            limit: Limit number of rows to process (None = all)
            batch_size: Number of rows per batch
        """
        # Connect to sheets
        if not self.connect_to_sheets():
            return

        # Load rows
        rows = self.load_rows(limit)
        if not rows:
            print("[ERROR] No rows to process")
            return

        # Load schema
        schema_path = ROOT_DIR / 'schema.json'
        import json
        with open(schema_path, 'r', encoding='utf-8-sig') as f:
            schema = json.load(f)

        # Process batches
        completed = self.process_batch(rows, schema, batch_size)

        # Final summary
        print(f"\n\n{'='*60}")
        print("FINAL SUMMARY")
        print(f"{'='*60}")
        print(f"Total Rows:     {self.stats['total_rows']}")
        print(f"Processed:      {self.stats['processed']}")
        print(f"  Cached:       {self.stats['cached_used']}")
        print(f"  Reprocessed:  {self.stats['reprocessed']}")
        print(f"Failed:         {self.stats['failed']}")
        print(f"Skipped:        {self.stats['skipped']}")
        print("\nBy Content Type:")
        for ctype, count in self.stats['by_content_type'].items():
            print(f"  {ctype:10s}  {count}")

        self.cost_tracker.print_summary()

        if completed:
            print("✓ Processing completed successfully!\n")
        else:
            print("⚠ Processing stopped (budget limit reached)\n")


def main():
    """Main entry point with CLI arguments."""
    import argparse

    parser = argparse.ArgumentParser(
        description='Smart Data Corrector for Rosen Archive'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help='Limit number of rows to process (default: all)'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=25,
        help='Rows per batch (default: 25)'
    )
    parser.add_argument(
        '--max-cost',
        type=float,
        default=35.00,
        help='Maximum budget in USD (default: 35.00)'
    )
    parser.add_argument(
        '--no-speed-optimization',
        action='store_true',
        help='Disable 2x audio speed optimization'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without writing to sheet'
    )

    args = parser.parse_args()

    # Create and run corrector
    corrector = SmartDataCorrector(
        max_budget=args.max_cost,
        speed_optimization=not args.no_speed_optimization,
        dry_run=args.dry_run
    )

    corrector.run(limit=args.limit, batch_size=args.batch_size)


if __name__ == "__main__":
    main()
