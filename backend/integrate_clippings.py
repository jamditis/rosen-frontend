#!/usr/bin/env python3
"""
Integrate processed newspaper clipping records into the archive CSV.

Reads batch output files from the subagent processing pipeline,
deduplicates, re-numbers IDs, and appends to archive_records-public.csv.

Usage:
    python3 backend/integrate_clippings.py [--dry-run]
"""

import json
import csv
import sys
import os
from pathlib import Path
from datetime import datetime


# Era mapping based on year
def get_era(year_str):
    try:
        year = int(year_str)
    except (ValueError, TypeError):
        return ''
    if year < 2000:
        return 'Public Journalism (90s)'
    elif year < 2010:
        return 'Web & Blogging (00s)'
    elif year < 2020:
        return 'View from Nowhere (10s)'
    else:
        return 'Democracy in Crisis (20s)'


# CSV columns in the archive
CSV_COLUMNS = [
    'id', 'title', 'url', 'author', 'publication_date', 'original_publication',
    'publisher', 'platform', 'collection_id', 'content_type', 'format',
    'word_count', 'length_in_seconds', 'excerpt', 'summary',
    'thematic_categories', 'key_concepts', 'series', 'era', 'scope',
    'tags', 'related_to', 'responds_to', 'influence', 'copyright',
    'license', 'permissions', 'date_processed', 'gdrive_pdf_link',
    'gdrive_raw_file_link', 'gdrive_transcript_link', 'transcript_filepath',
    'pull_quote', 'raw_text', 'verified', 'notes', 'low_confidence',
    'needs_review'
]


def load_batch(path):
    """Load a batch JSON file."""
    if not os.path.exists(path):
        print(f'  Skipping {path} (not found)')
        return []
    with open(path) as f:
        data = json.load(f)
    print(f'  Loaded {len(data)} records from {os.path.basename(path)}')
    return data


def deduplicate(records):
    """Remove duplicate records based on URL + publication_date."""
    seen = set()
    unique = []
    for r in records:
        key = (r.get('url', ''), r.get('publication_date', ''), r.get('title', ''))
        if key not in seen:
            seen.add(key)
            unique.append(r)
        else:
            print(f'  Duplicate removed: {r.get("title", "?")} ({r.get("publication_date", "?")})')
    return unique


def normalize_date(date_str):
    """Convert MM/DD/YYYY to YYYY-MM-DD format to match archive CSV."""
    if not date_str:
        return ''
    parts = date_str.split('/')
    if len(parts) == 3:
        month, day, year = parts
        return f'{year}-{month.zfill(2)}-{day.zfill(2)}'
    return date_str  # already in ISO or unknown format


def convert_to_csv_row(record, new_id):
    """Convert a clipping record to archive CSV format."""
    year = record.get('year', '')
    if not year and record.get('publication_date'):
        parts = record['publication_date'].split('/')
        if len(parts) == 3:
            year = parts[2]

    era = record.get('era', '') or get_era(year)
    pub = record.get('original_publication', '')

    return {
        'id': new_id,
        'title': record.get('title', ''),
        'url': record.get('url', ''),
        'author': record.get('author', ''),
        'publication_date': normalize_date(record.get('publication_date', '')),
        'original_publication': pub,
        'publisher': pub,
        'platform': 'newspaper',
        'collection_id': '',
        'content_type': 'Newspaper Clipping',
        'format': 'text',
        'word_count': '',
        'length_in_seconds': '',
        'excerpt': record.get('excerpt', ''),
        'summary': record.get('summary', ''),
        'thematic_categories': record.get('thematic_categories', ''),
        'key_concepts': record.get('key_concepts', ''),
        'series': '',
        'era': era,
        'scope': 'National' if pub in ['USA Today'] else 'Regional',
        'tags': record.get('tags', ''),
        'related_to': '',
        'responds_to': '',
        'influence': '',
        'copyright': record.get('copyright', f'© {pub}. Available via newspapers.com.'),
        'license': '',
        'permissions': '',
        'date_processed': datetime.now().strftime('%m/%d/%Y'),
        'gdrive_pdf_link': '',
        'gdrive_raw_file_link': '',
        'gdrive_transcript_link': '',
        'transcript_filepath': '',
        'pull_quote': record.get('pull_quote', ''),
        'raw_text': '',
        # Clippings remain visible to the exporter while carrying a separate,
        # explicit human-review signal.
        'verified': 'TRUE',
        'notes': record.get('notes', ''),
        'low_confidence': '',
        'needs_review': 'true'
    }


def get_next_clip_id(csv_path):
    """Find the highest existing CLIP-XXXXX ID in the CSV."""
    max_id = 0
    if os.path.exists(csv_path):
        with open(csv_path) as f:
            reader = csv.DictReader(f)
            for row in reader:
                rid = row.get('id', '')
                if rid.startswith('CLIP-'):
                    try:
                        num = int(rid.split('-')[1])
                        max_id = max(max_id, num)
                    except ValueError:
                        pass
    return max_id + 1


def main():
    dry_run = '--dry-run' in sys.argv

    backend_dir = Path(__file__).parent
    data_dir = backend_dir.parent / 'data'
    csv_path = data_dir / 'archive_records-public.csv'

    print('=== Newspaper clipping integration ===\n')

    # Load all batch files
    print('Loading batch files...')
    all_records = []
    for i in range(1, 7):
        batch_path = backend_dir / f'clipping_batch_{i}.json'
        all_records.extend(load_batch(batch_path))

    if not all_records:
        print('\nNo records found. Make sure batch files exist.')
        return

    print(f'\nTotal records loaded: {len(all_records)}')

    # Deduplicate within batches
    print('\nDeduplicating within batches...')
    unique_records = deduplicate(all_records)
    print(f'Unique records: {len(unique_records)}')

    # Deduplicate against existing CSV
    print('\nDeduplicating against existing CSV...')
    existing_urls = set()
    existing_titles = set()
    if os.path.exists(csv_path):
        with open(csv_path) as f:
            for row in csv.DictReader(f):
                if row.get('id', '').startswith('CLIP-'):
                    existing_urls.add(row.get('url', '').strip())
                    existing_titles.add(row.get('title', '').strip().lower())
    new_records = []
    for r in unique_records:
        url = r.get('url', '').strip()
        title = r.get('title', '').strip().lower()
        if url in existing_urls or title in existing_titles:
            print(f'  Already in CSV: {r.get("title", "?")}')
        else:
            new_records.append(r)
    print(f'New records to add: {len(new_records)}')
    unique_records = new_records

    # Sort by date (normalize to ISO for proper chronological sorting)
    unique_records.sort(key=lambda r: normalize_date(r.get('publication_date', '')))

    # Get next available CLIP ID
    next_id = get_next_clip_id(csv_path)
    print(f'\nNext available CLIP ID: CLIP-{next_id:05d}')

    # Convert to CSV format
    csv_rows = []
    for i, record in enumerate(unique_records):
        new_id = f'CLIP-{next_id + i:05d}'
        csv_rows.append(convert_to_csv_row(record, new_id))

    # Year distribution
    years = {}
    for row in csv_rows:
        date = row['publication_date']
        if '-' in date:
            y = date.split('-')[0]
        elif '/' in date:
            parts = date.split('/')
            y = parts[2] if len(parts) == 3 else ''
        else:
            y = ''
        if y:
            years[y] = years.get(y, 0) + 1
    print(f'\nYear distribution:')
    for y in sorted(years.keys()):
        print(f'  {y}: {years[y]}')

    # Category distribution
    cats = {}
    for row in csv_rows:
        for c in row['thematic_categories'].split(','):
            c = c.strip()
            if c:
                cats[c] = cats.get(c, 0) + 1
    print(f'\nCategory distribution:')
    for c, count in sorted(cats.items(), key=lambda x: -x[1]):
        print(f'  {c}: {count}')

    if dry_run:
        print(f'\n[DRY RUN] Would append {len(csv_rows)} records to CSV.')
        print('Sample record:')
        print(json.dumps(csv_rows[0], indent=2))
        return

    # Append to CSV
    print(f'\nAppending {len(csv_rows)} records to {csv_path}...')
    with open(csv_path, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        for row in csv_rows:
            writer.writerow(row)

    print(f'Done! Added {len(csv_rows)} newspaper clipping records.')
    print(f'IDs: CLIP-{next_id:05d} through CLIP-{next_id + len(csv_rows) - 1:05d}')
    print(f'\nNext step: run "node data/export-archive-data.js" to regenerate JSON files.')


if __name__ == '__main__':
    main()
