# -*- coding: utf-8 -*-
"""
Run Smart Data Corrector on first 25 rows with full processing and updates
"""

import sys
from pathlib import Path
from datetime import datetime

# Add project root to path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / 'diagnostics'))
sys.path.insert(0, str(project_root / 'src'))

from diagnostics.smart_corrector import (
    ContentDetector,
    QualityValidator,
    AudioOptimizer,
    CostTracker,
    SmartCorrectorPDFGenerator
)
from diagnostics.smart_corrector.processors import (
    SoundCloudProcessor,
    CSpanProcessor,
    YouTubeEnhancedProcessor,
    TwitterProcessor
)

import gspread
from google.oauth2.service_account import Credentials
import os
from categorizer import summarize_and_classify
import json

# Load schema
with open('schema.json', 'r', encoding='utf-8-sig') as f:
    SCHEMA = json.load(f)

def get_sheet():
    """Connect to Google Sheets."""
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]

    creds_path = project_root / 'google_credentials.json'
    creds = Credentials.from_service_account_file(str(creds_path), scopes=scopes)
    client = gspread.authorize(creds)

    sheet_name = os.getenv('SPREADSHEET_NAME', '📎Rosen Archive URL List')
    spreadsheet = client.open(sheet_name)
    worksheet = spreadsheet.worksheet('test_runs')

    return worksheet

def process_with_smart_corrector(limit=25, dry_run=False):
    """
    Process rows with Smart Data Corrector.

    Args:
        limit: Number of rows to process
        dry_run: If True, analyze but don't update sheet
    """
    print("=" * 80)
    print(f"SMART DATA CORRECTOR - Processing First {limit} Rows")
    print("=" * 80)
    print(f"Mode: {'DRY RUN (no changes)' if dry_run else 'LIVE (will update sheet)'}")
    print()

    # Initialize components
    detector = ContentDetector()
    validator = QualityValidator()
    cost_tracker = CostTracker(max_budget=50.0)

    # Initialize processors
    audio_optimizer = AudioOptimizer(speed_factor=2.0)
    soundcloud = SoundCloudProcessor(audio_optimizer=audio_optimizer)
    cspan = CSpanProcessor()
    youtube = YouTubeEnhancedProcessor()
    twitter = TwitterProcessor(playwright_fallback=True)

    # Initialize PDF generator
    SmartCorrectorPDFGenerator(output_dir="smart_corrector_pdfs_25")

    # Connect to sheet
    print("[1/4] Connecting to Google Sheets...")
    worksheet = get_sheet()
    print("      Connected!")

    # Get headers to find column indices
    headers = worksheet.row_values(1)
    col_aj_idx = headers.index('notes') + 1  # Column AJ (1-indexed)
    col_ah_idx = headers.index('raw_text') + 1  # Column AH

    print(f"      Notes column (AJ): Index {col_aj_idx}")
    print(f"      Raw text column (AH): Index {col_ah_idx}")

    # Get all records
    print(f"\n[2/4] Fetching first {limit} rows...")
    all_records = worksheet.get_all_records()
    records = all_records[:limit]
    print(f"      Retrieved {len(records)} records")

    # Process each row
    print("\n[3/4] Processing rows...")
    print("-" * 80)

    stats = {
        'processed': 0,
        'cached': 0,
        'reprocessed': 0,
        'youtube_free': 0,
        'soundcloud': 0,
        'errors': 0,
        'total_cost': 0.0
    }

    for i, record in enumerate(records, 1):
        row_num = i + 1  # +1 for header row

        url = record.get('url', '')
        existing_raw_text = record.get('raw_text', '')

        if not url:
            print(f"\n[{i:2d}/{limit}] Row {row_num}: SKIP - No URL")
            continue

        print(f"\n[{i:2d}/{limit}] Row {row_num}: {url[:60]}...")

        # Detect content type
        content_type = detector.detect(url)
        print(f"           Content Type: {content_type}")

        # Validate existing quality
        if existing_raw_text:
            is_valid, quality_score, issues = validator.validate(existing_raw_text, url, content_type)
            print(f"           Existing Quality: {quality_score:.2f}")
        else:
            is_valid = False
            quality_score = 0.0
            issues = ['No raw_text found']
            print("           Existing Quality: MISSING")

        # Determine processing strategy
        needs_reprocess = not is_valid or quality_score < 0.7

        if not needs_reprocess:
            # Use cached content - just re-analyze with AI
            print("           Strategy: USE CACHE (quality good)")

            note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Smart Corrector: Used cached text (Q:{quality_score:.2f})"

            # Re-analyze with AI to update metadata
            if not dry_run:
                try:
                    analysis = summarize_and_classify(existing_raw_text, SCHEMA)

                    if analysis:
                        # Update row with improved analysis
                        updates = []
                        if analysis.get('summary'):
                            updates.append(f"summary={analysis['summary'][:50]}...")

                        note += " | Updated AI analysis"
                        print("           [OK] Re-analyzed with AI")

                except Exception as e:
                    note += f" | AI error: {str(e)[:50]}"
                    print(f"           [WARN] AI analysis failed: {e}")

            stats['cached'] += 1
            cost = 0.006

        else:
            # Need to reprocess from source
            print("           Strategy: REPROCESS from source")
            print(f"           Issues: {', '.join(issues[:2])}")

            result = None

            try:
                # Route to appropriate processor
                if content_type == 'audio' and 'soundcloud' in url.lower():
                    print("           Processor: SoundCloud")
                    result = soundcloud.process(url)
                    stats['soundcloud'] += 1

                elif content_type == 'video':
                    if 'youtube' in url.lower() or 'youtu.be' in url.lower():
                        print("           Processor: YouTube (FREE captions)")
                        result = youtube.process(url)
                        stats['youtube_free'] += 1
                    elif 'c-span' in url.lower():
                        print("           Processor: C-SPAN")
                        result = cspan.process(url)

                elif content_type == 'social':
                    if 'twitter.com' in url.lower() or 'x.com' in url.lower():
                        print("           Processor: Twitter")
                        result = twitter.process(url)

                if result and result.get('status') == 'success':
                    new_raw_text = result.get('raw_text', '')

                    if new_raw_text:
                        print(f"           [OK] Extracted {len(new_raw_text)} chars")

                        # Update sheet
                        if not dry_run:
                            worksheet.update_cell(row_num, col_ah_idx, new_raw_text)
                            print("           [UPDATED] Column AH (raw_text)")

                        note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Smart Corrector: Reprocessed via {result.get('source')} | {len(new_raw_text)} chars"

                        # Re-analyze with AI
                        if not dry_run:
                            try:
                                analysis = summarize_and_classify(new_raw_text, SCHEMA)
                                note += " | AI analyzed"
                            except Exception as e:
                                note += f" | AI error: {str(e)[:30]}"

                        stats['reprocessed'] += 1
                        cost = cost_tracker.estimate_cost(content_type, speed_optimization=True)
                    else:
                        note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Smart Corrector: Processing returned no content"
                        print("           [WARN] No content extracted")
                        stats['errors'] += 1
                        cost = 0.0

                else:
                    error_msg = result.get('error', 'Unknown error') if result else 'Processor not available'
                    note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Smart Corrector: Failed - {error_msg[:50]}"
                    print(f"           [ERROR] {error_msg[:60]}")
                    stats['errors'] += 1
                    cost = 0.0

            except Exception as e:
                note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Smart Corrector: Exception - {str(e)[:50]}"
                print(f"           [ERROR] Exception: {e}")
                stats['errors'] += 1
                cost = 0.0

        # Update notes column (AJ)
        if not dry_run:
            try:
                worksheet.update_cell(row_num, col_aj_idx, note)
                print("           [UPDATED] Column AJ (notes)")
            except Exception as e:
                print(f"           [WARN] Could not update notes: {e}")
        else:
            print(f"           Note: {note[:80]}...")

        # Track cost
        stats['total_cost'] += cost
        if cost > 0:
            cost_tracker.record_cost('gemini_flash', cost, operation=f"Process row {row_num}")
        print(f"           Cost: ${cost:.4f} | Total: ${stats['total_cost']:.2f}")

        stats['processed'] += 1

    # Summary
    print("\n" + "=" * 80)
    print("[4/4] PROCESSING SUMMARY")
    print("=" * 80)
    print(f"\nProcessed: {stats['processed']} rows")
    print(f"  - Used cache: {stats['cached']}")
    print(f"  - Reprocessed: {stats['reprocessed']}")
    print(f"    - YouTube (free captions): {stats['youtube_free']}")
    print(f"    - SoundCloud: {stats['soundcloud']}")
    print(f"  - Errors: {stats['errors']}")
    print(f"\nTotal Cost: ${stats['total_cost']:.2f}")
    print(f"Budget Remaining: ${cost_tracker.max_budget - stats['total_cost']:.2f}")

    if dry_run:
        print("\n[DRY RUN] No changes were made to the sheet.")
        print("To actually process, run: python run_smart_corrector_25.py --live")
    else:
        print("\n[COMPLETE] All updates written to Google Sheets!")
        print("Check column AJ for processing notes on each row.")

    return stats


if __name__ == "__main__":
    # Check for --live flag
    dry_run = '--live' not in sys.argv

    # Check for custom limit
    limit = 25
    for arg in sys.argv:
        if arg.startswith('--limit='):
            limit = int(arg.split('=')[1])

    try:
        stats = process_with_smart_corrector(limit=limit, dry_run=dry_run)
    except Exception as e:
        print(f"\n[ERROR] Processing failed: {e}")
        import traceback
        traceback.print_exc()
