#!/usr/bin/env python3
"""
Analyze Entity Extraction Errors

Examines the 988 extraction errors from the full parallel run to determine
if they are legitimate (no extractable entities) or actual failures.

Author: Claude Code
Date: 2025-12-03
"""

import json
import csv
from pathlib import Path
from typing import Dict, List
from collections import Counter

def load_error_posts(summary_path: Path) -> List[str]:
    """Load list of post IDs that had extraction errors."""
    with open(summary_path, 'r') as f:
        summary = json.load(f)
    return [error['post_id'] for error in summary['errors']]

def load_social_posts(csv_path: Path) -> Dict[str, Dict]:
    """Load all social posts into a lookup dictionary."""
    posts = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            posts[row['id']] = row
    return posts

def analyze_debug_logs(logs_dir: Path, error_ids: List[str]) -> Dict:
    """Analyze debug logs to categorize error types."""
    categories = {
        'no_entities': [],           # Gemini returned empty arrays
        'validation_issues': [],     # Gemini returned data but validation failed
        'json_parse_error': [],      # Gemini response wasn't valid JSON
        'extraction_error': [],      # Other exceptions
        'no_log': []                 # No debug file found
    }

    for post_id in error_ids:
        # Find matching log file
        log_files = list(logs_dir.glob(f'*{post_id}*.json'))

        if not log_files:
            categories['no_log'].append(post_id)
            continue

        # Check most recent log for this post
        log_file = sorted(log_files)[-1]

        # Categorize by filename
        filename = log_file.name
        if 'no_entities' in filename:
            categories['no_entities'].append(post_id)
        elif 'validation_issues' in filename:
            categories['validation_issues'].append(post_id)
        elif 'json_parse_error' in filename:
            categories['json_parse_error'].append(post_id)
        elif 'extraction_error' in filename:
            categories['extraction_error'].append(post_id)

    return categories

def main():
    print("=" * 80)
    print("ENTITY EXTRACTION ERROR ANALYSIS")
    print("=" * 80)
    print()

    # Paths
    base_dir = Path(__file__).parent.parent.parent
    summary_path = base_dir / "backend" / "output" / "social_entities_full" / "extraction_summary.json"
    social_posts_csv = base_dir / "data" / "social_posts.csv"
    logs_dir = base_dir / "backend" / "logs" / "entity_extraction"

    # Load data
    print("Loading data...")
    error_ids = load_error_posts(summary_path)
    posts = load_social_posts(social_posts_csv)

    print(f"✓ Found {len(error_ids)} error posts")
    print()

    # Analyze debug logs
    print("Analyzing debug logs...")
    categories = analyze_debug_logs(logs_dir, error_ids)

    print()
    print("=" * 80)
    print("ERROR CATEGORIZATION")
    print("=" * 80)
    print()

    total_categorized = sum(len(ids) for ids in categories.values())

    for category, ids in categories.items():
        count = len(ids)
        pct = (count / len(error_ids)) * 100
        print(f"{category:25s}: {count:4d} ({pct:5.1f}%)")

    print(f"{'TOTAL':25s}: {total_categorized:4d}")
    print()

    # Detailed analysis of "no_entities" category
    print("=" * 80)
    print("'NO_ENTITIES' CATEGORY ANALYSIS")
    print("=" * 80)
    print()
    print("These posts had no extractable entities (Gemini returned empty arrays).")
    print("This is LEGITIMATE behavior for posts without named entities.")
    print()

    no_entity_posts = categories['no_entities']
    word_counts = []
    platforms = Counter()

    print(f"Examining {len(no_entity_posts)} posts...")
    print()

    for post_id in no_entity_posts:
        if post_id in posts:
            post = posts[post_id]
            word_count = int(post.get('word_count', 0))
            word_counts.append(word_count)
            platform = post_id.split('-')[0]
            platforms[platform] += 1

    # Word count statistics
    if word_counts:
        avg_words = sum(word_counts) / len(word_counts)
        min_words = min(word_counts)
        max_words = max(word_counts)

        print("Word count statistics:")
        print(f"  Average: {avg_words:.1f} words")
        print(f"  Range: {min_words} - {max_words} words")
        print()

    # Platform breakdown
    print("Platform breakdown:")
    for platform, count in platforms.most_common():
        pct = (count / len(no_entity_posts)) * 100
        print(f"  {platform:10s}: {count:4d} ({pct:5.1f}%)")
    print()

    # Sample posts
    print("Sample posts with no extractable entities:")
    print()

    for i, post_id in enumerate(no_entity_posts[:10], 1):
        if post_id in posts:
            post = posts[post_id]
            print(f"{i}. {post_id} ({post.get('word_count', 'N/A')} words)")
            print(f"   {post.get('raw_text', '')[:100]}...")
            print()

    # Validation issues analysis
    if categories['validation_issues']:
        print("=" * 80)
        print("'VALIDATION_ISSUES' CATEGORY ANALYSIS")
        print("=" * 80)
        print()
        print("These posts had entities extracted but they failed validation.")
        print("This indicates potential schema mismatches or data quality issues.")
        print()

        print(f"Found {len(categories['validation_issues'])} posts with validation issues")
        print()

        print("Sample posts:")
        for i, post_id in enumerate(categories['validation_issues'][:5], 1):
            if post_id in posts:
                post = posts[post_id]
                print(f"{i}. {post_id} ({post.get('word_count', 'N/A')} words)")
                print(f"   {post.get('raw_text', '')[:100]}...")
                print()

    # JSON parse errors
    if categories['json_parse_error']:
        print("=" * 80)
        print("'JSON_PARSE_ERROR' CATEGORY ANALYSIS")
        print("=" * 80)
        print()
        print("These posts had malformed JSON responses from Gemini.")
        print("This is a REAL ERROR that should be investigated.")
        print()

        print(f"Found {len(categories['json_parse_error'])} posts with JSON parse errors")
        print()

    # Other extraction errors
    if categories['extraction_error']:
        print("=" * 80)
        print("'EXTRACTION_ERROR' CATEGORY ANALYSIS")
        print("=" * 80)
        print()
        print("These posts had other exceptions during extraction.")
        print("This is a REAL ERROR that should be investigated.")
        print()

        print(f"Found {len(categories['extraction_error'])} posts with extraction errors")
        print()

    # Summary and recommendations
    print("=" * 80)
    print("SUMMARY AND RECOMMENDATIONS")
    print("=" * 80)
    print()

    no_entity_count = len(categories['no_entities'])
    real_error_count = len(categories['validation_issues']) + len(categories['json_parse_error']) + len(categories['extraction_error'])

    print(f"Total 'errors': {len(error_ids)}")
    print(f"  Legitimate (no entities): {no_entity_count} ({(no_entity_count/len(error_ids))*100:.1f}%)")
    print(f"  Real errors: {real_error_count} ({(real_error_count/len(error_ids))*100:.1f}%)")
    print()

    if no_entity_count > (len(error_ids) * 0.8):
        print("✓ CONCLUSION: The vast majority of 'errors' are legitimate - posts that")
        print("  simply don't contain named entities worth extracting. This is EXPECTED")
        print("  behavior for short social media posts with abstract commentary.")
        print()
        print("  NO ACTION REQUIRED.")
    elif real_error_count > (len(error_ids) * 0.2):
        print("⚠ WARNING: A significant number of real errors were found.")
        print("  These should be investigated and potentially re-processed.")
    else:
        print("✓ The error rate is acceptable. Most 'errors' are legitimate.")
        print("  A small number of real errors can be reviewed if needed.")

    print()

    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main())
