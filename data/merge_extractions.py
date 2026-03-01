#!/usr/bin/env python3
"""
Merge extraction results from parallel agents back into the archive CSV.

Reads all _extract_tmp/pull_quotes_*.json and _extract_tmp/key_concepts_*.json
files and patches archive_records-public.csv in place.

Usage:
    python3 data/merge_extractions.py
"""
import csv
import json
import os
import glob

CSV_PATH = os.path.join(os.path.dirname(__file__), 'archive_records-public.csv')
RESULTS_DIR = os.path.join(os.path.dirname(__file__), '_extract_tmp')


def load_results(pattern: str) -> dict:
    """Load and merge all JSON result files matching the pattern."""
    merged = {}
    for path in glob.glob(os.path.join(RESULTS_DIR, pattern)):
        with open(path) as f:
            data = json.load(f)
        # Keys are row indices as strings
        for k, v in data.items():
            merged[int(k)] = v
    return merged


def main():
    pull_quotes = load_results('pull_quotes_*.json')
    key_concepts = load_results('key_concepts_*.json')

    print(f'Loaded pull_quote results: {len(pull_quotes)} entries')
    print(f'Loaded key_concept results: {len(key_concepts)} entries')

    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    pq_applied = 0
    kc_applied = 0

    for i, row in enumerate(rows):
        if i in pull_quotes and not (row.get('pull_quote') or '').strip():
            quote = pull_quotes[i]
            if quote:
                row['pull_quote'] = quote
                pq_applied += 1

        if i in key_concepts and not (row.get('key_concepts') or '').strip():
            concept = key_concepts[i]
            if concept:
                row['key_concepts'] = concept
                kc_applied += 1

    with open(CSV_PATH, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f'Applied {pq_applied} pull quotes, {kc_applied} key concepts to CSV.')

    # Report remaining gaps
    missing_pq = sum(1 for r in rows if not (r.get('pull_quote') or '').strip())
    missing_kc = sum(1 for r in rows if not (r.get('key_concepts') or '').strip()
                     and r.get('content_type') != 'Social Media Thread')
    print(f'Remaining gaps: {missing_pq} pull_quote, {missing_kc} key_concepts (excl. threads)')


if __name__ == '__main__':
    main()
