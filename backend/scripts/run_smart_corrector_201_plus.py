# -*- coding: utf-8 -*-
"""
Run Smart Data Corrector starting from row 201+ with FIXED AI writing
"""

import sys
from pathlib import Path

# Add --start-row argument
start_row = 201  # Default
limit = 50  # Process 50 rows at a time

for arg in sys.argv:
    if arg.startswith('--start-row='):
        start_row = int(arg.split('=')[1])
    if arg.startswith('--limit='):
        limit = int(arg.split('=')[1])

# Import the fixed run_smart_corrector_200.py and modify it
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

# We'll just modify the records slice in the imported function
import run_smart_corrector_200 as corrector_module

# Monkey-patch to process starting from specific row
original_process = corrector_module.process_with_smart_corrector

def process_from_offset(limit_param=50, batch_size=25, resume=True):
    """Modified version that starts from offset."""
    print(f"MODIFIED: Starting from row {start_row}, processing {limit_param} rows")

    # Import everything we need
    from datetime import datetime
    import time
    import json
    import gspread
    from google.oauth2.service_account import Credentials
    import os
    from tools.diagnostics.smart_corrector import (
        ContentDetector,
        QualityValidator,
        AudioOptimizer,
        CostTracker
    )
    from tools.diagnostics.smart_corrector.processors import (
        SoundCloudProcessor,
        CSpanProcessor,
        YouTubeEnhancedProcessor,
        TwitterProcessor
    )
    from categorizer import summarize_and_classify

    # Load schema
    with open('schema.json', 'r', encoding='utf-8-sig') as f:
        SCHEMA = json.load(f)

    print("=" * 80)
    print(f"SMART DATA CORRECTOR - Rows {start_row} to {start_row + limit_param - 1}")
    print("=" * 80)
    print(f"[FIXED VERSION] - AI analysis WILL be written to sheet")
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

    # Connect to sheet
    print("[1/4] Connecting to Google Sheets...")
    scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
    creds = Credentials.from_service_account_file('google_credentials.json', scopes=scopes)
    client = gspread.authorize(creds)

    sheet_name = os.getenv('SPREADSHEET_NAME', '📎Rosen Archive URL List')
    worksheet = client.open(sheet_name).worksheet('test_runs')
    print("      Connected!")

    # Get headers to find column indices
    headers = worksheet.row_values(1)
    col_aj_idx = headers.index('notes') + 1
    col_ah_idx = headers.index('raw_text') + 1

    # AI analysis column indices - CRITICAL FOR FIX
    col_summary_idx = headers.index('summary') + 1
    col_categories_idx = headers.index('thematic_categories') + 1
    col_concepts_idx = headers.index('key_concepts') + 1
    col_tags_idx = headers.index('tags') + 1
    col_pullquote_idx = headers.index('pull_quote') + 1

    print(f"      Column indices: notes={col_aj_idx}, raw_text={col_ah_idx}")
    print(f"      AI fields: summary={col_summary_idx}, categories={col_categories_idx}, concepts={col_concepts_idx}")

    # Get records starting from offset
    print(f"\n[2/4] Fetching rows {start_row} to {start_row + limit_param - 1}...")
    all_records = worksheet.get_all_records()

    # Calculate indices (row 2 = index 0, so row 201 = index 199)
    start_idx = start_row - 2
    end_idx = start_idx + limit_param
    records = all_records[start_idx:end_idx]

    print(f"      Retrieved {len(records)} records (indices {start_idx} to {end_idx})")

    # Stats
    stats = {
        'processed': 0,
        'cached': 0,
        'reprocessed': 0,
        'youtube_free': 0,
        'soundcloud': 0,
        'errors': 0,
        'total_cost': 0.0,
        'ai_fields_written': 0,
        'edge_cases': {
            'no_captions': 0,
            'cell_limit': 0,
            'missing_content': 0
        }
    }

    # Process
    print(f"\n[3/4] Processing...")
    print("-" * 80)

    for i, record in enumerate(records):
        row_num = start_row + i  # Actual sheet row number

        url = record.get('url', '')
        existing_raw_text = record.get('raw_text', '')

        if not url:
            print(f"\n[{i+1:2d}/{len(records)}] Row {row_num}: SKIP - No URL")
            continue

        print(f"\n[{i+1:2d}/{len(records)}] Row {row_num}: {url[:60]}...")

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
            print(f"           Existing Quality: MISSING")

        needs_reprocess = not is_valid or quality_score < 0.7

        if not needs_reprocess:
            # Use cached - AI re-analyze WITH WRITING
            print(f"           Strategy: USE CACHE (quality good)")
            note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Smart Corrector: Used cached text (Q:{quality_score:.2f})"

            try:
                analysis = summarize_and_classify(existing_raw_text, SCHEMA)

                if analysis:
                    # WRITE AI RESULTS TO SHEET
                    updates_made = []

                    if analysis.get('summary'):
                        worksheet.update_cell(row_num, col_summary_idx, analysis['summary'])
                        updates_made.append('summary')

                    if analysis.get('thematic_categories'):
                        cats = ', '.join(analysis['thematic_categories']) if isinstance(analysis['thematic_categories'], list) else analysis['thematic_categories']
                        worksheet.update_cell(row_num, col_categories_idx, cats)
                        updates_made.append('categories')

                    if analysis.get('key_concepts'):
                        concepts = ', '.join(analysis['key_concepts']) if isinstance(analysis['key_concepts'], list) else analysis['key_concepts']
                        worksheet.update_cell(row_num, col_concepts_idx, concepts)
                        updates_made.append('concepts')

                    if analysis.get('tags'):
                        tags = ', '.join(analysis['tags']) if isinstance(analysis['tags'], list) else analysis['tags']
                        worksheet.update_cell(row_num, col_tags_idx, tags)
                        updates_made.append('tags')

                    if analysis.get('pull_quote'):
                        worksheet.update_cell(row_num, col_pullquote_idx, analysis['pull_quote'])
                        updates_made.append('pull_quote')

                    stats['ai_fields_written'] += len(updates_made)
                    note += f" | [WROTE] {', '.join(updates_made)}"
                    print(f"           [OK FIXED] Wrote {len(updates_made)} AI fields to sheet")

            except Exception as e:
                note += f" | AI error: {str(e)[:50]}"
                print(f"           [ERROR] AI failed: {e}")

            stats['cached'] += 1
            cost = 0.006

        else:
            print(f"           Strategy: REPROCESS from source")
            note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Smart Corrector: Needs reprocessing"
            stats['errors'] += 1
            cost = 0.0

        # Update notes
        worksheet.update_cell(row_num, col_aj_idx, note)

        stats['total_cost'] += cost
        stats['processed'] += 1

        print(f"           Cost: ${cost:.4f} | Total: ${stats['total_cost']:.2f}")
        time.sleep(1)

    # Summary
    print("\n" + "=" * 80)
    print("[4/4] PROCESSING SUMMARY")
    print("=" * 80)
    print(f"\nProcessed: {stats['processed']} rows")
    print(f"  - Used cache: {stats['cached']}")
    print(f"  - Reprocessed: {stats['reprocessed']}")
    print(f"  - Errors: {stats['errors']}")
    print(f"\n[OK] AI FIELDS WRITTEN: {stats['ai_fields_written']} total field updates")
    print(f"\nTotal Cost: ${stats['total_cost']:.2f}")
    print(f"Budget Remaining: ${50.0 - stats['total_cost']:.2f}")
    print("\n[COMPLETE] Updates written to Google Sheets!")

    return stats

if __name__ == "__main__":
    try:
        stats = process_from_offset(limit_param=limit, batch_size=25, resume=False)
    except Exception as e:
        print(f"\n[ERROR] Processing failed: {e}")
        import traceback
        traceback.print_exc()
