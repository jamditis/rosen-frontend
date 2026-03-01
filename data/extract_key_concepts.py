#!/usr/bin/env python3
"""
Extract key concepts for archive records that are missing them.

Uses claude -p via subprocess, batching 5 records per call.
Accepts --start and --end index args for parallel dispatch.

Usage:
    python3 data/extract_key_concepts.py              # all records
    python3 data/extract_key_concepts.py --start 0 --end 75
"""
import csv
import json
import subprocess
import sys
import os
import argparse
import time

CSV_PATH = os.path.join(os.path.dirname(__file__), 'archive_records-public.csv')
RESULTS_DIR = os.path.join(os.path.dirname(__file__), '_extract_tmp')
BATCH_SIZE = 5

# Jay Rosen's known key concepts/frameworks (to guide extraction)
KNOWN_CONCEPTS = (
    "View from Nowhere, Horse-race journalism, False balance, He said/she said journalism, "
    "The Citizens' Agenda, Church of the Savvy, The Production of Innocence, "
    "Audience atomization overcome, The People Formerly Known as the Audience, "
    "Verification in reverse, Campaign coverage, Objectivity, Public journalism, "
    "Civic journalism, Press criticism, Savvy journalism, Rollout journalism, "
    "Wikiality, TNR-style reporting, Daily-me problem, Prediction markets in news"
)


def call_claude(prompt: str, retries: int = 2) -> str:
    env = os.environ.copy()
    env.pop('CLAUDECODE', None)  # allow nested claude -p call
    for attempt in range(retries + 1):
        try:
            result = subprocess.run(
                ['claude', '-p', prompt],
                capture_output=True, text=True, timeout=90, env=env
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
            if attempt < retries:
                time.sleep(3)
        except subprocess.TimeoutExpired:
            if attempt < retries:
                time.sleep(5)
    return ''


def extract_batch(records: list) -> list:
    """Extract key concepts for a batch of records. Returns list of concept strings (same order)."""
    items = []
    for i, r in enumerate(records, 1):
        text = (r.get('summary') or r.get('excerpt') or r.get('raw_text') or '').strip()
        text_snip = text[:500]
        items.append(f"{i}. Title: {r['title']}\n   Summary: {text_snip}")

    numbered = '\n\n'.join(items)
    prompt = (
        f"Jay Rosen is a journalism professor whose work engages specific intellectual frameworks and concepts. "
        f"Known concepts include: {KNOWN_CONCEPTS}.\n\n"
        f"For each of the following {len(records)} archive records, identify 1-4 of Jay Rosen's key concepts "
        f"or intellectual frameworks that the piece engages with. Use exact concept names where they apply. "
        f"If new or unlisted concepts appear, name them concisely.\n\n"
        f"Output ONLY a valid JSON array with exactly {len(records)} strings. Each string is a comma-separated "
        f"list of concept names for that record. No other text.\n\n"
        f"Records:\n{numbered}"
    )

    raw = call_claude(prompt)
    if not raw:
        return [''] * len(records)

    try:
        start = raw.find('[')
        end = raw.rfind(']') + 1
        if start >= 0 and end > start:
            concepts = json.loads(raw[start:end])
            if isinstance(concepts, list) and len(concepts) == len(records):
                return [str(c).strip() for c in concepts]
    except (json.JSONDecodeError, ValueError):
        pass

    return [''] * len(records)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--end', type=int, default=None)
    args = parser.parse_args()

    os.makedirs(RESULTS_DIR, exist_ok=True)

    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    # Filter to records missing key_concepts; skip Social Media Thread (out of scope)
    missing = [
        (i, r) for i, r in enumerate(rows)
        if not (r.get('key_concepts') or '').strip()
        and r.get('content_type') != 'Social Media Thread'
    ]

    end = args.end if args.end is not None else len(missing)
    subset = missing[args.start:end]

    print(f'Processing {len(subset)} records (indices {args.start}:{end})')

    results = {}  # row_index -> concepts string

    for batch_start in range(0, len(subset), BATCH_SIZE):
        batch = subset[batch_start:batch_start + BATCH_SIZE]
        batch_records = [r for _, r in batch]
        batch_indices = [i for i, _ in batch]

        print(f'  Batch {batch_start // BATCH_SIZE + 1}: rows {batch_indices[0]}-{batch_indices[-1]}', flush=True)

        concepts = extract_batch(batch_records)

        for (row_i, _), concept in zip(batch, concepts):
            results[row_i] = concept

    out_file = os.path.join(RESULTS_DIR, f'key_concepts_{args.start}_{end}.json')
    with open(out_file, 'w') as f:
        json.dump(results, f, indent=2)

    filled = sum(1 for c in results.values() if c)
    print(f'Done. {filled}/{len(subset)} concepts extracted → {out_file}')


if __name__ == '__main__':
    main()
