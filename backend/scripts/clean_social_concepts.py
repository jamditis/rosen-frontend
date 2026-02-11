#!/usr/bin/env python3
"""
Clean over-tagged key_concepts from social_posts.csv.

The AI categorizer assigned concepts too aggressively to social posts.
This script uses strict keyword matching to verify that a post's text
actually references a concept before keeping the tag.

Usage:
    python3 clean_social_concepts.py              # dry-run (default)
    python3 clean_social_concepts.py --write       # apply changes
    python3 clean_social_concepts.py --verbose      # show sample removals
"""

import argparse
import csv
import os
import shutil
import sys
from collections import Counter, defaultdict

# Path to CSV relative to this script's location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "..", "data")
CSV_PATH = os.path.join(DATA_DIR, "social_posts.csv")
BACKUP_SUFFIX = ".backup-concepts"

# Keyword rules: concept name -> list of keyword phrases (case-insensitive).
# A concept tag is KEPT if ANY keyword appears in the post text.
# Otherwise it's REMOVED.
CONCEPT_KEYWORDS = {
    "The People Formerly Known as the Audience": [
        "people formerly",
        "pfkota",
        "formerly known as the audience",
    ],
    "False balance": [
        "false balance",
        "false equivalen",
        "bothsides",
        "both-sides",
    ],
    "He said/she said journalism": [
        "he said",
        "she said",
        "he-said",
        "she-said",
    ],
    "Verification in reverse": [
        "verification in reverse",
        "verify first",
        "publish then verify",
    ],
    "View from Nowhere": [
        "view from nowhere",
        "from nowhere",
    ],
    "Church of the Savvy": [
        "church of the savvy",
        "savviness",
    ],
    "The Citizens' Agenda": [
        "citizens' agenda",
        "citizens agenda",
        "citizen's agenda",
    ],
    "Horse-race journalism": [
        "horse race",
        "horse-race",
        "horserace",
    ],
    "Not the odds but the stakes": [
        "not the odds",
        "odds but the stakes",
    ],
    "The Production of Innocence": [
        "production of innocence",
    ],
    "Parity Product": [
        "parity product",
    ],
    "Audience atomization overcome": [
        "audience atomization",
        "atomization overcome",
    ],
    "Mindcasting": [
        "mindcast",
    ],
    "Truth sandwich": [
        "truth sandwich",
    ],
    "The truth sandwich": [
        "truth sandwich",
    ],
    "Truth Sandwich": [
        "truth sandwich",
    ],
    "Goldwater Rule": [
        "goldwater",
    ],
}


def get_post_text(row):
    """Combine all text fields for keyword search."""
    parts = []
    for field in ("raw_text", "title", "excerpt"):
        val = row.get(field, "")
        if val:
            parts.append(val)
    return " ".join(parts).lower()


def concept_matches_text(concept, text_lower):
    """Check if any keyword for this concept appears in the text."""
    keywords = CONCEPT_KEYWORDS.get(concept)
    if keywords is None:
        # Not a concept we're filtering — always keep it
        return True
    return any(kw in text_lower for kw in keywords)


def process_csv(csv_path, write_mode=False, verbose=False):
    """Main processing logic. Returns stats dict."""
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found")
        sys.exit(1)

    # Read all rows
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    total_rows = len(rows)
    rows_with_concepts = 0
    rows_modified = 0
    tags_removed_total = 0
    removed_per_concept = Counter()
    kept_per_concept = Counter()
    sample_removals = defaultdict(list)  # concept -> [(id, text_snippet, removed_concepts)]

    modified_rows = []

    for row in rows:
        key_concepts = row.get("key_concepts", "").strip()
        if not key_concepts:
            modified_rows.append(row)
            continue

        rows_with_concepts += 1
        concepts = [c.strip() for c in key_concepts.split(",") if c.strip()]
        text_lower = get_post_text(row)

        kept = []
        removed = []
        for concept in concepts:
            if concept_matches_text(concept, text_lower):
                kept.append(concept)
                kept_per_concept[concept] += 1
            else:
                removed.append(concept)
                removed_per_concept[concept] += 1

        if removed:
            rows_modified += 1
            tags_removed_total += len(removed)
            row_copy = dict(row)
            row_copy["key_concepts"] = ", ".join(kept) if kept else ""
            modified_rows.append(row_copy)

            # Collect samples (up to 3 per concept)
            for concept in removed:
                if len(sample_removals[concept]) < 3:
                    snippet = row.get("raw_text", "")[:100]
                    sample_removals[concept].append(
                        (row.get("id", "?"), snippet)
                    )
        else:
            modified_rows.append(row)

    # Print report
    print("=" * 60)
    print("Social post concept cleaning report")
    print("=" * 60)
    print(f"Total rows:            {total_rows:>8,}")
    print(f"Rows with concepts:    {rows_with_concepts:>8,}")
    print(f"Rows modified:         {rows_modified:>8,}")
    print(f"Total tags removed:    {tags_removed_total:>8,}")
    print()

    print("Per-concept breakdown:")
    print(f"  {'Concept':<45} {'Before':>7} {'Kept':>7} {'Removed':>7} {'%Rem':>6}")
    print(f"  {'-' * 45} {'-' * 7} {'-' * 7} {'-' * 7} {'-' * 6}")

    # Sort by removal count descending
    all_concepts = set(list(removed_per_concept.keys()) + list(kept_per_concept.keys()))
    concept_stats = []
    for concept in all_concepts:
        if concept in CONCEPT_KEYWORDS:
            before = removed_per_concept[concept] + kept_per_concept[concept]
            removed = removed_per_concept[concept]
            kept = kept_per_concept[concept]
            pct = (removed / before * 100) if before else 0
            concept_stats.append((concept, before, kept, removed, pct))

    concept_stats.sort(key=lambda x: x[3], reverse=True)

    for concept, before, kept, removed, pct in concept_stats:
        name = concept[:45]
        print(f"  {name:<45} {before:>7,} {kept:>7,} {removed:>7,} {pct:>5.1f}%")

    if verbose:
        print()
        print("Sample removals:")
        print("-" * 60)
        for concept in sorted(sample_removals.keys()):
            print(f"\n  {concept}:")
            for post_id, snippet in sample_removals[concept]:
                print(f"    [{post_id}] {snippet}...")

    # Write if requested
    if write_mode:
        backup_path = csv_path + BACKUP_SUFFIX
        print(f"\nBacking up to: {backup_path}")
        shutil.copy2(csv_path, backup_path)

        print(f"Writing cleaned CSV to: {csv_path}")
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(modified_rows)

        print("Done. CSV updated.")
    else:
        print(f"\nDry run — no changes written. Use --write to apply.")

    return {
        "total_rows": total_rows,
        "rows_with_concepts": rows_with_concepts,
        "rows_modified": rows_modified,
        "tags_removed": tags_removed_total,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Clean over-tagged concepts from social_posts.csv"
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Apply changes (default is dry-run)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show sample removals per concept",
    )
    parser.add_argument(
        "--csv",
        default=CSV_PATH,
        help=f"Path to social_posts.csv (default: {CSV_PATH})",
    )
    args = parser.parse_args()

    process_csv(args.csv, write_mode=args.write, verbose=args.verbose)


if __name__ == "__main__":
    main()
