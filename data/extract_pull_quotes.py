#!/usr/bin/env python3
"""
Extract pull quotes for archive records that are missing them.

Uses claude -p via subprocess, batching 5 records per call.
Accepts --start and --end index args for parallel dispatch.

Usage:
    python3 data/extract_pull_quotes.py              # all records
    python3 data/extract_pull_quotes.py --start 0 --end 75
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

# Jay Rosen's key frameworks for context
CONTEXT = (
    "Jay Rosen is a journalism professor and critic whose archive covers press criticism, "
    "media theory, political journalism, and the future of news."
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
    """Extract pull quotes for a batch of records. Returns list of quotes (same order)."""
    items = []
    for i, r in enumerate(records, 1):
        text = (r.get('summary') or r.get('excerpt') or r.get('raw_text') or '').strip()
        text_snip = text[:600]
        items.append(f"{i}. Title: {r['title']}\n   Summary/Text: {text_snip}")

    numbered = '\n\n'.join(items)
    prompt = (
        f"{CONTEXT}\n\n"
        f"For each of the following {len(records)} archive records, extract ONE representative sentence "
        f"or short passage (1-2 sentences max) that best captures the central insight or argument. "
        f"This can be paraphrased from the summary if no verbatim quote is available.\n\n"
        f"Output ONLY a valid JSON array with exactly {len(records)} strings, one per record, in order. "
        f"No other text.\n\n"
        f"Records:\n{numbered}"
    )

    raw = call_claude(prompt)
    if not raw:
        return [''] * len(records)

    # Parse JSON array from response
    try:
        # Find the JSON array in the output
        start = raw.find('[')
        end = raw.rfind(']') + 1
        if start >= 0 and end > start:
            quotes = json.loads(raw[start:end])
            if isinstance(quotes, list) and len(quotes) == len(records):
                return [str(q).strip() for q in quotes]
    except (json.JSONDecodeError, ValueError):
        pass

    # Fallback: try to split on numbered lines
    return [''] * len(records)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--end', type=int, default=None)
    args = parser.parse_args()

    os.makedirs(RESULTS_DIR, exist_ok=True)

    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
        fieldnames = csv.DictReader(open(CSV_PATH)).fieldnames

    # Filter to records missing pull_quote
    missing = [(i, r) for i, r in enumerate(rows) if not (r.get('pull_quote') or '').strip()]

    # Apply slice
    end = args.end if args.end is not None else len(missing)
    subset = missing[args.start:end]

    print(f'Processing {len(subset)} records (indices {args.start}:{end})')

    results = {}  # row_index -> quote

    for batch_start in range(0, len(subset), BATCH_SIZE):
        batch = subset[batch_start:batch_start + BATCH_SIZE]
        batch_records = [r for _, r in batch]
        batch_indices = [i for i, _ in batch]

        print(f'  Batch {batch_start // BATCH_SIZE + 1}: records {batch_indices[0]}-{batch_indices[-1]}', flush=True)

        quotes = extract_batch(batch_records)

        for (row_i, _), quote in zip(batch, quotes):
            results[row_i] = quote

    # Write results to temp file
    out_file = os.path.join(RESULTS_DIR, f'pull_quotes_{args.start}_{end}.json')
    with open(out_file, 'w') as f:
        json.dump(results, f, indent=2)

    filled = sum(1 for q in results.values() if q)
    print(f'Done. {filled}/{len(subset)} quotes extracted → {out_file}')


if __name__ == '__main__':
    main()
