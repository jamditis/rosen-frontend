#!/usr/bin/env python3
"""
Update existing CLIP records in archive CSV with improved metadata.

Fixes:
- Era names (non-standard → archive standard)
- Category separators (semicolons → commas)
- Adds key_concepts from batch processing
- Updates summaries, excerpts, pull_quotes where batch data is richer

Matches by URL or title (case-insensitive).

Usage:
    python3 backend/update_clippings.py [--dry-run]
"""

import json
import csv
import sys
import os
from pathlib import Path


# Standard era mapping
ERA_MAP = {
    'Early Career & Public Journalism (1990-1999)': None,  # use year-based
    'Blogging Launch & Digital Disruption (2000-2004)': 'Web & Blogging (00s)',
    'Peak Blogging & Citizen Journalism (2005-2009)': 'Web & Blogging (00s)',
    'Social Media & Financial Crisis (2010-2015)': 'View from Nowhere (10s)',
    'Trump Era & Post-Truth Media (2016-2020)': 'Democracy in Crisis (20s)',
    'Platform Transition & Future Models (2021-Present)': 'Democracy in Crisis (20s)',
}


def get_era_from_year(year_str):
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


def fix_categories(cats_str):
    """Convert semicolons to commas and normalize spacing."""
    if not cats_str:
        return ''
    # Replace semicolons with commas
    cats_str = cats_str.replace(';', ',')
    # Normalize spacing
    parts = [c.strip() for c in cats_str.split(',') if c.strip()]
    return ', '.join(parts)


def load_batches(backend_dir):
    """Load all batch files and index by URL and title."""
    by_url = {}
    by_title = {}
    for i in range(1, 5):
        path = backend_dir / f'clipping_batch_{i}.json'
        if not path.exists():
            continue
        with open(path) as f:
            for record in json.load(f):
                url = record.get('url', '').strip()
                title = record.get('title', '').strip().lower()
                if url:
                    by_url[url] = record
                if title:
                    by_title[title] = record
    return by_url, by_title


def main():
    dry_run = '--dry-run' in sys.argv
    backend_dir = Path(__file__).parent
    csv_path = backend_dir.parent / 'data' / 'archive_records-public.csv'

    print('=== Update CLIP records ===\n')

    # Load batch data
    print('Loading batch data...')
    by_url, by_title = load_batches(backend_dir)
    print(f'  {len(by_url)} records indexed by URL')
    print(f'  {len(by_title)} records indexed by title')

    # Read entire CSV
    print(f'\nReading {csv_path}...')
    rows = []
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            rows.append(row)
    print(f'  {len(rows)} total rows')

    clip_count = sum(1 for r in rows if r['id'].startswith('CLIP-'))
    print(f'  {clip_count} CLIP records')

    # Update CLIP records
    updated = 0
    era_fixed = 0
    cats_fixed = 0
    concepts_added = 0
    summary_updated = 0
    matched = 0

    for row in rows:
        if not row['id'].startswith('CLIP-'):
            continue

        changed = False

        # Find matching batch record
        url = row.get('url', '').strip()
        title = row.get('title', '').strip().lower()
        batch = by_url.get(url) or by_title.get(title)

        if batch:
            matched += 1

        # Fix era name
        current_era = row.get('era', '')
        if current_era in ERA_MAP:
            if ERA_MAP[current_era] is not None:
                new_era = ERA_MAP[current_era]
            else:
                # Derive from year
                date = row.get('publication_date', '')
                year = date.split('-')[0] if '-' in date else ''
                new_era = get_era_from_year(year)
            if new_era and new_era != current_era:
                row['era'] = new_era
                era_fixed += 1
                changed = True
        elif batch and batch.get('era'):
            # Use batch era if current is empty or non-standard
            if not current_era or current_era not in [
                'Public Journalism (90s)', 'Web & Blogging (00s)',
                'View from Nowhere (10s)', 'Democracy in Crisis (20s)'
            ]:
                row['era'] = batch['era']
                era_fixed += 1
                changed = True

        # Fix category separators
        current_cats = row.get('thematic_categories', '')
        if ';' in current_cats:
            row['thematic_categories'] = fix_categories(current_cats)
            cats_fixed += 1
            changed = True

        # Add key_concepts from batch if missing
        if not row.get('key_concepts', '').strip() and batch:
            concepts = batch.get('key_concepts', '').strip()
            if concepts:
                row['key_concepts'] = concepts
                concepts_added += 1
                changed = True

        # Update summary if batch has a richer one
        if batch:
            current_summary = row.get('summary', '').strip()
            batch_summary = batch.get('summary', '').strip()
            if batch_summary and len(batch_summary) > len(current_summary) + 20:
                row['summary'] = batch_summary
                summary_updated += 1
                changed = True

            # Add pull_quote if missing
            if not row.get('pull_quote', '').strip():
                pq = batch.get('pull_quote', '').strip()
                if pq:
                    row['pull_quote'] = pq
                    changed = True

            # Update excerpt if batch has a richer one
            current_excerpt = row.get('excerpt', '').strip()
            batch_excerpt = batch.get('excerpt', '').strip()
            if batch_excerpt and len(batch_excerpt) > len(current_excerpt) + 20:
                row['excerpt'] = batch_excerpt
                changed = True

        if changed:
            updated += 1

    print(f'\n--- Results ---')
    print(f'Matched to batch data: {matched} of {clip_count}')
    print(f'Records updated: {updated}')
    print(f'  Era names fixed: {era_fixed}')
    print(f'  Category separators fixed: {cats_fixed}')
    print(f'  Key concepts added: {concepts_added}')
    print(f'  Summaries enriched: {summary_updated}')

    if dry_run:
        print(f'\n[DRY RUN] No changes written.')
        # Show sample
        for row in rows:
            if row['id'] == 'CLIP-00001':
                print(f'\nSample updated record:')
                for key in ['id', 'title', 'era', 'thematic_categories', 'key_concepts']:
                    print(f'  {key}: {row.get(key, "")}')
                break
        return

    # Write updated CSV
    print(f'\nWriting updated CSV...')
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    print(f'Done! Updated {updated} CLIP records.')
    print(f'\nNext step: run "node data/export-archive-data.js" to regenerate JSON files.')


if __name__ == '__main__':
    main()
