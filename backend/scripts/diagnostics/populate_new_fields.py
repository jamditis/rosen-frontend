# -*- coding: utf-8 -*-
"""
Populate New Schema Fields

This script populates the newly added fields (platform, collection_id, permissions,
transcript_filepath, verified, notes) for existing records in the Google Sheet.
"""

import os
import re
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv
import gspread

from rosen_scraper.logger import init_logger
from rosen_scraper.entity_resolver import load_known_entities, resolve_platform
from rosen_scraper.permissions_config import PAYWALLED_DOMAINS

# Anchored to backend/ via the script's own location, so the curated
# known_entities.json resolves correctly regardless of the working directory.
ROOT_DIR = Path(__file__).resolve().parents[2]
KNOWN_ENTITIES_FILE = ROOT_DIR / "known_entities.json"
TRANSCRIPTS_DIR = ROOT_DIR / "processed_transcripts"

load_dotenv()

def generate_collection_id(record):
    """Generate collection ID based on content patterns."""
    series = record.get('series', '')
    if series and series.strip():
        collection_base = re.sub(r'[^A-Z0-9]', '', series.upper())[:10]
        return f"SERIES-{collection_base}"

    # Check for recurring themes
    thematic_cats = record.get('thematic_categories', '')
    if 'Journalism Education' in str(thematic_cats):
        return "COLLECTION-EDUCATION"
    elif 'Press & Media Criticism' in str(thematic_cats):
        return "COLLECTION-CRITICISM"
    elif 'Technology & Digital Media' in str(thematic_cats):
        return "COLLECTION-DIGITAL"
    elif 'Politics & Democracy' in str(thematic_cats):
        return "COLLECTION-POLITICS"
    elif 'Audience & Public Engagement' in str(thematic_cats):
        return "COLLECTION-AUDIENCE"

    return ""

def determine_permissions(url):
    """Determine permission status based on source."""
    domain = urlparse(url).netloc.lower()

    # Known permissive sources
    permissive_domains = [
        'pressthink.org',  # Jay Rosen's own blog
        'twitter.com',
        'medium.com',
        'substack.com'
    ]

    if any(domain.endswith(perm_domain) for perm_domain in permissive_domains):
        return "Open Access"

    # Paywall/premium sources
    if domain in PAYWALLED_DOMAINS:
        return "Premium/Subscription Required"

    # Academic or institutional sources
    if any(suffix in domain for suffix in ['.edu', '.org']):
        return "Educational Use"

    return "Standard Copyright"

def determine_platform(url, known_entities):
    """Determine platform name from URL."""
    # Use existing entity resolver
    platform = resolve_platform(url, known_entities)
    if platform:
        return platform

    # Fallback logic
    domain = urlparse(url).netloc
    platform = re.sub(r'^(www\.)?(.+?)\..+$', r'\2', domain).capitalize()
    return platform

def find_transcript_filepath(record_id, format_type):
    """Find transcript filepath if it exists."""
    if format_type in ['video', 'audio']:
        # Check common transcript locations
        transcript_paths = [
            str(TRANSCRIPTS_DIR / f"{record_id}.txt"),
            str(TRANSCRIPTS_DIR / f"{record_id}_transcript.txt"),
            str(ROOT_DIR / "transcripts" / f"{record_id}.txt")
        ]

        for path in transcript_paths:
            if os.path.exists(path):
                return path

    return ""

def populate_new_fields(dry_run=True):
    """
    Populate new fields for existing records.

    Args:
        dry_run: If True, only show what would be changed without making updates
    """
    logger = init_logger("field_population_logs")
    logger.logger.info(f"Starting field population {'(DRY RUN)' if dry_run else '(LIVE RUN)'}")

    try:
        # Load known entities
        known_entities = load_known_entities(str(KNOWN_ENTITIES_FILE))
        if not known_entities:
            logger.log_error("configuration", "Could not load known entities")
            return

        # Connect to Google Sheets
        credentials_filename = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
        credentials_path = ROOT_DIR / credentials_filename
        gc = gspread.service_account(filename=str(credentials_path))
        sh = gc.open(os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List"))
        worksheet = sh.worksheet("test_runs")

        # Get all current data
        all_records = worksheet.get_all_records()
        logger.logger.info(f"Found {len(all_records)} records to process")

        # Get header row to find column positions
        headers = worksheet.row_values(1)

        # Find column indices for new fields
        field_columns = {}
        new_fields = ['platform', 'collection_id', 'permissions', 'transcript_filepath', 'verified', 'notes']

        for field in new_fields:
            try:
                field_columns[field] = headers.index(field) + 1  # +1 for 1-based indexing
                logger.logger.info(f"Found {field} at column {field_columns[field]}")
            except ValueError:
                logger.log_error("field_mapping", f"Field {field} not found in headers")
                return

        # Process records and prepare updates
        updates = []
        stats = {
            'processed': 0,
            'platform_populated': 0,
            'collection_populated': 0,
            'permissions_populated': 0,
            'transcript_populated': 0,
            'verified_set': 0
        }

        for i, record in enumerate(all_records):
            row_num = i + 2  # +2 for 1-based indexing and header row

            try:
                # Skip if record doesn't have URL
                url = record.get('url', '')
                if not url:
                    continue

                record_id = record.get('id', '')
                format_type = record.get('format', 'text')

                # Generate new field values
                new_values = {}

                # Platform field
                if not record.get('platform', '').strip():
                    platform = determine_platform(url, known_entities)
                    new_values['platform'] = platform
                    stats['platform_populated'] += 1

                # Collection ID field
                if not record.get('collection_id', '').strip():
                    collection_id = generate_collection_id(record)
                    new_values['collection_id'] = collection_id
                    if collection_id:
                        stats['collection_populated'] += 1

                # Permissions field
                if not record.get('permissions', '').strip():
                    permissions = determine_permissions(url)
                    new_values['permissions'] = permissions
                    stats['permissions_populated'] += 1

                # Transcript filepath field
                if not record.get('transcript_filepath', '').strip():
                    transcript_path = find_transcript_filepath(record_id, format_type)
                    new_values['transcript_filepath'] = transcript_path
                    if transcript_path:
                        stats['transcript_populated'] += 1

                # Verified field (set to False for existing records if empty)
                if not record.get('verified', ''):
                    new_values['verified'] = 'FALSE'
                    stats['verified_set'] += 1

                # Notes field (leave empty by default)
                if not record.get('notes', ''):
                    new_values['notes'] = ''

                # Prepare batch update if we have changes
                if new_values:
                    for field, value in new_values.items():
                        col = field_columns[field]
                        updates.append({
                            'range': f'R{row_num}C{col}',
                            'values': [[str(value)]]
                        })

                stats['processed'] += 1

                # Log progress
                if stats['processed'] % 100 == 0:
                    logger.logger.info(f"Processed {stats['processed']}/{len(all_records)} records")

            except Exception as e:
                logger.log_error("record_processing", f"Error processing record {i}: {e}")
                continue

        # Show results
        logger.logger.info("Field Population Summary:")
        logger.logger.info(f"  Total records processed: {stats['processed']}")
        logger.logger.info(f"  Platform fields populated: {stats['platform_populated']}")
        logger.logger.info(f"  Collection IDs created: {stats['collection_populated']}")
        logger.logger.info(f"  Permissions determined: {stats['permissions_populated']}")
        logger.logger.info(f"  Transcript paths found: {stats['transcript_populated']}")
        logger.logger.info(f"  Verified flags set: {stats['verified_set']}")
        logger.logger.info(f"  Total updates to make: {len(updates)}")

        if dry_run:
            logger.logger.info("DRY RUN: No changes made to Google Sheets")

            # Show sample updates
            logger.logger.info("\nSample updates that would be made:")
            for update in updates[:10]:  # Show first 10 updates
                logger.logger.info(f"  {update['range']}: {update['values'][0][0]}")

        else:
            # Perform batch updates
            if updates:
                logger.logger.info("Applying updates to Google Sheets...")

                # Split into smaller batches to avoid API limits
                batch_size = 100
                for i in range(0, len(updates), batch_size):
                    batch = updates[i:i+batch_size]
                    try:
                        worksheet.batch_update(batch, value_input_option='RAW')
                        logger.logger.info(f"Applied batch {i//batch_size + 1}/{(len(updates) + batch_size - 1)//batch_size}")
                    except Exception as e:
                        logger.log_error("batch_update", f"Error in batch update: {e}")

                logger.logger.info("Field population completed successfully!")
            else:
                logger.logger.info("No updates needed - all fields already populated")

        return stats

    except Exception as e:
        logger.log_error("population_error", f"Error during field population: {e}")
        return None

def main():
    """Main function with command line handling."""
    import argparse

    parser = argparse.ArgumentParser(description='Populate new schema fields for existing records')
    parser.add_argument('--live', action='store_true', help='Perform live updates (default is dry run)')
    parser.add_argument('--batch-size', type=int, default=100, help='Batch size for updates')

    args = parser.parse_args()

    print("=" * 50)
    print("ROSEN ARCHIVE - FIELD POPULATION")
    print("=" * 50)

    if args.live:
        print("[!] LIVE RUN MODE - Changes will be made to Google Sheets")
        response = input("Are you sure you want to continue? (yes/no): ")
        if response.lower() != 'yes':
            print("Operation cancelled.")
            return
    else:
        print("[*] DRY RUN MODE - No changes will be made")

    stats = populate_new_fields(dry_run=not args.live)

    if stats:
        print("\n[+] Process completed successfully!")
        print(f"Total records processed: {stats['processed']}")
    else:
        print("\n[-] Process failed - check logs for details")

if __name__ == "__main__":
    main()
