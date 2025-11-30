# -*- coding: utf-8 -*-
"""
Run Smart Data Corrector on first 200 rows with batched processing
"""

import sys
from pathlib import Path
from datetime import datetime
import time
import json

# Add project root to path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / 'tools' / 'diagnostics'))
sys.path.insert(0, str(project_root / 'src'))

from tools.diagnostics.smart_corrector import (
    ContentDetector,
    QualityValidator,
    AudioOptimizer,
    CostTracker,
    SmartCorrectorPDFGenerator
)
from tools.diagnostics.smart_corrector.processors import (
    SoundCloudProcessor,
    CSpanProcessor,
    YouTubeEnhancedProcessor,
    TwitterProcessor
)

import gspread
from google.oauth2.service_account import Credentials
import os
from categorizer import summarize_and_classify

# Load schema
with open('schema.json', 'r', encoding='utf-8-sig') as f:
    SCHEMA = json.load(f)

# Progress file
PROGRESS_FILE = project_root / 'logs' / 'smart_corrector_200_progress.json'

def load_progress():
    """Load processing progress."""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {'last_processed_row': 0, 'stats': {}}

def save_progress(row_num, stats):
    """Save processing progress."""
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, 'w') as f:
        json.dump({
            'last_processed_row': row_num,
            'stats': stats,
            'timestamp': datetime.now().isoformat()
        }, f, indent=2)

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

def process_with_smart_corrector(limit=200, batch_size=25, resume=True):
    """
    Process rows with Smart Data Corrector in batches.

    Args:
        limit: Number of rows to process (default 200)
        batch_size: Rows per batch (default 25)
        resume: Resume from last progress (default True)
    """
    print("=" * 80)
    print(f"SMART DATA CORRECTOR - Processing First {limit} Rows")
    print("=" * 80)
    print(f"Batch size: {batch_size} rows")
    print(f"Resume mode: {'ON' if resume else 'OFF'}")
    print()

    # Load progress if resuming
    progress = load_progress() if resume else {'last_processed_row': 0, 'stats': {}}
    start_row = progress['last_processed_row']

    if start_row > 0:
        print(f"[RESUME] Continuing from row {start_row + 1}")
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
    worksheet = get_sheet()
    print("      Connected!")

    # Get headers to find column indices
    headers = worksheet.row_values(1)
    col_aj_idx = headers.index('notes') + 1  # Column AJ (1-indexed)
    col_ah_idx = headers.index('raw_text') + 1  # Column AH

    # AI analysis column indices
    col_summary_idx = headers.index('summary') + 1
    col_categories_idx = headers.index('thematic_categories') + 1
    col_concepts_idx = headers.index('key_concepts') + 1
    col_tags_idx = headers.index('tags') + 1
    col_pullquote_idx = headers.index('pull_quote') + 1

    print(f"      Notes column (AJ): Index {col_aj_idx}")
    print(f"      Raw text column (AH): Index {col_ah_idx}")
    print(f"      AI analysis columns: summary={col_summary_idx}, categories={col_categories_idx}, concepts={col_concepts_idx}")

    # Get all records
    print(f"\n[2/4] Fetching first {limit} rows...")
    all_records = worksheet.get_all_records()
    records = all_records[:limit]
    print(f"      Retrieved {len(records)} records")

    # Initialize stats with defaults
    default_stats = {
        'processed': 0,
        'cached': 0,
        'reprocessed': 0,
        'youtube_free': 0,
        'soundcloud': 0,
        'errors': 0,
        'total_cost': 0.0,
        'edge_cases': {
            'no_captions': 0,
            'excessive_repetition': 0,
            'cell_limit': 0,
            'missing_content': 0
        }
    }

    # Merge with loaded progress stats
    stats = {**default_stats, **progress.get('stats', {})}

    # Ensure edge_cases sub-dict has all keys
    if 'edge_cases' not in stats or not isinstance(stats['edge_cases'], dict):
        stats['edge_cases'] = default_stats['edge_cases']
    else:
        stats['edge_cases'] = {**default_stats['edge_cases'], **stats['edge_cases']}

    # Process each row in batches
    print(f"\n[3/4] Processing rows {start_row + 1} to {limit}...")
    print("-" * 80)

    batch_num = (start_row // batch_size) + 1
    total_batches = (limit + batch_size - 1) // batch_size

    for i in range(start_row, len(records)):
        row_num = i + 2  # +2 for header row and 0-indexing
        record = records[i]

        url = record.get('url', '')
        existing_raw_text = record.get('raw_text', '')

        if not url:
            print(f"\n[{i+1:3d}/{limit}] Row {row_num}: SKIP - No URL")
            continue

        # Batch tracking
        current_batch = (i // batch_size) + 1
        if current_batch != batch_num:
            batch_num = current_batch
            print(f"\n{'='*80}")
            print(f"BATCH {batch_num}/{total_batches} (Rows {i+1}-{min(i+batch_size, limit)})")
            print(f"Cost so far: ${stats['total_cost']:.2f} | Budget remaining: ${cost_tracker.max_budget - stats['total_cost']:.2f}")
            print(f"{'='*80}\n")
            # Pause between batches to avoid rate limits
            if i > start_row:
                time.sleep(3)

        print(f"\n[{i+1:3d}/{limit}] Row {row_num}: {url[:60]}...")

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

        # Determine processing strategy
        needs_reprocess = not is_valid or quality_score < 0.7

        if not needs_reprocess:
            # Use cached content - just re-analyze with AI
            print(f"           Strategy: USE CACHE (quality good)")

            note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Smart Corrector: Used cached text (Q:{quality_score:.2f})"

            # Re-analyze with AI to update metadata
            try:
                analysis = summarize_and_classify(existing_raw_text, SCHEMA)

                if analysis:
                    # CRITICAL: Actually write AI analysis results to the sheet!
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

                    note += f" | Updated: {', '.join(updates_made)}"
                    print(f"           [OK] Re-analyzed with AI and WROTE {len(updates_made)} fields to sheet")

            except Exception as e:
                note += f" | AI error: {str(e)[:50]}"
                print(f"           [WARN] AI analysis failed: {e}")

            stats['cached'] += 1
            cost = 0.006

        else:
            # Need to reprocess from source
            print(f"           Strategy: REPROCESS from source")
            print(f"           Issues: {', '.join(issues[:2])}")

            result = None

            try:
                # Route to appropriate processor
                if content_type == 'audio' and 'soundcloud' in url.lower():
                    print(f"           Processor: SoundCloud")
                    result = soundcloud.process(url)
                    stats['soundcloud'] += 1

                elif content_type == 'video':
                    if 'youtube' in url.lower() or 'youtu.be' in url.lower():
                        print(f"           Processor: YouTube (FREE captions)")
                        result = youtube.process(url)
                        stats['youtube_free'] += 1
                    elif 'c-span' in url.lower():
                        print(f"           Processor: C-SPAN")
                        result = cspan.process(url)

                elif content_type == 'social':
                    if 'twitter.com' in url.lower() or 'x.com' in url.lower():
                        print(f"           Processor: Twitter")
                        result = twitter.process(url)

                if result and result.get('status') == 'success':
                    new_raw_text = result.get('raw_text', '')

                    if new_raw_text:
                        # Check for cell limit
                        if len(new_raw_text) > 49000:
                            print(f"           [WARN] Text too long ({len(new_raw_text)} chars), truncating")
                            new_raw_text = new_raw_text[:49000] + '... [TRUNCATED]'
                            stats['edge_cases']['cell_limit'] += 1

                        print(f"           [OK] Extracted {len(new_raw_text)} chars")

                        # Update sheet
                        worksheet.update_cell(row_num, col_ah_idx, new_raw_text)
                        print(f"           [UPDATED] Column AH (raw_text)")

                        note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Smart Corrector: Reprocessed via {result.get('source')} | {len(new_raw_text)} chars"

                        # Re-analyze with AI AND WRITE RESULTS
                        try:
                            analysis = summarize_and_classify(new_raw_text, SCHEMA)

                            if analysis:
                                # CRITICAL: Actually write AI analysis results to the sheet!
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

                                note += f" | AI: {', '.join(updates_made)}"
                                print(f"           [OK] AI analyzed and WROTE {len(updates_made)} fields to sheet")

                        except Exception as e:
                            note += f" | AI error: {str(e)[:30]}"
                            print(f"           [WARN] AI analysis failed: {e}")

                        stats['reprocessed'] += 1
                        cost = 0.02  # Estimate
                    else:
                        note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Smart Corrector: Processing returned no content"
                        print(f"           [WARN] No content extracted")
                        stats['errors'] += 1
                        stats['edge_cases']['missing_content'] += 1
                        cost = 0.0

                elif result and result.get('status') == 'needs_transcription':
                    note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] [NEEDS_TRANSCRIPTION] {result.get('error', 'Requires audio transcription')}"
                    print(f"           [FLAGGED] Needs transcription")
                    stats['edge_cases']['no_captions'] += 1
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
        try:
            worksheet.update_cell(row_num, col_aj_idx, note)
            print(f"           [UPDATED] Column AJ (notes)")
        except Exception as e:
            print(f"           [WARN] Could not update notes: {e}")

        # Track cost
        stats['total_cost'] += cost
        if cost > 0:
            cost_tracker.record_cost('gemini_flash', cost, operation=f"Process row {row_num}")
        print(f"           Cost: ${cost:.4f} | Total: ${stats['total_cost']:.2f}")

        stats['processed'] += 1

        # Save progress every 10 rows
        if (i + 1) % 10 == 0:
            save_progress(i + 1, stats)

        # Brief pause to avoid rate limits
        time.sleep(1)

    # Final progress save
    save_progress(limit, stats)

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
    print(f"\nEdge Cases Encountered:")
    print(f"  - No captions available: {stats['edge_cases']['no_captions']}")
    print(f"  - Cell limit exceeded: {stats['edge_cases']['cell_limit']}")
    print(f"  - Missing content: {stats['edge_cases']['missing_content']}")
    print(f"\nTotal Cost: ${stats['total_cost']:.2f}")
    print(f"Budget Remaining: ${cost_tracker.max_budget - stats['total_cost']:.2f}")
    print(f"\n[COMPLETE] All updates written to Google Sheets!")
    print(f"Check column AJ for processing notes on each row.")

    return stats


if __name__ == "__main__":
    # Parse arguments
    batch_size = 25
    resume = True

    for arg in sys.argv:
        if arg.startswith('--batch-size='):
            batch_size = int(arg.split('=')[1])
        if arg == '--no-resume':
            resume = False

    try:
        stats = process_with_smart_corrector(limit=200, batch_size=batch_size, resume=resume)
    except KeyboardInterrupt:
        print("\n\n[INTERRUPTED] Processing stopped by user")
        print("Progress has been saved. Run again with --resume to continue.")
    except Exception as e:
        print(f"\n[ERROR] Processing failed: {e}")
        import traceback
        traceback.print_exc()
