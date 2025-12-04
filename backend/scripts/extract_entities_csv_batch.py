#!/usr/bin/env python3
"""
Extract Entities from Social Posts - CSV Batch Processor

Simple batch processor that uses entity_extractor directly to process
social posts from CSV and save results to CSV.

Author: Claude Code
Date: 2025-12-03
"""

import csv
import json
import sys
import os
from pathlib import Path
from typing import List, Dict
from datetime import datetime
import time

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from rosen_scraper import entity_extractor


def load_social_posts(csv_path: Path, min_words: int = 7) -> List[Dict]:
    """Load social posts from CSV with filtering."""
    posts = []

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            word_count = int(row.get('word_count', 0) or 0)
            if word_count < min_words:
                continue

            content = row.get('raw_text', '').strip()
            if not content or len(content) < 20:
                continue

            posts.append(row)

    return posts


def prioritize_posts(posts: List[Dict], max_posts: int = 300) -> List[Dict]:
    """Prioritize posts by engagement and recency."""
    if len(posts) <= max_posts:
        return posts

    scored_posts = []
    for post in posts:
        score = 0

        # Engagement
        likes = int(post.get('likes', 0) or 0)
        reposts = int(post.get('reposts', 0) or 0)
        score += min(likes + (reposts * 2), 100)

        # Recency
        try:
            year = int(post.get('publication_date', '')[:4])
            if year >= 2023:
                score += 50
            elif year >= 2020:
                score += 25
        except (ValueError, IndexError):
            pass

        # Length
        word_count = int(post.get('word_count', 0) or 0)
        if word_count > 100:
            score += 25
        elif word_count > 50:
            score += 15
        elif word_count > 20:
            score += 5

        scored_posts.append((score, post))

    scored_posts.sort(key=lambda x: x[0], reverse=True)
    return [post for score, post in scored_posts[:max_posts]]


def extract_from_post(post: Dict) -> Dict:
    """
    Extract entities and relationships from a single post.

    Args:
        post: Social post row dict

    Returns:
        Dict with entities and relationships lists
    """
    record_id = post['id']
    text_content = post.get('raw_text', '')
    record_title = post.get('title', 'Untitled Post')
    record_author = post.get('author', 'Unknown')
    record_publication = post.get('platform', 'Unknown')

    try:
        result = entity_extractor.extract_entities_and_relationships(
            text_content=text_content,
            record_id=record_id,
            record_title=record_title,
            record_author=record_author,
            record_publication=record_publication
        )

        if result:
            return {
                'success': True,
                'entities': result.get('entities', []),
                'relationships': result.get('relationships', [])
            }
        else:
            return {'success': False, 'entities': [], 'relationships': []}

    except Exception as e:
        print(f"  Error extracting from {record_id}: {e}")
        return {'success': False, 'entities': [], 'relationships': [], 'error': str(e)}


def save_results_to_csv(entities: List[Dict], relationships: List[Dict], output_dir: Path):
    """Save extraction results to CSV files."""

    # Save entities
    if entities:
        entities_csv = output_dir / "entities.csv"
        # Collect ALL unique fieldnames from all entities
        fieldnames = set()
        for entity in entities:
            fieldnames.update(entity.keys())
        fieldnames = sorted(list(fieldnames))

        with open(entities_csv, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(entities)

        print(f"✓ Saved {len(entities)} entities to {entities_csv.name}")

    # Save relationships
    if relationships:
        relationships_csv = output_dir / "relationships.csv"
        # Collect ALL unique fieldnames from all relationships
        fieldnames = set()
        for rel in relationships:
            fieldnames.update(rel.keys())
        fieldnames = sorted(list(fieldnames))

        with open(relationships_csv, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(relationships)

        print(f"✓ Saved {len(relationships)} relationships to {relationships_csv.name}")


def main():
    """Main execution."""
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--yes', '-y', action='store_true', help='Auto-confirm without prompting')
    args = parser.parse_args()

    print("=" * 60)
    print("ENTITY EXTRACTION - CSV BATCH (3 BATCHES)")
    print("=" * 60)
    print()

    # Configuration
    MIN_WORDS = 7
    BATCH_SIZE = 100
    NUM_BATCHES = 3
    TOTAL_POSTS = BATCH_SIZE * NUM_BATCHES
    RATE_LIMIT_DELAY = 6  # seconds between calls

    # Paths
    base_dir = Path(__file__).parent.parent.parent
    social_posts_csv = base_dir / "data" / "social_posts.csv"
    output_dir = base_dir / "backend" / "output" / "social_entities_test"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load and prioritize posts
    print("Loading social posts...")
    all_posts = load_social_posts(social_posts_csv, min_words=MIN_WORDS)
    print(f"✓ Loaded {len(all_posts):,} substantive posts")

    posts_to_process = prioritize_posts(all_posts, max_posts=TOTAL_POSTS)
    print(f"✓ Selected top {len(posts_to_process)} posts for extraction")
    print()

    # Show plan
    print("=" * 60)
    print("EXTRACTION PLAN")
    print("=" * 60)
    print(f"Total posts: {len(posts_to_process)}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Number of batches: {NUM_BATCHES}")
    print(f"Rate limit: {RATE_LIMIT_DELAY}s between calls")
    print(f"Estimated cost: ${len(posts_to_process) * 0.005:.2f}")
    print(f"Estimated time: ~{len(posts_to_process) * RATE_LIMIT_DELAY / 60:.1f} minutes")
    print()

    # Confirm
    if not args.yes:
        response = input("Continue with extraction? (yes/no): ").strip().lower()
        if response != 'yes':
            print("Extraction cancelled.")
            return 0
    else:
        print("Auto-confirmed (--yes flag)")
        print()

    print()
    print("Starting extraction...")
    print()

    # Process posts
    all_entities = []
    all_relationships = []
    errors = []
    start_time = datetime.now()

    for i, post in enumerate(posts_to_process, 1):
        # Show progress
        batch_num = (i - 1) // BATCH_SIZE + 1
        post_in_batch = (i - 1) % BATCH_SIZE + 1

        print(f"[Batch {batch_num}/{NUM_BATCHES}] Processing {post_in_batch}/{BATCH_SIZE}: {post['id']}...", end=' ')

        # Extract
        result = extract_from_post(post)

        if result['success']:
            all_entities.extend(result['entities'])
            all_relationships.extend(result['relationships'])
            print(f"✓ ({len(result['entities'])} entities, {len(result['relationships'])} rels)")
        else:
            error_msg = result.get('error', 'Unknown error')
            errors.append({'post_id': post['id'], 'error': error_msg})
            print(f"✗ Error: {error_msg}")

        # Rate limiting (except for last post)
        if i < len(posts_to_process):
            time.sleep(RATE_LIMIT_DELAY)

        # Batch summary
        if i % BATCH_SIZE == 0:
            print()
            print(f"  Batch {batch_num} complete! Total so far: {len(all_entities)} entities, {len(all_relationships)} relationships")
            print()

    # Final summary
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()

    print()
    print("=" * 60)
    print("EXTRACTION COMPLETE")
    print("=" * 60)
    print(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
    print(f"Posts processed: {len(posts_to_process)}")
    print(f"Entities extracted: {len(all_entities)}")
    print(f"Relationships extracted: {len(all_relationships)}")
    print(f"Errors: {len(errors)}")
    print()

    # Save results
    save_results_to_csv(all_entities, all_relationships, output_dir)

    # Save summary
    summary = {
        'timestamp': datetime.now().isoformat(),
        'duration_seconds': duration,
        'posts_processed': len(posts_to_process),
        'entities_extracted': len(all_entities),
        'relationships_extracted': len(all_relationships),
        'errors': errors
    }

    summary_json = output_dir / "extraction_summary.json"
    with open(summary_json, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)

    print(f"✓ Saved summary: {summary_json.name}")
    print()
    print(f"Output directory: {output_dir}")
    print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
