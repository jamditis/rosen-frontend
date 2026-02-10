"""
Fix the 44 records with "This collection of blog posts" sidebar-scrape summaries.

These records have generic summaries from the PressThink sidebar instead of
the actual article content. The raw_text field contains the correct content.

Strategy:
- Extract the first ~3 sentences from raw_text as a new summary
- Extract the first sentence as a new excerpt
- Prefix summaries with "Rosen" where appropriate
"""

import csv
import re
from pathlib import Path

CSV_PATH = Path(__file__).parent / "archive_records-public.csv"

SIDEBAR_MARKER = "This collection of blog posts"
GENERIC_EXCERPT = "You don't own the eyeballs"


def extract_sentences(text, max_sentences=3, max_chars=400):
    """Extract first N sentences from text, up to max_chars."""
    if not text:
        return ""

    # Clean up the text: remove title line if it matches a known pattern
    lines = text.strip().split('\n')
    # Skip blank lines and very short lines at the start (likely titles/bylines)
    content_lines = []
    started = False
    for line in lines:
        stripped = line.strip()
        if not started:
            # Skip short lines at the top (titles, dates, bylines)
            if len(stripped) < 40 and not stripped.endswith('.'):
                continue
            started = True
        content_lines.append(stripped)

    text = ' '.join(content_lines)

    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    # Split into sentences
    sentence_ends = list(re.finditer(r'[.!?]\s+(?=[A-Z"])', text))

    if not sentence_ends:
        # No clear sentence boundaries — just take first chunk
        return text[:max_chars].rsplit(' ', 1)[0] + '...' if len(text) > max_chars else text

    sentences = []
    start = 0
    total_len = 0
    for i, match in enumerate(sentence_ends):
        if i >= max_sentences:
            break
        end = match.end()
        sentence = text[start:end].strip()
        if total_len + len(sentence) > max_chars:
            break
        sentences.append(sentence)
        total_len += len(sentence)
        start = end

    if not sentences:
        # First sentence is very long — just take it truncated
        end = sentence_ends[0].start() + 1
        return text[:end]

    return ' '.join(sentences)


def extract_first_sentence(text, max_chars=200):
    """Extract the first sentence from text."""
    if not text:
        return ""

    lines = text.strip().split('\n')
    # Skip short header lines
    for line in lines:
        stripped = line.strip()
        if len(stripped) > 40 or stripped.endswith('.'):
            text = stripped
            break

    text = re.sub(r'\s+', ' ', text).strip()

    # Find first sentence end
    match = re.search(r'[.!?]\s+(?=[A-Z"])', text)
    if match:
        return text[:match.start() + 1]

    return text[:max_chars].rsplit(' ', 1)[0] + '...' if len(text) > max_chars else text


def main():
    print(f"Reading {CSV_PATH}...")

    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    print(f"  Loaded {len(rows)} records")

    fixed_summary = 0
    fixed_excerpt = 0
    skipped_no_rawtext = 0
    examples = []

    for row in rows:
        summary = row.get('summary', '')
        raw_text = row.get('raw_text', '')

        if SIDEBAR_MARKER not in summary:
            continue

        if not raw_text or len(raw_text.strip()) < 100:
            skipped_no_rawtext += 1
            rid = row.get('id', '?')
            print(f"  SKIP {rid}: no raw_text available")
            continue

        # Generate new summary from raw_text
        new_summary = extract_sentences(raw_text, max_sentences=3, max_chars=500)
        if new_summary and len(new_summary) > 50:
            row['summary'] = new_summary
            fixed_summary += 1

            if len(examples) < 5:
                examples.append((
                    row.get('id', '?'),
                    row.get('title', '?')[:60],
                    new_summary[:120]
                ))

        # Fix generic excerpt too
        excerpt = row.get('excerpt', '')
        if GENERIC_EXCERPT in excerpt or not excerpt.strip():
            new_excerpt = extract_first_sentence(raw_text, max_chars=200)
            if new_excerpt and len(new_excerpt) > 20:
                row['excerpt'] = new_excerpt
                fixed_excerpt += 1

    print(f"\n  Summaries fixed: {fixed_summary}")
    print(f"  Excerpts fixed: {fixed_excerpt}")
    print(f"  Skipped (no raw_text): {skipped_no_rawtext}")

    if examples:
        print(f"\n  Examples:")
        for rid, title, summary in examples:
            print(f"    {rid}: {title}")
            print(f"      -> {summary}...")

    if fixed_summary > 0 or fixed_excerpt > 0:
        print(f"\n  Writing {CSV_PATH}...")
        with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        print("  Done!")
    else:
        print("  No changes needed.")


if __name__ == "__main__":
    main()
