#!/usr/bin/env python3
"""
Extract Entities from Social Posts - Full Parallel Run

Processes ALL prioritized posts (~10,000) using parallel batches.
Each worker processes posts sequentially with rate limiting.
Designed to run unattended until completion.

Author: Claude Code
Date: 2025-12-03
"""

import csv
import json
import sys
import time
from pathlib import Path
from typing import List, Dict
from datetime import datetime
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

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


def prioritize_posts(posts: List[Dict], max_posts: int = 10000) -> List[Dict]:
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
    """Extract entities and relationships from a single post."""
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
        return {'success': False, 'entities': [], 'relationships': [], 'error': str(e)}


def process_batch_worker(args):
    """
    Process a batch of posts in a single worker.
    Each worker processes its posts sequentially with rate limiting.

    Args:
        args: Tuple of (worker_id, posts_batch, rate_limit_delay, total_workers)

    Returns:
        Dict with worker results
    """
    worker_id, posts_batch, rate_limit_delay, total_workers = args

    print(f"[Worker {worker_id}/{total_workers}] Starting batch of {len(posts_batch)} posts...")

    worker_entities = []
    worker_relationships = []
    worker_errors = []

    start_time = time.time()

    for i, post in enumerate(posts_batch, 1):
        post_start = time.time()

        # Extract
        result = extract_from_post(post)

        if result['success']:
            worker_entities.extend(result['entities'])
            worker_relationships.extend(result['relationships'])

            if i % 10 == 0:
                elapsed = time.time() - start_time
                avg_time = elapsed / i
                remaining = len(posts_batch) - i
                eta_minutes = (remaining * avg_time) / 60
                print(f"[Worker {worker_id}] {i}/{len(posts_batch)} posts | "
                      f"{len(worker_entities)} entities, {len(worker_relationships)} rels | "
                      f"ETA: {eta_minutes:.1f}m")
        else:
            error_msg = result.get('error', 'Unknown error')
            worker_errors.append({'post_id': post['id'], 'error': error_msg})

        # Rate limiting (but don't sleep after last post)
        if i < len(posts_batch):
            elapsed = time.time() - post_start
            sleep_time = max(0, rate_limit_delay - elapsed)
            if sleep_time > 0:
                time.sleep(sleep_time)

    duration = time.time() - start_time

    print(f"[Worker {worker_id}] COMPLETE! {len(posts_batch)} posts in {duration/60:.1f}m | "
          f"{len(worker_entities)} entities, {len(worker_relationships)} relationships")

    return {
        'worker_id': worker_id,
        'posts_processed': len(posts_batch),
        'entities': worker_entities,
        'relationships': worker_relationships,
        'errors': worker_errors,
        'duration': duration
    }


def save_results_to_csv(entities: List[Dict], relationships: List[Dict], output_dir: Path):
    """Save extraction results to CSV files with ALL fields."""

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
    parser.add_argument('--workers', '-w', type=int, default=5, help='Number of parallel workers (default: 5)')
    parser.add_argument('--max-posts', '-m', type=int, default=10000, help='Maximum posts to process (default: 10000)')
    parser.add_argument('--rate-limit', '-r', type=float, default=2.0, help='Seconds between API calls per worker (default: 2.0)')
    args = parser.parse_args()

    print("=" * 80)
    print("ENTITY EXTRACTION - FULL PARALLEL RUN")
    print("=" * 80)
    print()

    # Configuration
    MIN_WORDS = 7
    NUM_WORKERS = args.workers
    MAX_POSTS = args.max_posts
    RATE_LIMIT_DELAY = args.rate_limit

    # Paths
    base_dir = Path(__file__).parent.parent.parent
    social_posts_csv = base_dir / "data" / "social_posts.csv"
    output_dir = base_dir / "backend" / "output" / "social_entities_full"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load and prioritize posts
    print("Loading social posts...")
    all_posts = load_social_posts(social_posts_csv, min_words=MIN_WORDS)
    print(f"✓ Loaded {len(all_posts):,} substantive posts")

    posts_to_process = prioritize_posts(all_posts, max_posts=MAX_POSTS)
    print(f"✓ Selected top {len(posts_to_process):,} posts for extraction")
    print()

    # Calculate batch sizes for workers
    posts_per_worker = len(posts_to_process) // NUM_WORKERS
    remainder = len(posts_to_process) % NUM_WORKERS

    # Show plan
    print("=" * 80)
    print("EXTRACTION PLAN")
    print("=" * 80)
    print(f"Total posts: {len(posts_to_process):,}")
    print(f"Number of workers: {NUM_WORKERS}")
    print(f"Posts per worker: ~{posts_per_worker}")
    print(f"Rate limit: {RATE_LIMIT_DELAY}s between calls (per worker)")
    print(f"Effective rate: ~{NUM_WORKERS / RATE_LIMIT_DELAY:.1f} posts/second (all workers)")
    print(f"Estimated cost: ${len(posts_to_process) * 0.005:.2f}")

    # Calculate time estimate
    # Each worker processes posts_per_worker posts sequentially at RATE_LIMIT_DELAY per post
    estimated_time_seconds = posts_per_worker * RATE_LIMIT_DELAY
    estimated_time_minutes = estimated_time_seconds / 60
    estimated_time_hours = estimated_time_minutes / 60

    print(f"Estimated time: ~{estimated_time_hours:.1f} hours ({estimated_time_minutes:.0f} minutes)")
    print()

    # Confirm
    if not args.yes:
        print("⚠️  This will run for several hours and cost ~${:.2f}".format(len(posts_to_process) * 0.005))
        print("⚠️  Make sure you have stable power and internet connection!")
        print()
        response = input("Continue with extraction? (yes/no): ").strip().lower()
        if response != 'yes':
            print("Extraction cancelled.")
            return 0
    else:
        print("Auto-confirmed (--yes flag)")
        print()

    print()
    print("=" * 80)
    print("STARTING PARALLEL EXTRACTION")
    print("=" * 80)
    print()

    # Split posts into batches for workers
    worker_batches = []
    start_idx = 0
    for i in range(NUM_WORKERS):
        # Give extra posts to first 'remainder' workers
        batch_size = posts_per_worker + (1 if i < remainder else 0)
        end_idx = start_idx + batch_size
        batch = posts_to_process[start_idx:end_idx]
        worker_batches.append((i + 1, batch, RATE_LIMIT_DELAY, NUM_WORKERS))
        start_idx = end_idx

    # Process batches in parallel
    overall_start_time = datetime.now()

    all_entities = []
    all_relationships = []
    all_errors = []
    total_processed = 0

    with ProcessPoolExecutor(max_workers=NUM_WORKERS) as executor:
        # Submit all workers
        future_to_worker = {executor.submit(process_batch_worker, batch): batch[0]
                           for batch in worker_batches}

        # Collect results as they complete
        for future in as_completed(future_to_worker):
            worker_id = future_to_worker[future]
            try:
                result = future.result()
                all_entities.extend(result['entities'])
                all_relationships.extend(result['relationships'])
                all_errors.extend(result['errors'])
                total_processed += result['posts_processed']

                print()
                print(f"✓ Worker {result['worker_id']} finished!")
                print(f"  Running total: {total_processed}/{len(posts_to_process)} posts | "
                      f"{len(all_entities)} entities | {len(all_relationships)} relationships")
                print()

            except Exception as e:
                print(f"✗ Worker {worker_id} failed with error: {e}")

    overall_end_time = datetime.now()
    duration = (overall_end_time - overall_start_time).total_seconds()

    print()
    print("=" * 80)
    print("PARALLEL EXTRACTION COMPLETE")
    print("=" * 80)
    print(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes / {duration/3600:.1f} hours)")
    print(f"Posts processed: {total_processed:,}")
    print(f"Entities extracted: {len(all_entities):,}")
    print(f"Relationships extracted: {len(all_relationships):,}")
    print(f"Errors: {len(all_errors)}")
    print()

    # Save results
    print("Saving results...")
    save_results_to_csv(all_entities, all_relationships, output_dir)

    # Save summary
    summary = {
        'timestamp': datetime.now().isoformat(),
        'duration_seconds': duration,
        'num_workers': NUM_WORKERS,
        'posts_processed': total_processed,
        'entities_extracted': len(all_entities),
        'relationships_extracted': len(all_relationships),
        'errors': all_errors
    }

    summary_json = output_dir / "extraction_summary.json"
    with open(summary_json, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)

    print(f"✓ Saved summary: {summary_json.name}")
    print()
    print(f"Output directory: {output_dir}")
    print()
    print("🎉 All done!")

    return 0


if __name__ == "__main__":
    # Set multiprocessing start method
    multiprocessing.set_start_method('spawn', force=True)
    sys.exit(main())
