#!/usr/bin/env python3
"""
Merge Thread Records into Main Archive

Adds the 10 THREAD-* records from thread_records.csv into the main
archive_records-public.csv file with proper schema alignment.

Author: Claude Code
Date: 2025-12-03
"""

import csv
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Dict

def load_thread_records(thread_csv: Path) -> List[Dict]:
    """Load thread records from CSV."""
    threads = []
    with open(thread_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            threads.append(row)
    return threads

def load_main_archive(archive_csv: Path) -> List[Dict]:
    """Load main archive records from CSV."""
    records = []
    with open(archive_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(row)
    return records

def align_thread_to_schema(thread: Dict, schema_headers: List[str]) -> Dict:
    """
    Align thread record to match the 36-column main archive schema.

    Thread CSV columns (26):
    id, collection_id, title, author, publication, publication_date, url, summary,
    content_type, scope, format, word_count, era, categories, tags, key_concepts,
    platforms, copyright, verified, date_added, date_modified, date_processed,
    notes, raw_text, quote, thread_data

    Main archive columns (36):
    id, title, url, author, publication_date, original_publication, publisher,
    platform, collection_id, content_type, format, word_count, length_in_seconds,
    excerpt, summary, thematic_categories, key_concepts, series, era, scope, tags,
    related_to, responds_to, influence, copyright, license, permissions,
    date_processed, gdrive_pdf_link, gdrive_raw_file_link, gdrive_transcript_link,
    transcript_filepath, pull_quote, raw_text, verified, notes
    """
    aligned = {}

    # Direct mappings
    aligned['id'] = thread.get('id', '')
    aligned['title'] = thread.get('title', '')
    aligned['url'] = thread.get('url', '')
    aligned['author'] = thread.get('author', '')
    aligned['publication_date'] = thread.get('publication_date', '')
    aligned['summary'] = thread.get('summary', '')
    aligned['content_type'] = thread.get('content_type', '')
    aligned['scope'] = thread.get('scope', '')
    aligned['format'] = thread.get('format', '')
    aligned['word_count'] = thread.get('word_count', '0')
    aligned['era'] = thread.get('era', '')
    aligned['tags'] = thread.get('tags', '')
    aligned['copyright'] = thread.get('copyright', '')
    aligned['verified'] = thread.get('verified', '')
    aligned['date_processed'] = thread.get('date_processed', '')
    aligned['notes'] = thread.get('notes', '')
    aligned['raw_text'] = thread.get('raw_text', '')
    aligned['collection_id'] = thread.get('collection_id', '')

    # Field mappings (different names)
    aligned['original_publication'] = thread.get('publication', '')  # publication -> original_publication
    aligned['publisher'] = thread.get('publication', '')  # publication -> publisher
    aligned['platform'] = thread.get('platforms', '')  # platforms -> platform
    aligned['thematic_categories'] = thread.get('categories', '')  # categories -> thematic_categories
    aligned['key_concepts'] = thread.get('key_concepts', '')
    aligned['pull_quote'] = thread.get('quote', '')  # quote -> pull_quote

    # Add thread_data to notes field
    thread_data = thread.get('thread_data', '')
    if thread_data:
        existing_notes = aligned.get('notes', '')
        if existing_notes:
            aligned['notes'] = f"{existing_notes} | thread_data: {thread_data}"
        else:
            aligned['notes'] = f"thread_data: {thread_data}"

    # Fields not in thread CSV - fill with empty values
    aligned['length_in_seconds'] = ''
    aligned['excerpt'] = ''
    aligned['series'] = ''
    aligned['related_to'] = ''
    aligned['responds_to'] = ''
    aligned['influence'] = ''
    aligned['license'] = ''
    aligned['permissions'] = ''
    aligned['gdrive_pdf_link'] = ''
    aligned['gdrive_raw_file_link'] = ''
    aligned['gdrive_transcript_link'] = ''
    aligned['transcript_filepath'] = ''

    # Ensure all schema headers are present
    for header in schema_headers:
        if header not in aligned:
            aligned[header] = ''

    return aligned

def main():
    print("=" * 80)
    print("MERGE THREAD RECORDS INTO MAIN ARCHIVE")
    print("=" * 80)
    print()

    # Paths
    base_dir = Path(__file__).parent.parent.parent
    thread_csv = base_dir / "backend" / "output" / "thread_records.csv"
    archive_csv = base_dir / "data" / "archive_records-public.csv"
    backup_dir = base_dir / "data"

    # Schema headers (36 columns in correct order)
    schema_headers = [
        'id', 'title', 'url', 'author', 'publication_date', 'original_publication',
        'publisher', 'platform', 'collection_id', 'content_type', 'format',
        'word_count', 'length_in_seconds', 'excerpt', 'summary', 'thematic_categories',
        'key_concepts', 'series', 'era', 'scope', 'tags', 'related_to', 'responds_to',
        'influence', 'copyright', 'license', 'permissions', 'date_processed',
        'gdrive_pdf_link', 'gdrive_raw_file_link', 'gdrive_transcript_link',
        'transcript_filepath', 'pull_quote', 'raw_text', 'verified', 'notes'
    ]

    # Load data
    print("Loading data...")
    thread_records = load_thread_records(thread_csv)
    main_records = load_main_archive(archive_csv)

    print(f"✓ Loaded {len(thread_records)} thread records")
    print(f"✓ Loaded {len(main_records)} main archive records")
    print()

    # Check for ID conflicts
    main_ids = {r['id'] for r in main_records}
    thread_ids = {t['id'] for t in thread_records}
    conflicts = main_ids & thread_ids

    if conflicts:
        print(f"⚠ WARNING: {len(conflicts)} ID conflicts found:")
        for conflict_id in sorted(conflicts):
            print(f"  - {conflict_id}")
        print()
        response = input("Continue anyway? (yes/no): ").strip().lower()
        if response != 'yes':
            print("Merge cancelled.")
            return 1

    # Backup main archive
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"archive_records-public_backup_{timestamp}.csv"

    print(f"Creating backup: {backup_path.name}")
    shutil.copy2(archive_csv, backup_path)
    print("✓ Backup created")
    print()

    # Align thread records to schema
    print("Aligning thread records to archive schema...")
    aligned_threads = []
    for thread in thread_records:
        aligned = align_thread_to_schema(thread, schema_headers)
        aligned_threads.append(aligned)

    print(f"✓ Aligned {len(aligned_threads)} thread records")
    print()

    # Merge records
    all_records = main_records + aligned_threads

    print(f"Total records after merge: {len(all_records)}")
    print()

    # Write merged CSV
    print(f"Writing merged archive to {archive_csv.name}...")
    with open(archive_csv, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=schema_headers, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(all_records)

    print("✓ Merged archive written")
    print()

    # Summary
    print("=" * 80)
    print("MERGE COMPLETE")
    print("=" * 80)
    print(f"Records before: {len(main_records)}")
    print(f"Thread records: {len(aligned_threads)}")
    print(f"Records after: {len(all_records)}")
    print()
    print(f"Backup saved: {backup_path}")
    print(f"Updated archive: {archive_csv}")
    print()

    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main())
