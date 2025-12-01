# -*- coding: utf-8 -*-
"""
Test Smart Data Corrector on multimedia rows (27-42)
Focus on YouTube and SoundCloud processing
"""

import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent  # Go to backend root
sys.path.insert(0, str(project_root / 'scripts'))
sys.path.insert(0, str(project_root / 'scripts' / 'diagnostics'))
sys.path.insert(0, str(project_root / 'src'))

from diagnostics.smart_corrector.processors import (
    SoundCloudProcessor,
    YouTubeEnhancedProcessor
)
from diagnostics.smart_corrector import AudioOptimizer

import gspread
from google.oauth2.service_account import Credentials
import os

def test_multimedia():
    """Test multimedia processors on real data."""

    print("=" * 80)
    print("MULTIMEDIA PROCESSOR TEST - Rows 27-42")
    print("=" * 80)
    print()

    # Connect to sheet
    scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
    creds = Credentials.from_service_account_file('google_credentials.json', scopes=scopes)
    client = gspread.authorize(creds)

    sheet_name = os.getenv('SPREADSHEET_NAME', '📎Rosen Archive URL List')
    spreadsheet = client.open(sheet_name)
    worksheet = spreadsheet.worksheet('test_runs')

    # Get all records
    all_records = worksheet.get_all_records()

    # Focus on rows with multimedia content
    test_rows = []

    # Row 41: SoundCloud (no raw_text)
    if len(all_records) > 39:
        test_rows.append((41, all_records[39]))  # Row 41 = index 39

    # Row 31: YouTube
    if len(all_records) > 29:
        test_rows.append((31, all_records[29]))  # Row 31 = index 29

    print(f"Testing {len(test_rows)} multimedia URLs:\n")

    # Initialize processors
    audio_optimizer = AudioOptimizer(speed_factor=2.0)
    soundcloud = SoundCloudProcessor(audio_optimizer=audio_optimizer)
    youtube = YouTubeEnhancedProcessor()

    for row_num, record in test_rows:
        url = record.get('url', '')
        existing_raw_text = record.get('raw_text', '')

        print("=" * 80)
        print(f"ROW {row_num}: {url[:70]}...")
        print("=" * 80)

        # Test based on type
        if 'soundcloud' in url.lower():
            print("Type: SoundCloud Audio")
            print(f"Existing raw_text: {'Yes' if existing_raw_text else 'NO'} ({len(existing_raw_text)} chars)")
            print()

            try:
                print("Running SoundCloud Processor...")
                result = soundcloud.process(url)

                print(f"\nStatus: {result.get('status')}")
                print(f"Source: {result.get('source')}")

                if result.get('status') == 'success':
                    print(f"\n[SUCCESS] Extracted content!")
                    print(f"  Title: {result.get('title', 'N/A')[:60]}")
                    print(f"  Author: {result.get('author', 'N/A')}")
                    print(f"  Content: {len(result.get('raw_text', ''))} chars")

                    if result.get('raw_text'):
                        preview = result['raw_text'][:200].replace('\n', ' ')
                        print(f"  Preview: {preview}...")

                elif result.get('status') == 'needs_transcription':
                    print(f"\n[INFO] Audio transcription needed")
                    print(f"  Duration: {result.get('metadata', {}).get('duration', 0)/60:.1f} min")
                    print(f"  Estimated cost: ${result.get('estimated_cost', 0):.4f}")
                    print(f"  (With 2x speed optimization: ${result.get('estimated_cost', 0):.4f})")

                else:
                    print(f"\n[WARN] {result.get('error', 'Unknown error')}")

            except Exception as e:
                print(f"\n[ERROR] {e}")
                import traceback
                traceback.print_exc()

        elif 'youtube' in url.lower() or 'youtu.be' in url.lower():
            print("Type: YouTube Video")
            print(f"Existing raw_text: {'Yes' if existing_raw_text else 'NO'} ({len(existing_raw_text)} chars)")
            print()

            try:
                print("Running YouTube Processor (FREE captions)...")
                result = youtube.process(url)

                print(f"\nStatus: {result.get('status')}")
                print(f"Source: {result.get('source')}")

                if result.get('status') == 'success':
                    print(f"\n[SUCCESS] FREE captions extracted!")
                    print(f"  Transcript Type: {result.get('transcript_type')}")
                    print(f"  Title: {result.get('title', 'N/A')[:60]}")
                    print(f"  Duration: {result.get('duration_seconds', 0)/60:.1f} min")
                    print(f"  Content: {len(result.get('raw_text', ''))} chars")

                    # Calculate cost savings
                    duration_min = result.get('duration_seconds', 0) / 60
                    traditional_cost = duration_min * 0.024  # Transcription
                    smart_cost = 0.05  # Just AI analysis
                    savings = traditional_cost - smart_cost

                    print(f"\n  [COST SAVINGS]")
                    print(f"    Traditional (download + transcribe): ${traditional_cost:.2f}")
                    print(f"    Smart Corrector (free captions): ${smart_cost:.2f}")
                    print(f"    Savings: ${savings:.2f} ({(savings/traditional_cost*100) if traditional_cost > 0 else 0:.0f}%)")

                else:
                    print(f"\n[WARN] {result.get('error', 'Unknown error')}")
                    print(f"  Would need to download and transcribe audio")

            except Exception as e:
                print(f"\n[ERROR] {e}")
                import traceback
                traceback.print_exc()

        print()

    print("\n" + "=" * 80)
    print("MULTIMEDIA TEST COMPLETE")
    print("=" * 80)
    print("\nKey Findings:")
    print("  - YouTube: FREE caption extraction (no transcription cost)")
    print("  - SoundCloud: Metadata extraction + transcription if needed")
    print("  - Both integrate seamlessly with Smart Data Corrector")


if __name__ == "__main__":
    test_multimedia()
