#!/usr/bin/env python3
"""
Export Merged Entity Data

Merges entities and relationships from:
1. Existing CSV files (article-based extractions)
2. SQLite database (social post extractions)

Produces final merged CSV files ready for archive integration.

Usage:
    python export_merged_data.py --output-dir data/final/
    python export_merged_data.py --validate-only
    python export_merged_data.py --stats

Author: Claude Code
Date: 2025-01-31
"""

import argparse
import csv
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Set, Tuple

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from rosen_scraper.extraction_db import ExtractionDB


# Expected schema for entities
ENTITY_COLUMNS = [
    'entity_id',
    'entity_type',
    'entity_name',
    'normalized_name',
    'role_or_description',
    'affiliation',
    'prominence_score',
    'first_mention_record_id',
    'total_mentions',
    'related_entities',
    'notes'
]

# Expected schema for relationships
RELATIONSHIP_COLUMNS = [
    'relationship_id',
    'source_entity_id',
    'target_entity_id',
    'relationship_type',
    'description',
    'evidence',
    'source_record_id',
    'strength',
    'temporal_context',
    'notes'
]


class DataExporter:
    """Exports merged entity and relationship data."""

    def __init__(self, data_dir: Path):
        """
        Initialize the exporter.

        Args:
            data_dir: Path to the data directory containing source files
        """
        self.data_dir = Path(data_dir)
        self.db_path = self.data_dir / 'extraction.db'

        # Source CSV files
        self.existing_entities_csv = self.data_dir / 'rosen_extracted_entities.csv'
        self.existing_relationships_csv = self.data_dir / 'rosen_extracted_relationships.csv'

    def load_existing_entities(self) -> List[Dict]:
        """Load entities from existing CSV file."""
        if not self.existing_entities_csv.exists():
            print(f"[EXPORT] No existing entities CSV at: {self.existing_entities_csv}")
            return []

        entities = []
        with open(self.existing_entities_csv, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                entities.append(dict(row))

        print(f"[EXPORT] Loaded {len(entities)} entities from CSV")
        return entities

    def load_existing_relationships(self) -> List[Dict]:
        """Load relationships from existing CSV file."""
        if not self.existing_relationships_csv.exists():
            print(f"[EXPORT] No existing relationships CSV at: {self.existing_relationships_csv}")
            return []

        relationships = []
        with open(self.existing_relationships_csv, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                relationships.append(dict(row))

        print(f"[EXPORT] Loaded {len(relationships)} relationships from CSV")
        return relationships

    def load_db_entities(self) -> List[Dict]:
        """Load entities from SQLite database."""
        if not self.db_path.exists():
            print(f"[EXPORT] No SQLite database at: {self.db_path}")
            return []

        db = ExtractionDB(self.db_path)
        entities = db.get_all_entities()

        # Convert to standard format
        standardized = []
        for e in entities:
            standardized.append({
                'entity_id': e.get('entity_id', ''),
                'entity_type': e.get('entity_type', ''),
                'entity_name': e.get('entity_name', ''),
                'normalized_name': e.get('normalized_name', ''),
                'role_or_description': e.get('role_or_description', ''),
                'affiliation': e.get('affiliation', ''),
                'prominence_score': e.get('prominence_score', ''),
                'first_mention_record_id': e.get('first_mention_record_id', ''),
                'total_mentions': e.get('total_mentions', '1'),
                'related_entities': e.get('related_entities', ''),
                'notes': e.get('notes', '')
            })

        print(f"[EXPORT] Loaded {len(standardized)} entities from database")
        return standardized

    def load_db_relationships(self) -> List[Dict]:
        """Load relationships from SQLite database."""
        if not self.db_path.exists():
            return []

        db = ExtractionDB(self.db_path)
        relationships = db.get_all_relationships()

        # Convert to standard format
        standardized = []
        for r in relationships:
            standardized.append({
                'relationship_id': r.get('relationship_id', ''),
                'source_entity_id': r.get('source_entity_id', ''),
                'target_entity_id': r.get('target_entity_id', ''),
                'relationship_type': r.get('relationship_type', ''),
                'description': r.get('description', ''),
                'evidence': r.get('evidence', ''),
                'source_record_id': r.get('source_record_id', ''),
                'strength': r.get('strength', ''),
                'temporal_context': r.get('temporal_context', ''),
                'notes': r.get('notes', '')
            })

        print(f"[EXPORT] Loaded {len(standardized)} relationships from database")
        return standardized

    def merge_entities(
        self,
        csv_entities: List[Dict],
        db_entities: List[Dict]
    ) -> List[Dict]:
        """
        Merge entities from CSV and database, deduplicating by entity_id.

        CSV entities take precedence (they were extracted first).

        Args:
            csv_entities: Entities from existing CSV
            db_entities: Entities from SQLite database

        Returns:
            Merged and deduplicated list of entities
        """
        # Use dict keyed by entity_id for deduplication
        merged = {}

        # Add CSV entities first (they take precedence)
        for e in csv_entities:
            entity_id = e.get('entity_id')
            if entity_id:
                merged[entity_id] = e

        # Add database entities (only if not already present)
        new_from_db = 0
        for e in db_entities:
            entity_id = e.get('entity_id')
            if entity_id and entity_id not in merged:
                merged[entity_id] = e
                new_from_db += 1

        print(f"[EXPORT] Merged entities: {len(csv_entities)} from CSV + "
              f"{new_from_db} new from DB = {len(merged)} total")

        # Sort by entity_id for consistent output
        return sorted(merged.values(), key=lambda x: x.get('entity_id', ''))

    def merge_relationships(
        self,
        csv_relationships: List[Dict],
        db_relationships: List[Dict]
    ) -> List[Dict]:
        """
        Merge relationships from CSV and database.

        Relationships are deduplicated by (source, target, type) tuple.

        Args:
            csv_relationships: Relationships from existing CSV
            db_relationships: Relationships from SQLite database

        Returns:
            Merged list of relationships
        """
        # Deduplicate by (source, target, type)
        seen = set()
        merged = []

        def rel_key(r):
            return (
                r.get('source_entity_id', ''),
                r.get('target_entity_id', ''),
                r.get('relationship_type', '')
            )

        # Add CSV relationships first
        for r in csv_relationships:
            key = rel_key(r)
            if key not in seen:
                seen.add(key)
                merged.append(r)

        # Add database relationships (only if not duplicate)
        new_from_db = 0
        for r in db_relationships:
            key = rel_key(r)
            if key not in seen:
                seen.add(key)
                merged.append(r)
                new_from_db += 1

        print(f"[EXPORT] Merged relationships: {len(csv_relationships)} from CSV + "
              f"{new_from_db} new from DB = {len(merged)} total")

        return merged

    def validate_entities(self, entities: List[Dict]) -> Tuple[bool, List[str]]:
        """
        Validate entity data for schema compliance.

        Returns:
            Tuple of (is_valid, list_of_issues)
        """
        issues = []
        valid_types = {'Person', 'Organization', 'Concept', 'Work', 'Event', 'Location'}
        valid_prefixes = {'P', 'O', 'C', 'W', 'E', 'L', 'X'}

        entity_ids = set()

        for i, e in enumerate(entities):
            entity_id = e.get('entity_id', '')

            # Check required fields
            if not entity_id:
                issues.append(f"Row {i+1}: Missing entity_id")
                continue

            if not e.get('entity_type'):
                issues.append(f"Row {i+1} ({entity_id}): Missing entity_type")

            if not e.get('entity_name'):
                issues.append(f"Row {i+1} ({entity_id}): Missing entity_name")

            # Check ID format
            if len(entity_id) < 2:
                issues.append(f"Row {i+1}: Invalid entity_id format: {entity_id}")
            elif entity_id[0] not in valid_prefixes:
                issues.append(f"Row {i+1}: Invalid prefix in entity_id: {entity_id}")
            elif not entity_id[1:].isdigit():
                issues.append(f"Row {i+1}: Invalid number in entity_id: {entity_id}")

            # Check type
            if e.get('entity_type') not in valid_types:
                issues.append(f"Row {i+1} ({entity_id}): Invalid entity_type: {e.get('entity_type')}")

            # Check for duplicates
            if entity_id in entity_ids:
                issues.append(f"Row {i+1}: Duplicate entity_id: {entity_id}")
            entity_ids.add(entity_id)

        return len(issues) == 0, issues

    def validate_relationships(
        self,
        relationships: List[Dict],
        entity_ids: Set[str]
    ) -> Tuple[bool, List[str]]:
        """
        Validate relationship data.

        Args:
            relationships: List of relationship dictionaries
            entity_ids: Set of valid entity IDs

        Returns:
            Tuple of (is_valid, list_of_issues)
        """
        issues = []
        valid_types = {
            'Mentions', 'Criticizes', 'Supports', 'Endorses', 'Cites',
            'Affiliated With', 'Works For', 'Founded', 'Collaborated With',
            'Influenced', 'Taught', 'Related To', 'Part Of', 'Responds To',
            'Developed', 'Authored By'
        }

        for i, r in enumerate(relationships):
            source_id = r.get('source_entity_id', '')
            target_id = r.get('target_entity_id', '')
            rel_type = r.get('relationship_type', '')

            # Check required fields
            if not source_id:
                issues.append(f"Row {i+1}: Missing source_entity_id")

            if not target_id:
                issues.append(f"Row {i+1}: Missing target_entity_id")

            if not rel_type:
                issues.append(f"Row {i+1}: Missing relationship_type")

            # Check entity references
            if source_id and source_id not in entity_ids:
                issues.append(f"Row {i+1}: Orphaned source_entity_id: {source_id}")

            if target_id and target_id not in entity_ids:
                issues.append(f"Row {i+1}: Orphaned target_entity_id: {target_id}")

            # Check relationship type (warning only, not strict)
            if rel_type and rel_type not in valid_types:
                # Just a warning, don't fail validation
                pass

        return len(issues) == 0, issues

    def write_csv(
        self,
        data: List[Dict],
        output_path: Path,
        columns: List[str]
    ) -> int:
        """
        Write data to CSV file.

        Args:
            data: List of dictionaries to write
            output_path: Output file path
            columns: Column order for output

        Returns:
            Number of rows written
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=columns, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(data)

        print(f"[EXPORT] Wrote {len(data)} rows to: {output_path}")
        return len(data)

    def export(
        self,
        output_dir: Path,
        validate: bool = True
    ) -> Tuple[int, int]:
        """
        Export merged data to CSV files.

        Args:
            output_dir: Directory for output files
            validate: Whether to validate data before export

        Returns:
            Tuple of (entity_count, relationship_count)
        """
        print("\n" + "=" * 60)
        print("EXPORTING MERGED ENTITY DATA")
        print("=" * 60 + "\n")

        # Load data from both sources
        csv_entities = self.load_existing_entities()
        db_entities = self.load_db_entities()

        csv_relationships = self.load_existing_relationships()
        db_relationships = self.load_db_relationships()

        # Merge
        merged_entities = self.merge_entities(csv_entities, db_entities)
        merged_relationships = self.merge_relationships(csv_relationships, db_relationships)

        # Validate if requested
        if validate:
            print("\n[EXPORT] Validating data...")

            valid_e, issues_e = self.validate_entities(merged_entities)
            if not valid_e:
                print(f"[EXPORT] Entity validation issues ({len(issues_e)}):")
                for issue in issues_e[:10]:
                    print(f"  - {issue}")
                if len(issues_e) > 10:
                    print(f"  ... and {len(issues_e) - 10} more")

            entity_ids = {e.get('entity_id') for e in merged_entities if e.get('entity_id')}
            valid_r, issues_r = self.validate_relationships(merged_relationships, entity_ids)
            if not valid_r:
                print(f"[EXPORT] Relationship validation issues ({len(issues_r)}):")
                for issue in issues_r[:10]:
                    print(f"  - {issue}")
                if len(issues_r) > 10:
                    print(f"  ... and {len(issues_r) - 10} more")

        # Write output files
        output_dir = Path(output_dir)
        timestamp = datetime.now().strftime('%Y%m%d')

        entities_path = output_dir / f'final_entities_{timestamp}.csv'
        relationships_path = output_dir / f'final_relationships_{timestamp}.csv'

        entity_count = self.write_csv(merged_entities, entities_path, ENTITY_COLUMNS)
        rel_count = self.write_csv(merged_relationships, relationships_path, RELATIONSHIP_COLUMNS)

        # Print summary
        print("\n" + "=" * 60)
        print("EXPORT COMPLETE")
        print("=" * 60)
        print("\n📦 Output files:")
        print(f"   Entities: {entities_path}")
        print(f"   Relationships: {relationships_path}")
        print("\n📊 Counts:")
        print(f"   Entities: {entity_count:,}")
        print(f"   Relationships: {rel_count:,}")

        return entity_count, rel_count

    def print_stats(self):
        """Print statistics about available data."""
        print("\n" + "=" * 60)
        print("DATA STATISTICS")
        print("=" * 60)

        # CSV stats
        csv_entities = self.load_existing_entities()
        csv_relationships = self.load_existing_relationships()

        print("\n📄 CSV Files:")
        print(f"   Entities: {len(csv_entities):,}")
        print(f"   Relationships: {len(csv_relationships):,}")

        if csv_entities:
            type_counts = defaultdict(int)
            for e in csv_entities:
                type_counts[e.get('entity_type', 'Unknown')] += 1
            print("   By type:")
            for t, c in sorted(type_counts.items()):
                print(f"      {t}: {c:,}")

        # Database stats
        if self.db_path.exists():
            db = ExtractionDB(self.db_path)
            db_stats = db.get_stats()

            print("\n💾 SQLite Database:")
            print(f"   Entities: {db_stats.get('total_entities', 0):,}")
            print(f"   Relationships: {db_stats.get('total_relationships', 0):,}")
            print(f"   Processed records: {db_stats.get('total_processed', 0):,}")

            if db_stats.get('entities_by_type'):
                print("   By type:")
                for t, c in sorted(db_stats['entities_by_type'].items()):
                    print(f"      {t}: {c:,}")
        else:
            print("\n💾 SQLite Database: Not found")

        print("\n" + "=" * 60)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Export merged entity data to CSV files'
    )

    parser.add_argument(
        '--data-dir',
        type=Path,
        default=Path(__file__).parent.parent.parent / 'data' / 'social_import',
        help='Path to data directory'
    )

    parser.add_argument(
        '--output-dir', '-o',
        type=Path,
        help='Output directory (default: data_dir/output/)'
    )

    parser.add_argument(
        '--validate-only',
        action='store_true',
        help='Only validate data, do not export'
    )

    parser.add_argument(
        '--stats', '-s',
        action='store_true',
        help='Show statistics about available data'
    )

    parser.add_argument(
        '--no-validate',
        action='store_true',
        help='Skip validation during export'
    )

    args = parser.parse_args()

    exporter = DataExporter(args.data_dir)

    if args.stats:
        exporter.print_stats()
        return 0

    if args.validate_only:
        # Load and validate only
        csv_entities = exporter.load_existing_entities()
        db_entities = exporter.load_db_entities()
        csv_relationships = exporter.load_existing_relationships()
        db_relationships = exporter.load_db_relationships()

        merged_entities = exporter.merge_entities(csv_entities, db_entities)
        merged_relationships = exporter.merge_relationships(csv_relationships, db_relationships)

        valid_e, issues_e = exporter.validate_entities(merged_entities)
        entity_ids = {e.get('entity_id') for e in merged_entities if e.get('entity_id')}
        valid_r, issues_r = exporter.validate_relationships(merged_relationships, entity_ids)

        print("\n" + "=" * 60)
        print("VALIDATION RESULTS")
        print("=" * 60)
        print(f"\nEntities: {'✅ VALID' if valid_e else '❌ INVALID'}")
        if issues_e:
            for issue in issues_e[:20]:
                print(f"  - {issue}")

        print(f"\nRelationships: {'✅ VALID' if valid_r else '❌ INVALID'}")
        if issues_r:
            for issue in issues_r[:20]:
                print(f"  - {issue}")

        return 0 if (valid_e and valid_r) else 1

    # Export
    output_dir = args.output_dir or (args.data_dir / 'output')
    exporter.export(output_dir, validate=not args.no_validate)

    return 0


if __name__ == '__main__':
    sys.exit(main())
