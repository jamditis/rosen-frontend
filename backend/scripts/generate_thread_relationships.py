#!/usr/bin/env python3
"""
Generate Thread Relationships

Convert thread hierarchies (Bluesky + Twitter) into relationship records
compatible with the archive relationships schema.

Relationship Types:
- REPLIES_TO: Post A replies to Post B
- PART_OF_THREAD: Post A is part of Thread T (root post)

Author: Claude Code
Date: 2025-12-03
"""

import json
import csv
from pathlib import Path
from typing import Dict, List
from datetime import datetime


def load_thread_mappings(json_path: Path) -> Dict:
    """Load thread mapping JSON."""
    if not json_path.exists():
        print(f"Warning: {json_path} not found")
        return {}

    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def generate_relationships_from_threads(
    thread_map: Dict,
    platform: str
) -> List[Dict]:
    """
    Generate relationship records from thread mappings.

    Args:
        thread_map: Thread hierarchy dict
        platform: "Bluesky" or "Twitter"

    Returns:
        List of relationship dicts
    """
    relationships = []
    rel_id_counter = 1

    for post_id, thread_info in thread_map.items():
        parent_id = thread_info.get('parent_id')
        root_id = thread_info.get('thread_root_id')
        confidence = thread_info.get('confidence', 1.0)

        # REPLIES_TO relationship (if has parent)
        if parent_id:
            relationships.append({
                'relationship_id': f'{platform[:4].upper()}_REL_{rel_id_counter:06d}',
                'source_record_id': post_id,
                'source_entity_id': '',
                'source_entity_name': '',
                'relationship_type': 'REPLIES_TO',
                'target_entity_id': '',
                'target_entity_name': '',
                'target_record_id': parent_id,
                'context_snippet': f'{platform} post replying to parent',
                'confidence_score': str(confidence),
                'extracted_date': datetime.now().strftime("%Y-%m-%d"),
                'platform': platform,
                'relationship_subtype': 'social_thread'
            })
            rel_id_counter += 1

        # PART_OF_THREAD relationship (if part of multi-post thread)
        if root_id and root_id != post_id:  # Not the root itself
            relationships.append({
                'relationship_id': f'{platform[:4].upper()}_REL_{rel_id_counter:06d}',
                'source_record_id': post_id,
                'source_entity_id': '',
                'source_entity_name': '',
                'relationship_type': 'PART_OF_THREAD',
                'target_entity_id': '',
                'target_entity_name': '',
                'target_record_id': root_id,
                'context_snippet': f'Part of {platform} thread starting with {root_id}',
                'confidence_score': str(confidence),
                'extracted_date': datetime.now().strftime("%Y-%m-%d"),
                'platform': platform,
                'relationship_subtype': 'social_thread'
            })
            rel_id_counter += 1

    return relationships


def save_relationships_csv(relationships: List[Dict], output_path: Path):
    """
    Save relationships to CSV.

    Args:
        relationships: List of relationship dicts
        output_path: Path to output CSV
    """
    if not relationships:
        print("No relationships to save")
        return

    fieldnames = [
        'relationship_id',
        'source_record_id',
        'source_entity_id',
        'source_entity_name',
        'relationship_type',
        'target_entity_id',
        'target_entity_name',
        'target_record_id',
        'context_snippet',
        'confidence_score',
        'extracted_date',
        'platform',
        'relationship_subtype'
    ]

    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(relationships)

    print(f"✓ Saved {len(relationships):,} relationships: {output_path.name}")


def generate_statistics(relationships: List[Dict]) -> Dict:
    """
    Generate statistics about relationships.

    Args:
        relationships: List of relationship dicts

    Returns:
        Statistics dict
    """
    stats = {
        'total_relationships': len(relationships),
        'by_type': {},
        'by_platform': {},
        'avg_confidence': 0.0
    }

    for rel in relationships:
        rel_type = rel['relationship_type']
        platform = rel.get('platform', 'Unknown')

        stats['by_type'][rel_type] = stats['by_type'].get(rel_type, 0) + 1
        stats['by_platform'][platform] = stats['by_platform'].get(platform, 0) + 1

    # Calculate average confidence
    if relationships:
        confidences = [float(r.get('confidence_score', 1.0)) for r in relationships]
        stats['avg_confidence'] = sum(confidences) / len(confidences)

    return stats


def main():
    """Main execution."""
    print("=" * 60)
    print("GENERATE THREAD RELATIONSHIPS")
    print("=" * 60)
    print()

    # Define paths
    base_dir = Path(__file__).parent.parent.parent
    output_dir = base_dir / "backend" / "output"

    bluesky_threads = output_dir / "bluesky_thread_mappings.json"
    twitter_threads = output_dir / "twitter_thread_mappings.json"

    output_csv = output_dir / "thread_relationships.csv"
    stats_json = output_dir / "thread_relationships_stats.json"

    # Load thread mappings
    print("Loading thread mappings...")
    bluesky_map = load_thread_mappings(bluesky_threads)
    twitter_map = load_thread_mappings(twitter_threads)

    print(f"✓ Bluesky: {len(bluesky_map):,} posts")
    print(f"✓ Twitter: {len(twitter_map):,} posts")
    print()

    # Generate relationships
    print("Generating relationships...")
    all_relationships = []

    if bluesky_map:
        bluesky_rels = generate_relationships_from_threads(bluesky_map, "Bluesky")
        all_relationships.extend(bluesky_rels)
        print(f"✓ Generated {len(bluesky_rels):,} Bluesky relationships")

    if twitter_map:
        twitter_rels = generate_relationships_from_threads(twitter_map, "Twitter")
        all_relationships.extend(twitter_rels)
        print(f"✓ Generated {len(twitter_rels):,} Twitter relationships")

    print()

    # Save to CSV
    save_relationships_csv(all_relationships, output_csv)

    # Generate and save statistics
    stats = generate_statistics(all_relationships)
    with open(stats_json, 'w', encoding='utf-8') as f:
        json.dump(stats, f, indent=2)

    print(f"✓ Saved statistics: {stats_json.name}")
    print()

    # Display summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total relationships: {stats['total_relationships']:,}")
    print()
    print("By Type:")
    for rel_type, count in stats['by_type'].items():
        print(f"  {rel_type}: {count:,}")
    print()
    print("By Platform:")
    for platform, count in stats['by_platform'].items():
        print(f"  {platform}: {count:,}")
    print()
    print(f"Average confidence: {stats['avg_confidence']:.3f}")
    print()
    print("=" * 60)

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
