# -*- coding: utf-8 -*-
"""
Fix remaining edge cases: Row 35 and Row 42
"""

from datetime import datetime
import re



from scripts.diagnostics.smart_corrector.processors import YouTubeEnhancedProcessor, SoundCloudProcessor
from scripts.diagnostics.smart_corrector import AudioOptimizer

import gspread
from google.oauth2.service_account import Credentials
import os

def advanced_clean_transcript(text: str) -> str:
    """
    Advanced cleaning for heavily polluted transcripts.
    Removes metadata AND deduplicates 3x repetitions.
    """
    # Step 1: Remove metadata lines
    lines = text.split('\n')
    clean_lines = []
    for line in lines:
        line = line.strip()
        # Skip metadata lines
        if line.startswith(('Kind:', 'Language:', 'Caption', 'Subtitle')):
            continue
        if line:
            clean_lines.append(line)

    # Join back
    text = ' '.join(clean_lines)

    # Step 2: Remove 3x consecutive word repetitions
    words = text.split()
    deduplicated = []

    i = 0
    while i < len(words):
        # Check for 3x repetition (common in auto-captions)
        if i + 2 < len(words):
            if words[i] == words[i+1] == words[i+2]:
                # Found 3x repetition - add once and skip all repeats
                deduplicated.append(words[i])
                current_word = words[i]
                # Skip all consecutive occurrences
                while i < len(words) and words[i] == current_word:
                    i += 1
                continue

        deduplicated.append(words[i])
        i += 1

    text = ' '.join(deduplicated)

    # Step 3: Clean up extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    return text


def fix_row_35():
    """Fix Row 35 - YouTube with excessive repetition."""

    print("=" * 80)
    print("FIXING ROW 35 - YouTube with Excessive Repetition")
    print("=" * 80)
    print()

    # Connect to sheet
    scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    creds = Credentials.from_service_account_file(os.path.join(BASE_DIR, 'google_credentials.json'), scopes=scopes)
    client = gspread.authorize(creds)

    sheet_name = os.getenv('SPREADSHEET_NAME', '📎Rosen Archive URL List')
    worksheet = client.open(sheet_name).worksheet('test_runs')

    headers = worksheet.row_values(1)
    col_ah_idx = headers.index('raw_text') + 1
    col_aj_idx = headers.index('notes') + 1

    # Get row 35
    records = worksheet.get_all_records()
    rec = records[33]  # Row 35 = index 33

    url = rec.get('url', '')
    old_text = rec.get('raw_text', '')

    print(f"URL: {url}")
    print(f"Current text length: {len(old_text)} chars")
    print(f"Current quality: {len(set(old_text.split()[:100])) / 100:.2f}")
    print()

    # Try advanced cleaning first
    print("Step 1: Trying advanced cleaning of existing text...")
    cleaned = advanced_clean_transcript(old_text)
    quality = len(set(cleaned.split()[:100])) / 100 if cleaned else 0

    print(f"  Cleaned length: {len(cleaned)} chars")
    print(f"  Cleaned quality: {quality:.2f}")

    if quality >= 0.70 and len(cleaned) > 1000:
        print("  [OK] Advanced cleaning successful!")

        # Update sheet
        if len(cleaned) > 49000:
            cleaned = cleaned[:49000] + '... [TRUNCATED]'

        worksheet.update_cell(35, col_ah_idx, cleaned)

        note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Fixed via advanced cleaning | {len(cleaned)} chars | Q:{quality:.2f}"
        worksheet.update_cell(35, col_aj_idx, note)

        print("  [UPDATED] Row 35 fixed!")
        return True

    # If cleaning didn't work, try re-fetching
    print("\nStep 2: Advanced cleaning insufficient, re-fetching from YouTube...")

    youtube = YouTubeEnhancedProcessor()
    result = youtube.process(url)

    if result.get('status') == 'success':
        new_text = result.get('raw_text', '')
        quality = len(set(new_text.split()[:100])) / 100

        print(f"  Re-fetched: {len(new_text)} chars | Q:{quality:.2f}")

        if len(new_text) > 49000:
            new_text = new_text[:49000] + '... [TRUNCATED]'

        worksheet.update_cell(35, col_ah_idx, new_text)

        note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Re-fetched from YouTube | {len(new_text)} chars | Q:{quality:.2f}"
        worksheet.update_cell(35, col_aj_idx, note)

        print("  [UPDATED] Row 35 fixed!")
        return True

    else:
        print(f"  [ERROR] Could not fix row 35: {result.get('error')}")
        return False


def fix_row_42():
    """Fix Row 42 - SoundCloud with missing content."""

    print("\n" + "=" * 80)
    print("FIXING ROW 42 - SoundCloud with Missing Content")
    print("=" * 80)
    print()

    # Connect to sheet
    scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    creds = Credentials.from_service_account_file(os.path.join(BASE_DIR, 'google_credentials.json'), scopes=scopes)
    client = gspread.authorize(creds)

    sheet_name = os.getenv('SPREADSHEET_NAME', '📎Rosen Archive URL List')
    worksheet = client.open(sheet_name).worksheet('test_runs')

    headers = worksheet.row_values(1)
    col_ah_idx = headers.index('raw_text') + 1
    col_aj_idx = headers.index('notes') + 1

    # Get row 42
    records = worksheet.get_all_records()
    rec = records[40]  # Row 42 = index 40

    url = rec.get('url', '')
    old_text = rec.get('raw_text', '')

    print(f"URL: {url}")
    print(f"Current text: {len(old_text)} chars")
    print()

    # Re-process with SoundCloud processor
    audio_optimizer = AudioOptimizer(speed_factor=2.0)
    soundcloud = SoundCloudProcessor(audio_optimizer=audio_optimizer)

    print("Attempting to extract SoundCloud content...")
    result = soundcloud.process(url)

    if result.get('status') == 'success':
        new_text = result.get('raw_text', '')

        print(f"  [OK] Extracted: {len(new_text)} chars")

        if len(new_text) > 100:
            worksheet.update_cell(42, col_ah_idx, new_text)

            note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Extracted SoundCloud description | {len(new_text)} chars"
            worksheet.update_cell(42, col_aj_idx, note)

            print("  [UPDATED] Row 42 fixed!")
            return True
        else:
            print(f"  [WARN] Content too short ({len(new_text)} chars)")

            note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] [NEEDS_TRANSCRIPTION] Description too short - audio transcription needed (~$0.30)"
            worksheet.update_cell(42, col_aj_idx, note)

            print("  [FLAGGED] Marked for audio transcription")
            return False

    elif result.get('status') == 'needs_transcription':
        print("  [INFO] Audio transcription needed")
        print(f"  Duration: {result.get('metadata', {}).get('duration', 0)/60:.1f} min")
        print(f"  Estimated cost: ${result.get('estimated_cost', 0):.2f}")

        note = f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] [NEEDS_TRANSCRIPTION] Est. cost: ${result.get('estimated_cost', 0):.2f}"
        worksheet.update_cell(42, col_aj_idx, note)

        print("  [FLAGGED] Marked for batch transcription")
        return False

    else:
        print(f"  [ERROR] {result.get('error', 'Unknown error')}")
        return False


if __name__ == "__main__":
    print("\nFIXING REMAINING EDGE CASES")
    print("=" * 80)

    success_count = 0

    # Fix Row 35
    try:
        if fix_row_35():
            success_count += 1
    except Exception as e:
        print(f"\n[ERROR] Row 35 failed: {e}")
        import traceback
        traceback.print_exc()

    # Fix Row 42
    try:
        if fix_row_42():
            success_count += 1
    except Exception as e:
        print(f"\n[ERROR] Row 42 failed: {e}")
        import traceback
        traceback.print_exc()

    # Summary
    print("\n" + "=" * 80)
    print(f"SUMMARY: Fixed {success_count}/2 edge cases")
    print("=" * 80)

    if success_count == 2:
        print("\n[SUCCESS] All edge cases resolved!")
    else:
        print("\n[PARTIAL] Some edge cases may need manual review or batch transcription")
        print("See EDGE_CASES_AND_SOLUTIONS.md for detailed guidance")
