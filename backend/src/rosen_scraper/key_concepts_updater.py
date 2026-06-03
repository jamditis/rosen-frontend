# -*- coding: utf-8 -*-
"""
Key Concepts Updater Script

This script analyzes raw_text content from the test_runs sheet and updates
the key_concepts column (Q) with appropriate concepts from schema.json using
Gemini 2.0 Flash AI analysis.

Features:
- Processes 100 rows at a time (configurable)
- Automatically saves progress and resumes from last position
- Rate limiting to avoid API quota issues
- Intelligent handling of different row states:
  * Empty colQ: Fills with identified key concepts
  * Existing colQ data: Provides recommendations in colAK
  * No raw text: Adds explanatory note in colAJ

Column Usage:
- Column Q (key_concepts): Filled for empty rows
- Column AJ (notes): Notes for rows that can't be processed
- Column AK (changes): Recommendations for rows with existing concepts

Usage:
    # Process next 100 rows (resumes automatically)
    python src/key_concepts_updater.py

    # Process next 50 rows instead of 100
    python src/key_concepts_updater.py --limit 50

    # Start from a specific row
    python src/key_concepts_updater.py --start 100

    # Reset progress and start from beginning
    python src/key_concepts_updater.py --reset-progress

    # Force reprocessing (replace existing key concepts)
    python src/key_concepts_updater.py --force-reprocess

Progress Tracking:
    Progress is saved to 'key_concepts_progress.json' after each batch.
    The script automatically resumes from where it left off on the next run.
"""

import os
import sys
import json
import time
import argparse
from typing import Dict, List, Optional
from datetime import datetime
from dotenv import load_dotenv
import gspread
import google.generativeai as genai

from rosen_scraper.sheets_client import get_gspread_client

# Load environment variables
load_dotenv()

# Configuration
CREDENTIALS_FILE = "google_credentials.json"
SPREADSHEET_NAME = os.getenv("SPREADSHEET_NAME", "📎Rosen Archive URL List")
SHEET_NAME = "test_runs"
BATCH_SIZE = 100  # Process 100 rows at a time
PROGRESS_FILE = "key_concepts_progress.json"

# Rate limiting delays (in seconds)
DELAY_BETWEEN_UPDATES = 5  # Delay after each Google Sheets update (increased for rate limiting)
DELAY_BETWEEN_BATCHES = 10  # Delay between batches of 100

# Column mappings (0-indexed)
COL_RAW_TEXT = 33  # Column AH (raw_text)
COL_KEY_CONCEPTS = 16  # Column Q (key_concepts)
COL_NOTES = 35  # Column AJ (notes)
COL_CHANGES = 36  # Column AK (changes/recommendations)


def load_progress() -> Dict:
    """Load progress from file"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {
        "last_processed_row": 1,  # Start from row 2 (after header)
        "total_processed": 0,
        "total_updated": 0,
        "last_run": None
    }


def save_progress(progress: Dict):
    """Save progress to file"""
    progress["last_run"] = datetime.now().isoformat()
    with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
        json.dump(progress, f, indent=2)
    print(f"  [*] Progress saved: Last row {progress['last_processed_row']}, Total updated: {progress['total_updated']}")


def load_schema() -> Dict:
    """Load taxonomy from schema.json"""
    schema_path = "schema.json"
    with open(schema_path, 'r', encoding='utf-8-sig') as f:
        schema = json.load(f)
    return schema


def setup_google_sheets() -> gspread.Spreadsheet:
    """Initialize Google Sheets connection (env-or-file credentials).

    Credentials resolve via rosen_scraper.sheets_client: the CI secret
    ROSEN_SHEETS_SA_KEY_JSON first, then ROSEN_SHEETS_SA_KEY, then the local
    google_credentials.json fallback this script has always used.
    """
    client = get_gspread_client(CREDENTIALS_FILE)
    return client.open(SPREADSHEET_NAME)


def setup_gemini() -> genai.GenerativeModel:
    """Initialize Gemini 2.0 Flash Lite model"""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in environment variables")

    genai.configure(api_key=api_key)

    # Use Gemini 2.0 Flash Lite model
    model = genai.GenerativeModel('gemini-2.0-flash-lite')
    return model


def analyze_key_concepts(model: genai.GenerativeModel, raw_text: str, key_concepts_list: List[str],
                         current_concepts: str = "") -> Dict:
    """
    Use Gemini 2.0 Flash to analyze raw text and identify relevant key concepts.

    Args:
        model: Gemini model instance
        raw_text: The article/content text to analyze
        key_concepts_list: List of possible key concepts from schema.json
        current_concepts: Current key concepts in the row (if any)

    Returns:
        Dict with 'concepts' (list) and 'recommendations' (str) keys
    """
    if not raw_text or len(raw_text.strip()) < 100:
        return {"concepts": [], "recommendations": ""}

    # Create analysis prompt
    if current_concepts:
        prompt = f"""Analyze the following text and compare it with the existing key concepts assignment.

Available Key Concepts:
{json.dumps(key_concepts_list, indent=2)}

Current assigned concepts: {current_concepts}

Text to analyze:
{raw_text[:8000]}

Instructions:
1. Read the text carefully and identify which key concepts are explicitly mentioned or implicitly discussed
2. Compare your analysis with the current assigned concepts
3. Return a JSON object with two fields:
   - "concepts": Array of ALL relevant concepts you identified
   - "recommendations": MUST be one of these two formats:
     * If your identified concepts match the current assignment: "N/A"
     * If different concepts should be used: Return ONLY the comma-separated list of concepts (ready to copy/paste)

Concepts to look for:
   - "View from Nowhere": Objectivity ideology in journalism
   - "Church of the Savvy": Political journalists focused on strategy over substance
   - "The People Formerly Known as the Audience": Empowered media consumers
   - "Parity Product": When news becomes commoditized/undifferentiated
   - "Verification in reverse": Starting with conclusion, finding supporting facts
   - "He said/she said journalism": False balance in reporting
   - "Audience atomization overcome": Connected audiences via social media
   - "The Production of Innocence": Press avoiding accountability
   - "Horse-race journalism": Campaign coverage focused on polls and strategy rather than substance
   - "False balance": Giving equal weight to unequal claims
   - "The Citizens' Agenda": Election coverage prioritizing voter concerns over candidate strategy
   - "Not the odds but the stakes": Focusing on election consequences rather than polling/predictions
   - "Mindcasting": Broadcasting one's thought process and knowledge-gathering

CRITICAL: You MUST only return concepts from the exact list above. Do not create new concepts or variations.
Use the exact capitalization and spelling shown above.

Return format (JSON object):
{{
  "concepts": ["concept1", "concept2"],
  "recommendations": "N/A"
}}

or if different concepts should be used:
{{
  "concepts": ["concept1", "concept2"],
  "recommendations": "concept1, concept2, concept3"
}}"""
    else:
        prompt = f"""Analyze the following text and identify which of these Jay Rosen journalism concepts are present or discussed:

Available Key Concepts:
{json.dumps(key_concepts_list, indent=2)}

Text to analyze:
{raw_text[:8000]}

Instructions:
1. Read the text carefully and identify which key concepts are explicitly mentioned or implicitly discussed
2. Only select concepts that are genuinely present in the text
3. Return a JSON object with concepts array
4. If no concepts are relevant, return an empty array

Concepts to look for:
   - "View from Nowhere": Objectivity ideology in journalism
   - "Church of the Savvy": Political journalists focused on strategy over substance
   - "The People Formerly Known as the Audience": Empowered media consumers
   - "Parity Product": When news becomes commoditized/undifferentiated
   - "Verification in reverse": Starting with conclusion, finding supporting facts
   - "He said/she said journalism": False balance in reporting
   - "Audience atomization overcome": Connected audiences via social media
   - "The Production of Innocence": Press avoiding accountability
   - "Horse-race journalism": Campaign coverage focused on polls and strategy rather than substance
   - "False balance": Giving equal weight to unequal claims
   - "The Citizens' Agenda": Election coverage prioritizing voter concerns over candidate strategy
   - "Not the odds but the stakes": Focusing on election consequences rather than polling/predictions
   - "Mindcasting": Broadcasting one's thought process and knowledge-gathering

CRITICAL: You MUST only return concepts from the exact list above. Do not create new concepts or variations.
Use the exact capitalization and spelling shown above.

Return format (JSON object):
{{
  "concepts": ["concept1", "concept2"],
  "recommendations": ""
}}"""

    try:
        response = model.generate_content(prompt)
        result_text = response.text.strip()

        # Clean up response - extract JSON
        if result_text.startswith('```json'):
            result_text = result_text.replace('```json', '').replace('```', '').strip()
        elif result_text.startswith('```'):
            result_text = result_text.replace('```', '').strip()

        # Parse JSON response
        result = json.loads(result_text)

        # Validate and normalize returned concepts
        if 'concepts' in result:
            validated_concepts = []
            for concept in result['concepts']:
                # Exact match (preferred)
                if concept in key_concepts_list:
                    validated_concepts.append(concept)
                else:
                    # Try case-insensitive match
                    concept_lower = concept.lower()
                    for valid_concept in key_concepts_list:
                        if valid_concept.lower() == concept_lower:
                            validated_concepts.append(valid_concept)
                            print(f"  [WARN] Normalized '{concept}' to '{valid_concept}'")
                            break
            result['concepts'] = validated_concepts
        else:
            result = {"concepts": [], "recommendations": ""}

        return result

    except json.JSONDecodeError as e:
        print(f"  [WARN] JSON parsing error: {e}")
        print(f"  Response was: {result_text[:200]}")
        return {"concepts": [], "recommendations": "Error parsing AI response"}
    except Exception as e:
        print(f"  [WARN] Error analyzing concepts: {e}")
        return {"concepts": [], "recommendations": f"Error: {str(e)}"}


def process_rows(spreadsheet: gspread.Spreadsheet, model: genai.GenerativeModel,
                 schema: Dict, start_row: Optional[int] = None, limit: Optional[int] = None,
                 resume: bool = True, force_reprocess: bool = False,
                 dry_run: bool = False) -> Dict:
    """
    Process rows from test_runs sheet and update key concepts.

    Args:
        spreadsheet: Google Sheets spreadsheet object
        model: Gemini model instance
        schema: Schema dictionary with taxonomy
        start_row: Row number to start from (1-indexed). If None, resumes from saved progress.
        limit: Optional limit on number of rows to process (defaults to BATCH_SIZE)
        resume: If True, resume from saved progress
        force_reprocess: If True, reprocess even rows with existing data
        dry_run: If True, log the cells that would be written but write nothing
                 and do not advance the saved progress cursor

    Returns:
        Summary dict: ``{processed, writes, gemini_calls, dry_run, by_field}``.
        Callers use ``gemini_calls`` + ``writes`` to enforce the "AI ran but
        wrote nothing" guard.
    """
    worksheet = spreadsheet.worksheet(SHEET_NAME)

    # Per-field write counter. Counts the cells we wrote -- or, under --dry-run,
    # would have written -- so the run summary can prove work happened. A live
    # run that calls Gemini but writes zero cells is the "$0.53 wasted, AI ran
    # but nothing was saved" failure the data-pipeline rules guard against.
    writes_by_field = {'key_concepts': 0, 'recommendations': 0, 'notes': 0}
    gemini_calls = 0

    def _write(range_name: str, value, field: str):
        """Write one cell, or log it under dry-run.

        Counts only writes that actually land: under dry-run the would-write is
        counted (the guard ignores dry runs), and live the counter is bumped
        ONLY after worksheet.update() returns. A failed Sheets write therefore
        leaves the counter at zero, so the zero-write guard can't be fooled into
        reporting success when Gemini ran but nothing was saved.
        """
        if dry_run:
            print(f"  [DRY-RUN] would write {field} -> {range_name}: "
                  f"{str(value)[:60]}")
            writes_by_field[field] += 1
            return
        worksheet.update(values=[[value]], range_name=range_name)
        writes_by_field[field] += 1

    # Load progress
    progress = load_progress()

    # Determine starting row
    if start_row is None and resume:
        start_row = progress["last_processed_row"] + 1
        print(f"[*] Resuming from row {start_row} (last saved progress)")
    elif start_row is None:
        start_row = 2  # Skip header

    # Set default limit to BATCH_SIZE
    if limit is None:
        limit = BATCH_SIZE

    # Get all rows
    all_rows = worksheet.get_all_values()

    if len(all_rows) < 2:
        print("No data rows found in sheet")
        return {'processed': 0, 'writes': 0, 'gemini_calls': 0,
                'dry_run': dry_run, 'by_field': writes_by_field}

    # Get key concepts from schema
    key_concepts_list = schema['taxonomy']['key_concepts']
    print(f"\n[*] Available Key Concepts: {len(key_concepts_list)}")
    for concept in key_concepts_list:
        print(f"   - {concept}")

    # Determine range
    data_rows = all_rows[start_row-1:]  # Convert to 0-indexed

    if limit:
        data_rows = data_rows[:limit]

    total_rows = len(data_rows)
    print(f"\n[*] Processing up to {total_rows} rows starting from row {start_row}")
    print(f"[*] Force reprocess: {force_reprocess}")
    print("=" * 80)

    updates_made = 0
    skipped = 0
    errors = 0
    processed_count = 0

    # Process rows
    for i, row_data in enumerate(data_rows):
        row_number = start_row + i

        try:
            # Get raw text from column AH (index 33)
            raw_text = row_data[COL_RAW_TEXT] if len(row_data) > COL_RAW_TEXT else ""

            # Get current key concepts from column Q (index 16)
            current_concepts = row_data[COL_KEY_CONCEPTS] if len(row_data) > COL_KEY_CONCEPTS else ""

            # Check if no raw text - add note to colAJ
            if not raw_text or len(raw_text.strip()) < 100:
                print(f"Row {row_number}: [NOTE] No raw text or too short - adding note to colAJ")
                note = "Skipped: No raw text or content too short (< 100 chars)"
                _write(f"AJ{row_number}", note, 'notes')
                skipped += 1
                processed_count += 1
                time.sleep(DELAY_BETWEEN_UPDATES)
                continue

            # If row already has key concepts
            if current_concepts and not force_reprocess:
                print(f"\nRow {row_number}: [REVIEW] Existing concepts: {current_concepts[:50]}...")
                print(f"  Raw text length: {len(raw_text)} chars")

                # Analyze and provide recommendations
                gemini_calls += 1
                analysis = analyze_key_concepts(model, raw_text, key_concepts_list, current_concepts)

                recommendations = analysis.get('recommendations', '')

                if recommendations and recommendations != "N/A":
                    print(f"  [RECOMMENDATION] {recommendations}")
                    # Update colAK with recommendations
                    _write(f"AK{row_number}", recommendations, 'recommendations')
                    updates_made += 1
                else:
                    print("  [OK] N/A - Current assignment looks good")
                    # Update colAK with N/A
                    _write(f"AK{row_number}", "N/A", 'recommendations')
                    updates_made += 1

                skipped += 1
                processed_count += 1
                time.sleep(DELAY_BETWEEN_UPDATES)
                continue

            # Row has no key concepts - analyze and fill
            print(f"\nRow {row_number}: [ANALYZING] Empty key_concepts field")
            print(f"  Raw text length: {len(raw_text)} chars")

            # Analyze with Gemini
            gemini_calls += 1
            analysis = analyze_key_concepts(model, raw_text, key_concepts_list, current_concepts)
            identified_concepts = analysis.get('concepts', [])
            recommendations = analysis.get('recommendations', '')

            # Format as comma-separated string
            new_concepts_str = ", ".join(identified_concepts) if identified_concepts else ""

            print(f"  AI-identified concepts: {new_concepts_str if new_concepts_str else '(none)'}")

            # Update the cell in colQ
            cell_address = f"Q{row_number}"
            _write(cell_address, new_concepts_str, 'key_concepts')
            print(f"  [OK] Updated: {cell_address}")
            updates_made += 1

            # If there are recommendations, add to colAK
            if recommendations:
                _write(f"AK{row_number}", recommendations, 'recommendations')
                print("  [NOTE] Added recommendations to colAK")

            processed_count += 1

            # Rate limiting - sleep between updates
            time.sleep(DELAY_BETWEEN_UPDATES)

        except Exception as e:
            print(f"Row {row_number}: [ERROR] {e}")
            errors += 1
            processed_count += 1
            continue

    total_writes = sum(writes_by_field.values())

    # Update progress -- but never advance the cursor on a dry run, or the next
    # real run would skip the rows this rehearsal only pretended to process.
    if not dry_run:
        progress["last_processed_row"] = start_row + processed_count - 1
        progress["total_processed"] = progress.get("total_processed", 0) + processed_count
        progress["total_updated"] = progress.get("total_updated", 0) + updates_made
        save_progress(progress)

    # Summary
    print("\n" + "=" * 80)
    print("[*] BATCH COMPLETE" + (" (DRY RUN -- nothing written)" if dry_run else ""))
    print("=" * 80)
    print(f"Rows in this batch: {processed_count}")
    print(f"[OK] Key concepts filled/updated: {updates_made}")
    print(f"[SKIP] Reviewed (had existing concepts): {skipped}")
    print(f"[ERROR] Errors: {errors}")
    print(f"Gemini calls: {gemini_calls}")
    print(f"Cells {'that would be ' if dry_run else ''}written: {total_writes} "
          f"({writes_by_field})")
    print("\n[*] Overall Progress:")
    print(f"Total rows processed across all runs: {progress['total_processed']}")
    print(f"Total updates made across all runs: {progress['total_updated']}")
    print(f"Last processed row: {progress['last_processed_row']}")
    print("\n[*] Notes:")
    print("  - Rows with no raw text: Notes added to column AJ")
    print("  - Rows with existing concepts: Recommendations added to column AK")
    print("  - Rows with empty concepts: Filled column Q, recommendations in AK")

    return {
        'processed': processed_count,
        'writes': total_writes,
        'gemini_calls': gemini_calls,
        'dry_run': dry_run,
        'by_field': writes_by_field,
    }


def main():
    """Main execution function"""
    parser = argparse.ArgumentParser(
        description="Update key concepts in test_runs sheet using Gemini 2.0 Flash analysis"
    )
    parser.add_argument(
        '--start',
        type=int,
        default=None,
        help='Starting row number (default: resume from saved progress)'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help=f'Limit number of rows to process (default: {BATCH_SIZE})'
    )
    parser.add_argument(
        '--no-resume',
        action='store_true',
        help='Do not resume from saved progress (start fresh)'
    )
    parser.add_argument(
        '--force-reprocess',
        action='store_true',
        help='Reprocess rows even if they already have key concepts'
    )
    parser.add_argument(
        '--reset-progress',
        action='store_true',
        help='Reset progress file and start from beginning'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Rehearse only: log the cells that would be written, write nothing'
    )

    args = parser.parse_args()

    print("[*] Key Concepts Updater")
    print("=" * 80)

    # Reset progress if requested
    if args.reset_progress:
        if os.path.exists(PROGRESS_FILE):
            os.remove(PROGRESS_FILE)
            print(f"[*] Progress file '{PROGRESS_FILE}' has been reset")

    # Load schema
    print("[*] Loading schema.json...")
    schema = load_schema()

    # Setup connections
    print("[*] Connecting to Google Sheets...")
    spreadsheet = setup_google_sheets()

    print("[*] Initializing Gemini 2.0 Flash...")
    model = setup_gemini()

    # Process rows
    resume = not args.no_resume
    summary = process_rows(
        spreadsheet,
        model,
        schema,
        start_row=args.start,
        limit=args.limit,
        resume=resume,
        force_reprocess=args.force_reprocess,
        dry_run=args.dry_run,
    )

    print("\n[*] Script complete!")
    print("[*] To continue processing, run: poetry run python -m rosen_scraper.key_concepts_updater")
    print("[*] To start over, run: poetry run python -m rosen_scraper.key_concepts_updater --reset-progress")

    # The "$0.53 wasted" guard: a live run that spent Gemini calls but wrote
    # zero cells means the AI ran and nothing was saved. Fail loudly so the
    # Action shows red instead of a green run that quietly changed nothing.
    if not summary['dry_run'] and summary['gemini_calls'] > 0 and summary['writes'] == 0:
        print(f"\n[FATAL] Made {summary['gemini_calls']} Gemini call(s) but wrote 0 cells "
              "-- refusing to report success.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
