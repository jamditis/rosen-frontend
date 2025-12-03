#!/usr/bin/env python3
"""
Reconstruct Bluesky Thread Hierarchies

Parse AT protocol URIs from Bluesky posts to build complete thread hierarchies.
Bluesky posts already have parent references in responds_to field.

Author: Claude Code
Date: 2025-12-03
"""

import csv
import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict


def parse_at_uri(uri: str) -> Optional[Dict[str, str]]:
    """
    Extract components from AT protocol URI.

    Example: at://did:plc:xyz123/app.bsky.feed.post/abc456
    Returns: {did: "did:plc:xyz123", rkey: "abc456"}

    Args:
        uri: AT protocol URI

    Returns:
        Dict with did and rkey, or None if invalid
    """
    if not uri:
        return None

    pattern = r'at://([^/]+)/app\.bsky\.feed\.post/(\w+)'
    match = re.match(pattern, uri)

    if match:
        return {
            "did": match.group(1),
            "rkey": match.group(2)  # Record key (post ID portion)
        }
    return None


def extract_rkey_from_url(url: str) -> Optional[str]:
    """
    Extract rkey (post ID) from Bluesky post URL.

    Example: https://bsky.app/profile/jayrosen.bsky.social/post/3m4g3gxkoxs2r
    Returns: "3m4g3gxkoxs2r"

    Args:
        url: Bluesky post URL

    Returns:
        rkey string or None
    """
    pattern = r'/post/(\w+)'
    match = re.search(pattern, url)
    return match.group(1) if match else None


def load_bluesky_posts(csv_path: Path) -> List[Dict[str, str]]:
    """
    Load all Bluesky posts from social_posts.csv.

    Args:
        csv_path: Path to social_posts.csv

    Returns:
        List of Bluesky post dicts
    """
    posts = []

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('platform') == 'Bluesky':
                posts.append(row)

    return posts


def find_parent_by_rkey(posts: List[Dict[str, str]], rkey: str) -> Optional[str]:
    """
    Find post ID by matching rkey in URL.

    Args:
        posts: List of all Bluesky posts
        rkey: Record key to find

    Returns:
        Post ID (e.g., BSKY-00123) or None
    """
    for post in posts:
        post_rkey = extract_rkey_from_url(post.get('url', ''))
        if post_rkey == rkey:
            return post['id']
    return None


def calculate_depth(thread_map: Dict[str, Dict], post_id: str, max_depth: int = 100) -> int:
    """
    Calculate depth of post in thread (0 = root).

    Args:
        thread_map: Current thread mapping
        post_id: ID of post to calculate depth for
        max_depth: Maximum depth to prevent infinite loops

    Returns:
        Depth as integer
    """
    if post_id not in thread_map or not thread_map[post_id].get('parent_id'):
        return 0

    depth = 0
    current_id = post_id
    seen = set()

    while current_id in thread_map and thread_map[current_id].get('parent_id'):
        if current_id in seen or depth >= max_depth:
            # Circular reference or max depth reached
            print(f"WARNING: Circular reference or max depth for {post_id}")
            break

        seen.add(current_id)
        current_id = thread_map[current_id]['parent_id']
        depth += 1

    return depth


def find_thread_root(thread_map: Dict[str, Dict], post_id: str, max_depth: int = 100) -> str:
    """
    Find the root post of a thread.

    Args:
        thread_map: Current thread mapping
        post_id: ID of post to find root for
        max_depth: Maximum depth to prevent infinite loops

    Returns:
        Root post ID
    """
    current_id = post_id
    seen = set()
    depth = 0

    while current_id in thread_map and thread_map[current_id].get('parent_id'):
        if current_id in seen or depth >= max_depth:
            print(f"WARNING: Circular reference finding root for {post_id}")
            break

        seen.add(current_id)
        current_id = thread_map[current_id]['parent_id']
        depth += 1

    return current_id


def build_bluesky_threads(posts: List[Dict[str, str]]) -> Tuple[Dict[str, Dict], Dict[str, int]]:
    """
    Build thread hierarchy from Bluesky posts.

    Args:
        posts: List of all Bluesky posts

    Returns:
        Tuple of (thread_map, stats)
        - thread_map: Dict mapping post_id to thread info
        - stats: Statistics about threading
    """
    thread_map = {}
    stats = {
        'total_posts': len(posts),
        'posts_with_parents': 0,
        'orphaned_replies': 0,  # Replies whose parents aren't in dataset
        'unique_threads': 0,
        'max_depth': 0
    }

    # First pass: Map all posts and extract parent references
    print("First pass: Mapping posts and parent references...")
    for post in posts:
        post_id = post['id']
        responds_to = post.get('responds_to', '')

        thread_info = {
            'post_id': post_id,
            'url': post.get('url', ''),
            'parent_id': None,
            'parent_uri': responds_to if responds_to else None,
            'depth': 0,
            'thread_root_id': None,
            'children': [],
            'confidence': 1.0  # Bluesky has explicit parent refs
        }

        if responds_to:
            parent_info = parse_at_uri(responds_to)
            if parent_info:
                # Try to find parent post in our dataset
                parent_rkey = parent_info['rkey']
                parent_id = find_parent_by_rkey(posts, parent_rkey)

                if parent_id:
                    thread_info['parent_id'] = parent_id
                    stats['posts_with_parents'] += 1
                else:
                    # Parent exists but not in our dataset (orphaned reply)
                    stats['orphaned_replies'] += 1
                    print(f"  Orphaned reply: {post_id} → parent rkey {parent_rkey} not found")

        thread_map[post_id] = thread_info

    # Second pass: Calculate depths and find roots
    print("\nSecond pass: Calculating depths and thread roots...")
    for post_id in thread_map:
        depth = calculate_depth(thread_map, post_id)
        thread_map[post_id]['depth'] = depth

        root_id = find_thread_root(thread_map, post_id)
        thread_map[post_id]['thread_root_id'] = root_id

        if depth > stats['max_depth']:
            stats['max_depth'] = depth

    # Third pass: Build children lists
    print("Third pass: Building children lists...")
    for post_id, info in thread_map.items():
        parent_id = info.get('parent_id')
        if parent_id and parent_id in thread_map:
            thread_map[parent_id]['children'].append(post_id)

    # Count unique threads (distinct root IDs)
    unique_roots = set(info['thread_root_id'] for info in thread_map.values())
    stats['unique_threads'] = len(unique_roots)

    return thread_map, stats


def save_thread_mappings(thread_map: Dict[str, Dict], output_path: Path):
    """
    Save thread mappings to JSON file.

    Args:
        thread_map: Thread mapping dict
        output_path: Path to output JSON file
    """
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(thread_map, f, indent=2)

    print(f"\n✓ Saved thread mappings: {output_path.name}")


def generate_thread_stats_report(thread_map: Dict[str, Dict], stats: Dict[str, int]) -> str:
    """
    Generate human-readable statistics report.

    Args:
        thread_map: Thread mapping dict
        stats: Statistics dict

    Returns:
        Report string
    """
    # Find largest threads
    thread_sizes = defaultdict(int)
    for info in thread_map.values():
        root_id = info['thread_root_id']
        thread_sizes[root_id] += 1

    top_threads = sorted(thread_sizes.items(), key=lambda x: x[1], reverse=True)[:10]

    # Calculate depth distribution
    depth_dist = defaultdict(int)
    for info in thread_map.values():
        depth_dist[info['depth']] += 1

    report = []
    report.append("=" * 60)
    report.append("BLUESKY THREAD RECONSTRUCTION REPORT")
    report.append("=" * 60)
    report.append("")
    report.append(f"Total posts processed: {stats['total_posts']}")
    report.append(f"Posts with parent references: {stats['posts_with_parents']} ({stats['posts_with_parents']/stats['total_posts']*100:.1f}%)")
    report.append(f"Orphaned replies (parent not in dataset): {stats['orphaned_replies']}")
    report.append(f"Unique threads identified: {stats['unique_threads']}")
    report.append(f"Maximum thread depth: {stats['max_depth']}")
    report.append("")
    report.append("Depth Distribution:")
    for depth in sorted(depth_dist.keys()):
        count = depth_dist[depth]
        bar = "█" * (count // 10)
        report.append(f"  Depth {depth}: {count:4d} {bar}")
    report.append("")
    report.append("Top 10 Largest Threads:")
    for i, (root_id, size) in enumerate(top_threads, 1):
        root_url = thread_map[root_id]['url']
        report.append(f"  {i:2d}. {root_id}: {size:3d} posts - {root_url}")
    report.append("")
    report.append("=" * 60)

    return "\n".join(report)


def main():
    """Main execution function."""
    print("=" * 60)
    print("BLUESKY THREAD RECONSTRUCTION")
    print("=" * 60)
    print()

    # Define paths
    base_dir = Path(__file__).parent.parent.parent
    social_posts_csv = base_dir / "data" / "social_posts.csv"
    output_dir = base_dir / "backend" / "output"
    output_dir.mkdir(exist_ok=True)

    # Load Bluesky posts
    print("Loading Bluesky posts...")
    posts = load_bluesky_posts(social_posts_csv)
    print(f"✓ Loaded {len(posts)} Bluesky posts")
    print()

    # Build thread hierarchies
    print("Building thread hierarchies...")
    thread_map, stats = build_bluesky_threads(posts)
    print(f"✓ Processed {len(thread_map)} posts")
    print()

    # Save mappings
    output_path = output_dir / "bluesky_thread_mappings.json"
    save_thread_mappings(thread_map, output_path)

    # Generate and display report
    report = generate_thread_stats_report(thread_map, stats)
    print(report)

    # Save report
    report_path = output_dir / "bluesky_thread_report.txt"
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)
    print(f"✓ Saved report: {report_path.name}")
    print()

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
