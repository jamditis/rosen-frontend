#!/usr/bin/env python3
"""
Build Relationships Between Archive Records

This script analyzes archive records and builds a relationship network based on:
1. Shared thematic categories
2. Shared key concepts
3. Similar titles (fuzzy matching)
4. Same era
5. Related entities (from extracted_relationships.csv)

The script scores each relationship and updates the `related_to` field with
the top 3-5 most related record IDs.

Usage:
    python backend/scripts/build_record_relationships.py [--dry-run] [--top-n 5]

Author: Joe Amditis
Date: 2026-01-06
"""

import csv
import sys
from pathlib import Path
from collections import defaultdict
from difflib import SequenceMatcher
from typing import Dict, List, Set, Tuple
import argparse


class RelationshipBuilder:
    """Builds relationships between archive records."""

    def __init__(self, top_n: int = 5):
        """
        Initialize the relationship builder.

        Args:
            top_n: Maximum number of related records to store per record
        """
        self.top_n = top_n
        self.records: Dict[str, dict] = {}
        self.entity_graph: Dict[str, Set[str]] = defaultdict(set)
        self.category_index: Dict[str, Set[str]] = defaultdict(set)
        self.concept_index: Dict[str, Set[str]] = defaultdict(set)
        self.era_index: Dict[str, Set[str]] = defaultdict(set)
        self.tag_index: Dict[str, Set[str]] = defaultdict(set)

        # Weights for scoring (sum = 1.0)
        self.weights = {
            'category_overlap': 0.30,
            'concept_overlap': 0.25,
            'entity_connection': 0.20,
            'era_match': 0.10,
            'tag_overlap': 0.10,
            'title_similarity': 0.05,
        }

    def load_records(self, csv_path: Path) -> None:
        """Load archive records from CSV."""
        print(f"Loading records from {csv_path}...")

        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                record_id = row['id']
                self.records[record_id] = row

                # Build indexes for fast lookup
                categories = self._parse_list_field(row.get('thematic_categories', ''))
                for cat in categories:
                    self.category_index[cat].add(record_id)

                concepts = self._parse_list_field(row.get('key_concepts', ''))
                for concept in concepts:
                    self.concept_index[concept].add(record_id)

                era = row.get('era', '').strip()
                if era:
                    self.era_index[era].add(record_id)

                tags = self._parse_list_field(row.get('tags', ''))
                for tag in tags:
                    self.tag_index[tag].add(record_id)

        print(f"Loaded {len(self.records)} records")
        print(f"  {len(self.category_index)} unique categories")
        print(f"  {len(self.concept_index)} unique concepts")
        print(f"  {len(self.era_index)} unique eras")
        print(f"  {len(self.tag_index)} unique tags")

    def load_entity_relationships(self, csv_path: Path) -> None:
        """Load entity relationships and build entity connection graph."""
        print(f"\nLoading entity relationships from {csv_path}...")

        entity_to_records: Dict[str, Set[str]] = defaultdict(set)

        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                record_id = row['source_record_id']
                source_entity = row['source_entity_name']
                target_entity = row['target_entity_name']

                # Map entities to records they appear in
                entity_to_records[source_entity].add(record_id)
                entity_to_records[target_entity].add(record_id)

        # Build graph: record -> set of records sharing entities
        for entity, records in entity_to_records.items():
            if len(records) > 1:  # Only if entity appears in multiple records
                for record_id in records:
                    # Add all other records sharing this entity
                    self.entity_graph[record_id].update(records - {record_id})

        total_connections = sum(len(connections) for connections in self.entity_graph.values())
        print(f"Built entity graph with {len(entity_to_records)} entities")
        print(f"  {len(self.entity_graph)} records have entity connections")
        print(f"  {total_connections} total entity-based connections")

    def _parse_list_field(self, field: str) -> List[str]:
        """Parse comma-separated field into list, handling empty values."""
        if not field or field.strip() == '':
            return []
        return [item.strip() for item in field.split(',') if item.strip()]

    def calculate_similarity(self, record_id_a: str, record_id_b: str) -> float:
        """
        Calculate similarity score between two records.

        Returns a score between 0.0 and 1.0.
        """
        record_a = self.records[record_id_a]
        record_b = self.records[record_id_b]

        score = 0.0

        # 1. Category overlap
        cats_a = set(self._parse_list_field(record_a.get('thematic_categories', '')))
        cats_b = set(self._parse_list_field(record_b.get('thematic_categories', '')))
        if cats_a and cats_b:
            category_score = len(cats_a & cats_b) / len(cats_a | cats_b)
            score += category_score * self.weights['category_overlap']

        # 2. Concept overlap
        concepts_a = set(self._parse_list_field(record_a.get('key_concepts', '')))
        concepts_b = set(self._parse_list_field(record_b.get('key_concepts', '')))
        if concepts_a and concepts_b:
            concept_score = len(concepts_a & concepts_b) / len(concepts_a | concepts_b)
            score += concept_score * self.weights['concept_overlap']

        # 3. Entity connections
        if record_id_b in self.entity_graph.get(record_id_a, set()):
            # Count shared entities
            entities_a = self.entity_graph.get(record_id_a, set())
            entities_b = self.entity_graph.get(record_id_b, set())
            shared_connections = len(entities_a & entities_b)
            total_connections = len(entities_a | entities_b)
            if total_connections > 0:
                entity_score = shared_connections / total_connections
                score += entity_score * self.weights['entity_connection']
            else:
                score += 1.0 * self.weights['entity_connection']

        # 4. Era match
        era_a = record_a.get('era', '').strip()
        era_b = record_b.get('era', '').strip()
        if era_a and era_b and era_a == era_b:
            score += 1.0 * self.weights['era_match']

        # 5. Tag overlap
        tags_a = set(self._parse_list_field(record_a.get('tags', '')))
        tags_b = set(self._parse_list_field(record_b.get('tags', '')))
        if tags_a and tags_b:
            tag_score = len(tags_a & tags_b) / len(tags_a | tags_b)
            score += tag_score * self.weights['tag_overlap']

        # 6. Title similarity (using fuzzy matching)
        title_a = record_a.get('title', '').lower()
        title_b = record_b.get('title', '').lower()
        if title_a and title_b:
            # Use SequenceMatcher for fuzzy title matching
            title_score = SequenceMatcher(None, title_a, title_b).ratio()
            score += title_score * self.weights['title_similarity']

        return score

    def find_related_records(self, record_id: str) -> List[Tuple[str, float]]:
        """
        Find related records for a given record.

        Returns list of (record_id, score) tuples, sorted by score descending.
        """
        record = self.records[record_id]
        candidates = set()

        # Gather candidates from indexes
        categories = set(self._parse_list_field(record.get('thematic_categories', '')))
        for cat in categories:
            candidates.update(self.category_index[cat])

        concepts = set(self._parse_list_field(record.get('key_concepts', '')))
        for concept in concepts:
            candidates.update(self.concept_index[concept])

        era = record.get('era', '').strip()
        if era:
            candidates.update(self.era_index[era])

        tags = set(self._parse_list_field(record.get('tags', '')))
        for tag in tags:
            candidates.update(self.tag_index[tag])

        # Add entity-connected records
        candidates.update(self.entity_graph.get(record_id, set()))

        # Remove self
        candidates.discard(record_id)

        # Calculate scores for all candidates
        scored_candidates = []
        for candidate_id in candidates:
            score = self.calculate_similarity(record_id, candidate_id)
            if score > 0.15:  # Minimum threshold for relatedness
                scored_candidates.append((candidate_id, score))

        # Sort by score descending and return top N
        scored_candidates.sort(key=lambda x: x[1], reverse=True)
        return scored_candidates[:self.top_n]

    def build_all_relationships(self) -> Dict[str, List[str]]:
        """
        Build relationships for all records.

        Returns dict mapping record_id -> list of related record IDs.
        """
        print(f"\nBuilding relationships for {len(self.records)} records...")
        print(f"Minimum threshold: 0.15, Top-N: {self.top_n}")

        relationships = {}
        total_relationships = 0

        for i, record_id in enumerate(self.records.keys(), 1):
            related = self.find_related_records(record_id)
            relationships[record_id] = [r[0] for r in related]
            total_relationships += len(related)

            if i % 50 == 0:
                print(f"  Processed {i}/{len(self.records)} records...")

        avg_relationships = total_relationships / len(self.records) if self.records else 0
        print(f"\nRelationship building complete!")
        print(f"  Total relationships: {total_relationships}")
        print(f"  Average per record: {avg_relationships:.2f}")

        # Find records with no relationships
        no_relationships = [rid for rid, rels in relationships.items() if not rels]
        if no_relationships:
            print(f"  Records with no relationships: {len(no_relationships)}")

        return relationships

    def update_csv(self, csv_path: Path, relationships: Dict[str, List[str]], dry_run: bool = False) -> None:
        """
        Update the CSV file with new relationships.

        Args:
            csv_path: Path to archive_records-public.csv
            relationships: Dict mapping record_id -> list of related record IDs
            dry_run: If True, don't actually write the file
        """
        if dry_run:
            print("\n[DRY RUN] Would update CSV with relationships")
            return

        print(f"\nUpdating {csv_path} with relationships...")

        # Read all rows
        rows = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            for row in reader:
                record_id = row['id']
                if record_id in relationships:
                    # Update related_to field
                    row['related_to'] = ', '.join(relationships[record_id])
                rows.append(row)

        # Write back
        output_path = csv_path.parent / f"{csv_path.stem}_updated{csv_path.suffix}"
        with open(output_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

        print(f"Updated CSV written to: {output_path}")
        print(f"To replace original: mv {output_path} {csv_path}")

    def generate_report(self, relationships: Dict[str, List[str]], output_path: Path) -> None:
        """Generate a detailed relationship network report."""
        print(f"\nGenerating report to {output_path}...")

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("# Archive Record Relationship Report\n")
            f.write(f"Generated: {Path(__file__).name}\n\n")

            f.write("## Summary Statistics\n\n")
            f.write(f"- Total records: {len(self.records)}\n")
            f.write(f"- Records with relationships: {sum(1 for r in relationships.values() if r)}\n")
            f.write(f"- Total relationships: {sum(len(r) for r in relationships.values())}\n")
            f.write(f"- Average relationships per record: {sum(len(r) for r in relationships.values()) / len(self.records):.2f}\n\n")

            f.write("## Relationship Strength Distribution\n\n")
            f.write("Showing top 20 most connected records:\n\n")

            # Sort by number of relationships
            sorted_records = sorted(
                relationships.items(),
                key=lambda x: len(x[1]),
                reverse=True
            )[:20]

            for record_id, related_ids in sorted_records:
                record = self.records[record_id]
                title = record.get('title', 'Untitled')[:80]
                f.write(f"- **{record_id}**: {len(related_ids)} relationships\n")
                f.write(f"  - Title: {title}\n")
                f.write(f"  - Related to: {', '.join(related_ids)}\n\n")

            f.write("\n## Sample Relationships (First 10 Records)\n\n")

            for i, (record_id, related_ids) in enumerate(list(relationships.items())[:10], 1):
                record = self.records[record_id]
                title = record.get('title', 'Untitled')

                f.write(f"### {i}. {record_id}: {title}\n\n")

                if not related_ids:
                    f.write("*No relationships found*\n\n")
                    continue

                for related_id in related_ids:
                    related_record = self.records[related_id]
                    related_title = related_record.get('title', 'Untitled')

                    # Calculate and display score
                    score = self.calculate_similarity(record_id, related_id)

                    f.write(f"- **{related_id}** (score: {score:.3f})\n")
                    f.write(f"  - Title: {related_title}\n")

                    # Show why they're related
                    reasons = []

                    cats_a = set(self._parse_list_field(record.get('thematic_categories', '')))
                    cats_b = set(self._parse_list_field(related_record.get('thematic_categories', '')))
                    if cats_a & cats_b:
                        reasons.append(f"Shared categories: {', '.join(cats_a & cats_b)}")

                    concepts_a = set(self._parse_list_field(record.get('key_concepts', '')))
                    concepts_b = set(self._parse_list_field(related_record.get('key_concepts', '')))
                    if concepts_a & concepts_b:
                        reasons.append(f"Shared concepts: {', '.join(concepts_a & concepts_b)}")

                    if record.get('era') == related_record.get('era') and record.get('era'):
                        reasons.append(f"Same era: {record.get('era')}")

                    if related_id in self.entity_graph.get(record_id, set()):
                        reasons.append("Shared entities")

                    for reason in reasons:
                        f.write(f"    - {reason}\n")

                    f.write("\n")

        print(f"Report written to: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Build relationships between archive records"
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help="Don't update CSV, just generate report"
    )
    parser.add_argument(
        '--top-n',
        type=int,
        default=5,
        help="Maximum number of related records per record (default: 5)"
    )

    args = parser.parse_args()

    # Set paths
    repo_root = Path(__file__).parent.parent.parent
    data_dir = repo_root / 'data'
    archive_csv = data_dir / 'archive_records-public.csv'
    relationships_csv = data_dir / 'extracted_relationships.csv'
    report_path = repo_root / 'backend' / 'RELATIONSHIP_REPORT.md'

    # Validate paths
    if not archive_csv.exists():
        print(f"ERROR: Archive CSV not found: {archive_csv}")
        sys.exit(1)

    if not relationships_csv.exists():
        print(f"WARNING: Entity relationships CSV not found: {relationships_csv}")
        print("Continuing without entity connections...")

    # Build relationships
    builder = RelationshipBuilder(top_n=args.top_n)
    builder.load_records(archive_csv)

    if relationships_csv.exists():
        builder.load_entity_relationships(relationships_csv)

    relationships = builder.build_all_relationships()

    # Generate report
    builder.generate_report(relationships, report_path)

    # Update CSV (unless dry run)
    builder.update_csv(archive_csv, relationships, dry_run=args.dry_run)

    print("\n✅ Done!")
    if args.dry_run:
        print("(Dry run - no files were modified)")


if __name__ == '__main__':
    main()
