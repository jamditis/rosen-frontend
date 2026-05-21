#!/usr/bin/env python3
"""
Unified Entity Processor for Social Posts

Prepares batches of social posts for entity extraction via Claude (Ralph Loop).
This script handles:
- Loading existing entities into the registry for deduplication
- Filtering posts by engagement, word count, and processing status
- Creating batches ready for Claude extraction
- Saving results to SQLite with resume capability

Usage:
    # Prepare next batch for extraction
    python unified_entity_processor.py --prepare-batch --batch-size 200

    # Process Claude extraction results
    python unified_entity_processor.py --process-results results.json

    # Show status and statistics
    python unified_entity_processor.py --status

    # Export for Ralph Loop
    python unified_entity_processor.py --export-for-claude --batch-size 500

Author: Claude Code
Date: 2025-01-31
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from rosen_scraper.extraction_db import ExtractionDB
from rosen_scraper.entity_registry import EntityRegistry
from rosen_scraper.csv_data_service import CSVDataService


class UnifiedEntityProcessor:
    """
    Manages entity extraction from social posts with deduplication and resume capability.
    """

    def __init__(self, data_dir: Path):
        """
        Initialize the processor.

        Args:
            data_dir: Path to the data directory (e.g., data/social_import/)
        """
        self.data_dir = Path(data_dir)

        # Initialize database for progress tracking
        self.db = ExtractionDB(self.data_dir / 'extraction.db')

        # Initialize entity registry for deduplication
        self.registry = EntityRegistry()

        # Initialize CSV service
        self.csv_service = CSVDataService()
        self.csv_service.set_data_dir(self.data_dir)

        # Load existing entities into registry
        self._load_existing_entities()

    def _load_existing_entities(self):
        """Load existing entities from CSV into the registry."""
        entities_file = self.data_dir / 'rosen_extracted_entities.csv'
        if entities_file.exists():
            count = self.registry.load_from_csv(entities_file)
            print(f"[PROCESSOR] Loaded {count} existing entities into registry")
        else:
            print(f"[PROCESSOR] No existing entities file found at {entities_file}")

    def load_social_posts(
        self,
        min_words: int = 7,
        min_chars: int = 20
    ) -> List[Dict]:
        """
        Load social posts from CSV with basic filtering.

        Args:
            min_words: Minimum word count to include
            min_chars: Minimum character length of content

        Returns:
            List of post dictionaries
        """
        posts = self.csv_service.read_social_posts()
        filtered = []

        for post in posts:
            word_count = int(post.get('word_count', 0) or 0)
            raw_text = post.get('raw_text', '').strip()

            if word_count >= min_words and len(raw_text) >= min_chars:
                filtered.append(post)

        print(f"[PROCESSOR] Loaded {len(filtered)} posts (from {len(posts)} total)")
        return filtered

    def filter_unprocessed(self, posts: List[Dict]) -> List[Dict]:
        """
        Filter out already-processed posts.

        Args:
            posts: List of post dictionaries

        Returns:
            List of unprocessed posts
        """
        processed_ids = self.db.get_processed_ids()
        unprocessed = [p for p in posts if p.get('id') not in processed_ids]
        print(f"[PROCESSOR] {len(unprocessed)} posts remaining after filtering processed")
        return unprocessed

    def prioritize_posts(
        self,
        posts: List[Dict],
        tier: int = 1
    ) -> List[Dict]:
        """
        Prioritize posts by engagement and recency.

        Tiers:
            1 = High engagement (likes >= 5 OR reposts >= 2)
            2 = Medium (recent posts from 2023+)
            3 = All remaining

        Args:
            posts: List of post dictionaries
            tier: Which tier to select

        Returns:
            Filtered and sorted posts
        """
        if tier == 1:
            # High engagement posts
            filtered = []
            for p in posts:
                likes = int(p.get('likes', 0) or 0)
                reposts = int(p.get('reposts', 0) or 0)
                if likes >= 5 or reposts >= 2:
                    filtered.append(p)
            print(f"[PROCESSOR] Tier 1 (high engagement): {len(filtered)} posts")

        elif tier == 2:
            # Recent posts (2023+) that aren't high engagement
            filtered = []
            for p in posts:
                likes = int(p.get('likes', 0) or 0)
                reposts = int(p.get('reposts', 0) or 0)
                if likes >= 5 or reposts >= 2:
                    continue  # Already in tier 1

                pub_date = p.get('publication_date', '')
                try:
                    year = int(pub_date[:4])
                    if year >= 2023:
                        filtered.append(p)
                except (ValueError, IndexError):
                    pass
            print(f"[PROCESSOR] Tier 2 (recent 2023+): {len(filtered)} posts")

        else:
            # All remaining
            tier1_ids = set()
            tier2_ids = set()

            for p in posts:
                likes = int(p.get('likes', 0) or 0)
                reposts = int(p.get('reposts', 0) or 0)
                pub_date = p.get('publication_date', '')

                if likes >= 5 or reposts >= 2:
                    tier1_ids.add(p.get('id'))
                else:
                    try:
                        year = int(pub_date[:4])
                        if year >= 2023:
                            tier2_ids.add(p.get('id'))
                    except (ValueError, IndexError):
                        pass

            filtered = [p for p in posts
                        if p.get('id') not in tier1_ids
                        and p.get('id') not in tier2_ids]
            print(f"[PROCESSOR] Tier 3 (remaining): {len(filtered)} posts")

        # Sort by engagement score (descending)
        def engagement_score(p):
            likes = int(p.get('likes', 0) or 0)
            reposts = int(p.get('reposts', 0) or 0)
            return likes + (reposts * 2)

        filtered.sort(key=engagement_score, reverse=True)
        return filtered

    def prepare_batch(
        self,
        batch_size: int = 200,
        tier: int = 1
    ) -> List[Dict]:
        """
        Prepare the next batch of posts for extraction.

        Args:
            batch_size: Number of posts in the batch
            tier: Priority tier (1=high engagement, 2=recent, 3=all)

        Returns:
            List of post dictionaries ready for extraction
        """
        # Load all posts
        all_posts = self.load_social_posts()

        # Filter unprocessed
        unprocessed = self.filter_unprocessed(all_posts)

        if not unprocessed:
            print("[PROCESSOR] No unprocessed posts remaining!")
            return []

        # Apply tier filtering
        prioritized = self.prioritize_posts(unprocessed, tier)

        if not prioritized:
            print(f"[PROCESSOR] No posts in tier {tier}, trying next tier...")
            if tier < 3:
                return self.prepare_batch(batch_size, tier + 1)
            return []

        # Take the batch
        batch = prioritized[:batch_size]
        print(f"[PROCESSOR] Prepared batch of {len(batch)} posts")

        return batch

    def export_batch_for_claude(
        self,
        batch: List[Dict],
        output_path: Optional[Path] = None
    ) -> Path:
        """
        Export a batch of posts in a format suitable for Claude extraction.

        Creates a markdown file with posts and extraction instructions that
        can be used in a Ralph Loop iteration.

        Args:
            batch: List of post dictionaries
            output_path: Optional custom output path

        Returns:
            Path to the exported file
        """
        if output_path is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_path = self.data_dir / f'batch_{timestamp}.md'

        # Build the prompt content
        content = [
            "# Entity Extraction Batch",
            "",
            f"**Batch created:** {datetime.now().isoformat()}",
            f"**Total posts:** {len(batch)}",
            "",
            "## Instructions",
            "",
            "Extract entities and relationships from each post below. For each post:",
            "",
            "1. **Entities** (Person, Organization, Concept, Work, Event, Location)",
            "   - Include: name, type, role/description, affiliation",
            "   - Skip the post author (Jay Rosen) unless explicitly referenced",
            "",
            "2. **Relationships** (15 types: Mentions, Criticizes, Supports, Affiliated With, etc.)",
            "   - source_entity → relationship_type → target_entity",
            "   - Include brief context/evidence",
            "",
            "## Output Format",
            "",
            "For each post, return JSON:",
            "```json",
            "{",
            '  "post_id": "BSKY-XXXXX",',
            '  "entities": [',
            '    {"entity_type": "Person", "entity_name": "...", "role": "...", "affiliation": "..."},',
            '    {"entity_type": "Organization", "entity_name": "...", "org_type": "..."}',
            "  ],",
            '  "relationships": [',
            '    {"source": "Person Name", "type": "Criticizes", "target": "Organization Name", "context": "..."}',
            "  ]",
            "}",
            "```",
            "",
            "---",
            "",
            "## Posts to Process",
            ""
        ]

        for i, post in enumerate(batch, 1):
            post_id = post.get('id', f'POST-{i}')
            raw_text = post.get('raw_text', '')
            pub_date = post.get('publication_date', '')
            likes = post.get('likes', 0)
            reposts = post.get('reposts', 0)

            content.extend([
                f"### Post {i}: {post_id}",
                f"**Date:** {pub_date} | **Likes:** {likes} | **Reposts:** {reposts}",
                "",
                f"> {raw_text}",
                "",
                "---",
                ""
            ])

        output_path.write_text('\n'.join(content), encoding='utf-8')
        print(f"[PROCESSOR] Exported batch to: {output_path}")
        return output_path

    def process_extraction_results(
        self,
        results: List[Dict],
        session_id: Optional[int] = None
    ) -> Tuple[int, int, int]:
        """
        Process extraction results from Claude and save to database.

        Args:
            results: List of extraction results, each with:
                - post_id: The source post ID
                - entities: List of extracted entities
                - relationships: List of extracted relationships

        Returns:
            Tuple of (posts_processed, entities_saved, relationships_saved)
        """
        posts_processed = 0
        total_entities = 0
        total_relationships = 0

        for result in results:
            post_id = result.get('post_id')
            if not post_id:
                print("[PROCESSOR] WARNING: Result missing post_id, skipping")
                continue

            entities = result.get('entities', [])
            relationships = result.get('relationships', [])

            # Normalize simplified entity format to full format
            for entity in entities:
                # Handle role/description variations
                if 'role' in entity and 'role_or_description' not in entity:
                    entity['role_or_description'] = entity.pop('role')
                if 'org_type' in entity and 'role_or_description' not in entity:
                    entity['role_or_description'] = entity.pop('org_type')
                if 'description' in entity and 'role_or_description' not in entity:
                    entity['role_or_description'] = entity.pop('description')

            # Normalize simplified relationship format to full format
            for rel in relationships:
                # Handle simplified format: source/type/target -> full format
                if 'source' in rel and 'source_entity_id' not in rel:
                    rel['source_entity_id'] = rel.pop('source')
                if 'target' in rel and 'target_entity_id' not in rel:
                    rel['target_entity_id'] = rel.pop('target')
                if 'type' in rel and 'relationship_type' not in rel:
                    rel['relationship_type'] = rel.pop('type')
                if 'context' in rel and 'evidence' not in rel:
                    rel['evidence'] = rel.pop('context')

            # Deduplicate entities through registry
            updated_entities, id_mapping, existing_count, new_count = \
                self.registry.reassign_entity_ids(entities)

            # Build name-to-id mapping for relationships that use names
            # Include both new entities and existing registry entities
            name_to_id = {}
            for entity in updated_entities:
                name = entity.get('entity_name', '')
                eid = entity.get('entity_id', '')
                if name and eid:
                    name_to_id[name] = eid
                    name_to_id[name.lower()] = eid

            # Also include all entities from registry
            for eid, entity_data in self.registry.entities.items():
                name = entity_data.get('entity_name', '')
                if name:
                    name_to_id[name] = eid
                    name_to_id[name.lower()] = eid

            # Convert relationship entity names to IDs if needed
            for rel in relationships:
                source = rel.get('source_entity_id', '')
                target = rel.get('target_entity_id', '')

                # If source/target look like names (not IDs like P0001), convert
                if source and not (len(source) >= 2 and source[0] in 'POCWEL' and source[1:].isdigit()):
                    rel['source_entity_id'] = name_to_id.get(source, name_to_id.get(source.lower(), source))
                if target and not (len(target) >= 2 and target[0] in 'POCWEL' and target[1:].isdigit()):
                    rel['target_entity_id'] = name_to_id.get(target, name_to_id.get(target.lower(), target))

            # Update relationship IDs using the registry's mapping
            updated_relationships = self.registry.update_relationship_ids(
                relationships, id_mapping
            )

            # Add source record ID to entities and relationships
            for entity in updated_entities:
                if not entity.get('first_mention_record_id'):
                    entity['first_mention_record_id'] = post_id

            for rel in updated_relationships:
                rel['source_record_id'] = post_id

            # Save to database
            if updated_entities:
                self.db.save_entities(updated_entities)
                total_entities += len(updated_entities)

            if updated_relationships:
                self.db.save_relationships(updated_relationships)
                total_relationships += len(updated_relationships)

            # Mark post as processed
            self.db.mark_processed(
                post_id,
                entity_count=len(updated_entities),
                relationship_count=len(updated_relationships)
            )
            posts_processed += 1

            print(f"[PROCESSOR] {post_id}: {len(updated_entities)} entities "
                  f"({new_count} new, {existing_count} existing), "
                  f"{len(updated_relationships)} relationships")

        # Update session if provided
        if session_id:
            stats = self.db.get_stats()
            self.db.update_session_progress(
                session_id,
                processed_count=stats.get('total_processed', 0),
                entity_count=stats.get('total_entities', 0),
                relationship_count=stats.get('total_relationships', 0),
                last_record_id=results[-1].get('post_id', '') if results else ''
            )

        return posts_processed, total_entities, total_relationships

    def import_json_results(self, json_path: Path) -> Tuple[int, int, int]:
        """
        Import extraction results from a JSON file.

        Args:
            json_path: Path to JSON file containing extraction results

        Returns:
            Tuple of (posts_processed, entities_saved, relationships_saved)
        """
        with open(json_path, 'r', encoding='utf-8') as f:
            results = json.load(f)

        if isinstance(results, dict):
            # Single result wrapped in dict
            results = [results]

        return self.process_extraction_results(results)

    def get_status(self) -> Dict:
        """
        Get current processing status.

        Returns:
            Dictionary with status information
        """
        stats = self.db.get_stats()

        # Count total posts
        all_posts = self.load_social_posts()
        unprocessed = self.filter_unprocessed(all_posts)

        status = {
            'total_posts': len(all_posts),
            'processed_posts': stats.get('total_processed', 0),
            'remaining_posts': len(unprocessed),
            'progress_pct': round(
                100 * stats.get('total_processed', 0) / len(all_posts), 1
            ) if all_posts else 0,
            'entities_in_db': stats.get('total_entities', 0),
            'relationships_in_db': stats.get('total_relationships', 0),
            'entities_in_registry': len(self.registry.entities),
            'failed_posts': len(self.db.get_failed_records()),
            'by_status': stats.get('processed_by_status', {}),
            'entities_by_type': stats.get('entities_by_type', {}),
            'relationships_by_type': stats.get('relationships_by_type', {})
        }

        return status

    def print_status(self):
        """Print a formatted status report."""
        status = self.get_status()

        print("\n" + "=" * 60)
        print("ENTITY EXTRACTION STATUS")
        print("=" * 60)

        print("\n[PROGRESS]")
        print(f"   Total posts:     {status['total_posts']:,}")
        print(f"   Processed:       {status['processed_posts']:,}")
        print(f"   Remaining:       {status['remaining_posts']:,}")
        print(f"   Progress:        {status['progress_pct']}%")

        print("\n[DATABASE]")
        print(f"   Entities:        {status['entities_in_db']:,}")
        print(f"   Relationships:   {status['relationships_in_db']:,}")

        print("\n[REGISTRY]")
        print(f"   Total entities:  {status['entities_in_registry']:,}")

        if status.get('entities_by_type'):
            print("\n[ENTITIES BY TYPE]")
            for etype, count in sorted(status['entities_by_type'].items()):
                print(f"   {etype}: {count:,}")

        if status.get('failed_posts', 0) > 0:
            print(f"\n[WARNING] Failed posts: {status['failed_posts']}")

        print("\n" + "=" * 60)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Unified Entity Processor for Social Posts'
    )

    parser.add_argument(
        '--data-dir',
        type=Path,
        default=Path(__file__).parent.parent.parent / 'data' / 'social_import',
        help='Path to data directory'
    )

    # Action arguments
    parser.add_argument(
        '--status', '-s',
        action='store_true',
        help='Show current processing status'
    )

    parser.add_argument(
        '--prepare-batch',
        action='store_true',
        help='Prepare next batch for extraction'
    )

    parser.add_argument(
        '--export-for-claude',
        action='store_true',
        help='Export batch in markdown format for Claude extraction'
    )

    parser.add_argument(
        '--process-results',
        type=Path,
        help='Process extraction results from JSON file'
    )

    # Options
    parser.add_argument(
        '--batch-size', '-b',
        type=int,
        default=200,
        help='Number of posts per batch (default: 200)'
    )

    parser.add_argument(
        '--tier', '-t',
        type=int,
        choices=[1, 2, 3],
        default=1,
        help='Priority tier (1=high engagement, 2=recent, 3=all)'
    )

    parser.add_argument(
        '--output', '-o',
        type=Path,
        help='Output file path for exports'
    )

    args = parser.parse_args()

    # Initialize processor
    processor = UnifiedEntityProcessor(args.data_dir)

    # Execute requested action
    if args.status:
        processor.print_status()

    elif args.prepare_batch:
        batch = processor.prepare_batch(args.batch_size, args.tier)
        if batch:
            # Save batch info to JSON for reference
            output = args.output or (args.data_dir / 'current_batch.json')
            batch_ids = [p.get('id') for p in batch]
            with open(output, 'w', encoding='utf-8') as f:
                json.dump({'batch_ids': batch_ids, 'count': len(batch)}, f, indent=2)
            print(f"[PROCESSOR] Batch info saved to: {output}")

    elif args.export_for_claude:
        batch = processor.prepare_batch(args.batch_size, args.tier)
        if batch:
            output = processor.export_batch_for_claude(batch, args.output)
            print("\n[SUCCESS] Ready for Claude extraction!")
            print(f"   File: {output}")
            print(f"   Posts: {len(batch)}")

    elif args.process_results:
        if not args.process_results.exists():
            print(f"ERROR: Results file not found: {args.process_results}")
            return 1

        posts, entities, rels = processor.import_json_results(args.process_results)
        print(f"\n[SUCCESS] Processed {posts} posts")
        print(f"   Entities saved: {entities}")
        print(f"   Relationships saved: {rels}")

    else:
        # Default: show status
        processor.print_status()

    return 0


if __name__ == '__main__':
    sys.exit(main())
