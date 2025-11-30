# -*- coding: utf-8 -*-
"""
Test Smart Data Corrector on first 25 rows
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / 'tools' / 'diagnostics'))

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

# Setup Google Sheets connection
def get_sheet():
    """Connect to Google Sheets."""
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]

    creds_path = project_root / 'google_credentials.json'
    creds = Credentials.from_service_account_file(str(creds_path), scopes=scopes)
    client = gspread.authorize(creds)

    # Get the spreadsheet
    sheet_name = os.getenv('SPREADSHEET_NAME', '📎Rosen Archive URL List')
    spreadsheet = client.open(sheet_name)
    worksheet = spreadsheet.worksheet('test_runs')

    return worksheet

def test_first_25_rows(dry_run=True):
    """
    Test Smart Data Corrector on first 25 rows.

    Args:
        dry_run: If True, just analyze without making changes
    """
    print("=" * 80)
    print("SMART DATA CORRECTOR - Testing First 25 Rows")
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
    pdf_gen = SmartCorrectorPDFGenerator(output_dir="test_pdfs_25_rows")

    # Connect to Google Sheets
    print("[1/5] Connecting to Google Sheets...")
    worksheet = get_sheet()
    print("      Connected successfully!")

    # Get all data
    print("\n[2/5] Fetching first 25 rows...")
    all_records = worksheet.get_all_records()
    records = all_records[:25]
    print(f"      Retrieved {len(records)} records")

    # Analyze records
    print("\n[3/5] Analyzing content types and quality...")
    print("-" * 80)

    stats = {
        'total': len(records),
        'by_type': {'article': 0, 'audio': 0, 'video': 0, 'social': 0},
        'quality': {'high': 0, 'medium': 0, 'low': 0, 'missing': 0},
        'needs_reprocess': 0,
        'can_use_cache': 0,
        'estimated_cost': 0.0
    }

    analysis_results = []

    for i, record in enumerate(records, 1):
        url = record.get('url', '')
        raw_text = record.get('raw_text', '')

        if not url:
            print(f"\n[{i:2d}/25] SKIP - No URL")
            continue

        # Detect content type
        content_type = detector.detect(url)
        stats['by_type'][content_type] += 1

        # Validate quality
        if raw_text:
            is_valid, quality_score, issues = validator.validate(raw_text, url, content_type)

            if quality_score >= 0.8:
                quality_level = 'high'
            elif quality_score >= 0.6:
                quality_level = 'medium'
            else:
                quality_level = 'low'
        else:
            is_valid = False
            quality_score = 0.0
            quality_level = 'missing'
            issues = ['No raw_text found']

        stats['quality'][quality_level] += 1

        # Determine if reprocessing needed
        needs_reprocess = not is_valid or quality_score < 0.7

        if needs_reprocess:
            stats['needs_reprocess'] += 1

            # Estimate cost for reprocessing
            if content_type == 'audio':
                cost = cost_tracker.estimate_cost('audio', duration=1800, speed_optimization=True)
            elif content_type == 'video':
                cost = cost_tracker.estimate_cost('video')
            else:
                cost = cost_tracker.estimate_cost('article')

            stats['estimated_cost'] += cost
        else:
            stats['can_use_cache'] += 1
            cost = 0.006  # Just AI re-analysis cost
            stats['estimated_cost'] += cost

        # Store analysis
        analysis_results.append({
            'row': i,
            'url': url[:60] + '...' if len(url) > 60 else url,
            'content_type': content_type,
            'quality_score': quality_score,
            'quality_level': quality_level,
            'needs_reprocess': needs_reprocess,
            'issues': issues,
            'cost': cost
        })

        # Print summary for this row
        status = "REPROCESS" if needs_reprocess else "USE CACHE"
        print(f"[{i:2d}/25] {content_type:8s} | Q:{quality_score:.2f} | {status:11s} | ${cost:.4f}")

        if issues and len(issues) <= 3:
            for issue in issues[:3]:
                print(f"        ⚠ {issue}")

    # Print summary statistics
    print("\n" + "=" * 80)
    print("[4/5] ANALYSIS SUMMARY")
    print("=" * 80)

    print("\nContent Type Distribution:")
    for content_type, count in stats['by_type'].items():
        if count > 0:
            pct = (count / stats['total']) * 100
            print(f"  {content_type:8s}: {count:2d} ({pct:5.1f}%)")

    print("\nQuality Distribution:")
    for quality_level, count in stats['quality'].items():
        if count > 0:
            pct = (count / stats['total']) * 100
            print(f"  {quality_level:8s}: {count:2d} ({pct:5.1f}%)")

    print("\nProcessing Strategy:")
    cache_pct = (stats['can_use_cache'] / stats['total']) * 100
    reprocess_pct = (stats['needs_reprocess'] / stats['total']) * 100
    print(f"  Use cached text: {stats['can_use_cache']:2d} ({cache_pct:5.1f}%)")
    print(f"  Reprocess from source: {stats['needs_reprocess']:2d} ({reprocess_pct:5.1f}%)")

    print(f"\nEstimated Total Cost: ${stats['estimated_cost']:.2f}")
    print(f"Budget Remaining: ${50.0 - stats['estimated_cost']:.2f}")

    # Test multimedia processors on a few samples
    print("\n" + "=" * 80)
    print("[5/5] TESTING MULTIMEDIA PROCESSORS (Sample)")
    print("=" * 80)

    # Find one of each type
    sample_urls = {
        'audio': None,
        'video': None,
        'social': None
    }

    for result in analysis_results:
        content_type = result['content_type']
        if content_type in sample_urls and sample_urls[content_type] is None:
            # Find the full URL from records
            for record in records:
                if record.get('url', '')[:60] == result['url'][:60]:
                    sample_urls[content_type] = record.get('url')
                    break

    # Test SoundCloud
    if sample_urls['audio'] and 'soundcloud' in sample_urls['audio'].lower():
        print("\n[TEST] SoundCloud Processor:")
        print(f"  URL: {sample_urls['audio'][:70]}...")
        try:
            result = soundcloud.process(sample_urls['audio'])
            print(f"  Status: {result.get('status')}")
            print(f"  Source: {result.get('source', 'N/A')}")
            if result.get('title'):
                print(f"  Title: {result['title'][:60]}")
            if result.get('raw_text'):
                print(f"  Content: {len(result['raw_text'])} chars")
        except Exception as e:
            print(f"  ERROR: {e}")

    # Test YouTube
    if sample_urls['video'] and 'youtube' in sample_urls['video'].lower():
        print("\n[TEST] YouTube Processor:")
        print(f"  URL: {sample_urls['video'][:70]}...")
        try:
            result = youtube.process(sample_urls['video'])
            print(f"  Status: {result.get('status')}")
            print(f"  Source: {result.get('source', 'N/A')}")
            if result.get('transcript_type'):
                print(f"  Transcript Type: {result['transcript_type']}")
            if result.get('raw_text'):
                print(f"  Content: {len(result['raw_text'])} chars")
        except Exception as e:
            print(f"  ERROR: {e}")

    # Test Twitter
    if sample_urls['social'] and ('twitter.com' in sample_urls['social'].lower() or 'x.com' in sample_urls['social'].lower()):
        print("\n[TEST] Twitter Processor:")
        print(f"  URL: {sample_urls['social'][:70]}...")
        try:
            result = twitter.process(sample_urls['social'])
            print(f"  Status: {result.get('status')}")
            print(f"  Source: {result.get('source', 'N/A')}")
            if result.get('is_thread'):
                print(f"  Thread: {result.get('tweet_count')} tweets")
            if result.get('raw_text'):
                print(f"  Content: {len(result['raw_text'])} chars")
        except Exception as e:
            print(f"  ERROR: {e}")

    print("\n" + "=" * 80)
    print("TEST COMPLETE")
    print("=" * 80)

    if dry_run:
        print("\nThis was a DRY RUN - no data was modified.")
        print("To process these records, run: python test_smart_corrector_25.py --live")
    else:
        print("\nReady to process 25 rows with Smart Data Corrector!")

    return analysis_results, stats


if __name__ == "__main__":
    import sys

    # Check for --live flag
    dry_run = '--live' not in sys.argv

    try:
        results, stats = test_first_25_rows(dry_run=dry_run)
    except Exception as e:
        print(f"\n[ERROR] Test failed: {e}")
        import traceback
        traceback.print_exc()
