# -*- coding: utf-8 -*-
"""
Fix YouTube rows 31-38 with clean, deduplicated transcripts
"""

from datetime import datetime



from scripts.diagnostics.smart_corrector.processors import YouTubeEnhancedProcessor

import gspread
from google.oauth2.service_account import Credentials
import os

def fix_youtube_rows():
    """Fix YouTube rows with clean transcripts."""

    print("=" * 80)
    print("FIXING YOUTUBE ROWS 31-38")
    print("=" * 80)
    print()

    # Connect to sheet
    scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    creds = Credentials.from_service_account_file(os.path.join(BASE_DIR, 'google_credentials.json'), scopes=scopes)
    client = gspread.authorize(creds)

    sheet_name = os.getenv('SPREADSHEET_NAME', '📎Rosen Archive URL List')
    spreadsheet = client.open(sheet_name)
    worksheet = spreadsheet.worksheet('test_runs')

    # Get headers
    headers = worksheet.row_values(1)
    col_ah_idx = headers.index('raw_text') + 1
    col_aj_idx = headers.index('notes') + 1

    # Initialize processor
    youtube = YouTubeEnhancedProcessor()

    # Process rows 31-38 (indices 29-36)
    all_records = worksheet.get_all_records()
    problematic_rows = [31, 32, 33, 34, 35, 36, 37, 38]

    stats = {'fixed': 0, 'failed': 0, 'skipped': 0}

    for row_num in problematic_rows:
        record = all_records[row_num - 2]  # -2 because row 2 is index 0
        url = record.get('url', '')

        if not url or 'youtu' not in url.lower():
            print(f"[{row_num}] SKIP - Not a YouTube URL")
            stats['skipped'] += 1
            continue

        print(f"\n[{row_num}] {url[:60]}...")

        try:
            # Process with fixed YouTube processor
            result = youtube.process(url)

            if result.get('status') == 'success':
                new_text = result.get('raw_text', '')

                if new_text:
                    # Check quality
                    words = new_text.split()[:100]
                    uniqueness = len(set(words)) / len(words) if words else 0

                    print(f"  Extracted: {len(new_text)} chars")
                    print(f"  Quality: {uniqueness:.2f} uniqueness")

                    if uniqueness < 0.70:
                        print("  [WARN] Still has repetition, skipping")
                        stats['failed'] += 1
                        continue

                    # Update sheet
                    print("  Updating column AH (raw_text)...")
                    worksheet.update_cell(row_num, col_ah_idx, new_text)

                    # Update notes
                    note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Fixed by YouTube processor | Clean transcript ({len(new_text)} chars, {uniqueness:.2f} quality)"
                    worksheet.update_cell(row_num, col_aj_idx, note)

                    print("  [OK] Updated successfully!")
                    stats['fixed'] += 1

                else:
                    print("  [ERROR] No text extracted")
                    stats['failed'] += 1

            else:
                print(f"  [ERROR] {result.get('error', 'Unknown error')}")
                stats['failed'] += 1

        except Exception as e:
            print(f"  [ERROR] Exception: {e}")
            stats['failed'] += 1

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Fixed: {stats['fixed']}")
    print(f"Failed: {stats['failed']}")
    print(f"Skipped: {stats['skipped']}")
    print()

    if stats['fixed'] > 0:
        print("[SUCCESS] YouTube rows have been fixed with clean transcripts!")
        print("Check rows 31-38 in your Google Sheet - they should now have clean, deduplicated text.")
    else:
        print("[WARN] No rows were successfully fixed")


if __name__ == "__main__":
    try:
        fix_youtube_rows()
    except Exception as e:
        print(f"\n[ERROR] Script failed: {e}")
        import traceback
        traceback.print_exc()
