#!/usr/bin/env python3
"""
Generate Archive Records for Major Bluesky Threads

Creates synthetic archive records for the top Bluesky threads that can be
displayed in the main archive interface. When clicked, these records show
the full thread conversation in the modal.

Author: Claude Code
Date: 2025-12-03
"""

import csv
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List
from collections import defaultdict


def load_thread_mappings(json_path: Path) -> Dict[str, Dict]:
    """Load thread mapping JSON."""
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_social_posts(csv_path: Path) -> Dict[str, Dict]:
    """Load social posts CSV indexed by ID."""
    posts = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('platform') == 'Bluesky':
                posts[row['id']] = row
    return posts


def get_thread_posts(thread_map: Dict, root_id: str) -> List[Dict]:
    """
    Get all posts in a thread, ordered by depth.

    Args:
        thread_map: Thread mapping dict
        root_id: Root post ID

    Returns:
        List of post info dicts
    """
    posts = []

    def add_post_and_children(post_id: str):
        """Recursively add post and its children."""
        if post_id not in thread_map:
            return

        info = thread_map[post_id]
        posts.append({
            'id': post_id,
            'depth': info['depth'],
            'parent_id': info.get('parent_id'),
            'children': info.get('children', [])
        })

        for child_id in info.get('children', []):
            add_post_and_children(child_id)

    add_post_and_children(root_id)
    return posts


def create_thread_record(
    root_id: str,
    root_post: Dict,
    thread_posts: List[Dict],
    social_posts: Dict,
    rank: int,
    max_depth: int
) -> Dict:
    """
    Create an archive record for a thread.

    Args:
        root_id: Thread root ID
        root_post: Full root post data
        thread_posts: List of thread post info
        social_posts: Dict of all social posts
        rank: Thread rank (1-10)
        max_depth: Maximum depth in thread

    Returns:
        Archive record dict
    """
    # Build thread content for summary
    thread_content_parts = []
    for post_info in thread_posts[:10]:  # First 10 posts
        post = social_posts.get(post_info['id'])
        if post:
            content = post.get('content', '').strip()
            if content:
                thread_content_parts.append(content)

    full_thread_text = '\n\n'.join(thread_content_parts)

    # Extract first post as title
    title = root_post.get('content', '')[:100]
    if len(root_post.get('content', '')) > 100:
        title += '...'

    # Create summary
    summary = f"A {len(thread_posts)}-post Bluesky thread by Jay Rosen. "
    summary += f"Thread depth: {max_depth} levels. "
    if thread_content_parts:
        summary += f"\n\n{thread_content_parts[0][:200]}..."

    # Build structured thread data for modal display
    thread_data = {
        'thread_id': root_id,
        'total_posts': len(thread_posts),
        'max_depth': max_depth,
        'posts': []
    }

    for i, post_info in enumerate(thread_posts):
        post = social_posts.get(post_info['id'])
        if post:
            thread_data['posts'].append({
                'number': i + 1,
                'id': post['id'],
                'content': post.get('content', ''),
                'date': post.get('publication_date', ''),
                'url': post.get('url', ''),
                'depth': post_info['depth'],
                'parent_id': post_info.get('parent_id')
            })

    # Calculate word count
    word_count = len(full_thread_text.split())

    # Create archive record
    record = {
        'id': f'THREAD-{str(rank).zfill(5)}',
        'collection_id': 'PUBLIC',
        'title': f'[Bluesky Thread] {title}',
        'author': 'Jay Rosen',
        'publication': 'Bluesky',
        'publication_date': root_post.get('publication_date', ''),
        'url': root_post.get('url', ''),
        'summary': summary,
        'content_type': 'Social Media Thread',
        'scope': 'Thread',
        'format': 'Social Media',
        'word_count': str(word_count),
        'era': root_post.get('era', ''),
        'categories': 'Social Media',
        'tags': f'Bluesky,Thread,{len(thread_posts)} posts',
        'key_concepts': '',
        'platforms': 'Bluesky',
        'copyright': '',
        'verified': 'Yes',
        'date_added': datetime.now().strftime("%Y-%m-%d"),
        'date_modified': datetime.now().strftime("%Y-%m-%d"),
        'date_processed': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        'notes': f'Major Bluesky thread (rank #{rank}). Contains {len(thread_posts)} posts with max depth {max_depth}.',
        'raw_text': full_thread_text,
        'quote': thread_content_parts[0][:300] if thread_content_parts else '',
        'thread_data': json.dumps(thread_data)  # Structured data for modal
    }

    return record


def generate_thread_records(output_csv: Path, thread_json: Path):
    """
    Generate CSV of thread records.

    Args:
        output_csv: Path to output CSV
        thread_json: Path to output thread data JSON
    """
    print("=" * 60)
    print("GENERATE BLUESKY THREAD RECORDS")
    print("=" * 60)
    print()

    # Define paths
    base_dir = Path(__file__).parent.parent.parent
    thread_map_path = base_dir / "backend" / "output" / "bluesky_thread_mappings.json"
    social_posts_path = base_dir / "data" / "social_posts.csv"

    # Load data
    print("Loading data...")
    thread_map = load_thread_mappings(thread_map_path)
    social_posts = load_social_posts(social_posts_path)
    print(f"✓ Loaded {len(thread_map)} thread mappings")
    print(f"✓ Loaded {len(social_posts)} Bluesky posts")
    print()

    # Find top 10 largest threads
    print("Finding largest threads...")
    thread_sizes = defaultdict(int)
    thread_max_depth = {}

    for info in thread_map.values():
        root_id = info['thread_root_id']
        thread_sizes[root_id] += 1
        current_max = thread_max_depth.get(root_id, 0)
        thread_max_depth[root_id] = max(current_max, info['depth'])

    top_threads = sorted(thread_sizes.items(), key=lambda x: x[1], reverse=True)[:10]
    print(f"✓ Identified top {len(top_threads)} threads")
    print()

    # Generate records
    print("Generating thread records...")
    records = []
    thread_details = []

    for rank, (root_id, size) in enumerate(top_threads, 1):
        if root_id not in social_posts:
            print(f"⚠ Skipping {root_id} - not found in social_posts")
            continue

        root_post = social_posts[root_id]
        thread_posts = get_thread_posts(thread_map, root_id)
        max_depth = thread_max_depth[root_id]

        record = create_thread_record(
            root_id, root_post, thread_posts, social_posts, rank, max_depth
        )

        records.append(record)
        thread_details.append({
            'thread_id': f'THREAD-{str(rank).zfill(5)}',
            'root_bsky_id': root_id,
            'size': size,
            'max_depth': max_depth,
            'date': root_post.get('publication_date', ''),
            'url': root_post.get('url', '')
        })

        print(f"✓ Created THREAD-{str(rank).zfill(5)}: {size} posts, depth {max_depth}")

    # Write CSV
    if records:
        fieldnames = list(records[0].keys())
        with open(output_csv, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(records)

        print()
        print(f"✓ Saved {len(records)} thread records: {output_csv.name}")

    # Write thread details JSON
    with open(thread_json, 'w', encoding='utf-8') as f:
        json.dump(thread_details, f, indent=2)

    print(f"✓ Saved thread details: {thread_json.name}")

    print()
    print("=" * 60)
    print(f"✓ COMPLETE: Generated {len(records)} thread archive records")
    print("=" * 60)

    return len(records)


def main():
    """Main execution."""
    base_dir = Path(__file__).parent.parent.parent
    output_dir = base_dir / "backend" / "output"
    output_dir.mkdir(exist_ok=True)

    output_csv = output_dir / "thread_records.csv"
    thread_json = output_dir / "thread_details.json"

    generate_thread_records(output_csv, thread_json)

    print()
    print("NEXT STEPS:")
    print("1. Review thread_records.csv")
    print("2. These can be merged into archive_records-public.csv")
    print("3. Update frontend to render thread_data in RecordModal")
    print()

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
