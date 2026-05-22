#!/usr/bin/env python3
"""
Normalize thematic_categories in both archive CSVs.

Splits each cell on , or ;, maps tokens to canonical names,
deduplicates, rejoins with ", ".

Usage: python3 data/normalize-categories.py
"""
import csv
import os
import re

from csv_safe_write import atomic_csv_write

CANONICAL = {
    # Identity (already correct)
    'Audience & Public Engagement':   'Audience & Public Engagement',
    'Journalism Education':            'Journalism Education',
    'Journalism Theory & Practice':    'Journalism Theory & Practice',
    'Politics & Democracy':            'Politics & Democracy',
    'Press & Media Criticism':         'Press & Media Criticism',
    'Technology & Digital Media':      'Technology & Digital Media',

    # Variants to normalize
    'Academic & Institutional':        'Journalism Education',
    'Democracy & Public Life':         'Politics & Democracy',
    'Digital Media & Innovation':      'Technology & Digital Media',
    'Digital Media & Technology':      'Technology & Digital Media',
    'Education & Academia':            'Journalism Education',
    'Media & Technology':              'Technology & Digital Media',
    'Media Business & Economics':      'Technology & Digital Media',
    'Media Ethics':                    'Press & Media Criticism',
    'Political Communication':         'Politics & Democracy',
    'Press Criticism':                 'Press & Media Criticism',
    'Public Journalism Movement':      'Journalism Theory & Practice',
}

DATA_DIR = os.path.dirname(__file__)
FILES = [
    os.path.join(DATA_DIR, 'archive_records-public.csv'),
    os.path.join(DATA_DIR, 'social_posts.csv'),
]


def normalize_cell(raw: str) -> str:
    tokens = re.split(r'[;,]', raw.replace('[', '').replace(']', '').replace("'", '').replace('"', ''))
    seen = []
    seen_set = set()
    for token in tokens:
        token = token.strip()
        if not token:
            continue
        canonical = CANONICAL.get(token)
        if canonical is None:
            print(f'  WARNING: unknown category {token!r} — left unchanged')
            canonical = token
        if canonical not in seen_set:
            seen.append(canonical)
            seen_set.add(canonical)
    return ', '.join(seen)


def normalize_file(filepath: str) -> None:
    print(f'Normalizing {os.path.basename(filepath)}...')
    with open(filepath, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    changed = 0
    for row in rows:
        raw = row.get('thematic_categories', '')
        normalized = normalize_cell(raw)
        if normalized != raw:
            row['thematic_categories'] = normalized
            changed += 1

    with atomic_csv_write(filepath) as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f'  Updated {changed} of {len(rows)} rows.')


if __name__ == '__main__':
    for f in FILES:
        normalize_file(f)
    print('Done.')
