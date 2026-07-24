#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Archive Data Validation Script

Validates and reports on the quality of archive data files.
Checks for:
- Field completeness
- Data consistency
- ID format validity
- Duplicate detection
- Relationship integrity

Run with: python scripts/validate_archive_data.py
"""

import csv
import json
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from datetime import datetime


# Configuration
PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
ARCHIVE_CSV = DATA_DIR / "archive_records-public.csv"
SOCIAL_CSV = DATA_DIR / "social_posts.csv"
ENTITIES_CSV = DATA_DIR / "extracted_entities.csv"
RELATIONSHIPS_CSV = DATA_DIR / "extracted_relationships.csv"

NODE_CSV_PARSE_SCRIPT = """
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';

const filePath = process.argv[1];
const records = parse(fs.readFileSync(filePath, 'utf8'), {
  columns: true,
  skip_empty_lines: true,
});

process.stdout.write(JSON.stringify(records));
"""

# Expected ID prefixes
VALID_ID_PREFIXES = {
    'RECORD', 'PRESSTH', 'NYT', 'WSJ', 'WP', 'LAT', 'CJR', 'WAPO',
    'TWTR', 'BSKY', 'TUMBLR', 'THREAD', 'CLIP', 'VIDEO', 'AUDIO', 'PDF'
}

# Required fields for each record type
REQUIRED_FIELDS = {
    'archive': ['id', 'title', 'author', 'publication_date'],
    'social': ['id', 'title', 'author', 'platform'],
    'entity': ['entity_id', 'entity_type', 'entity_name'],
    'relationship': ['relationship_id', 'source_record_id', 'relationship_type']
}


class ValidationReport:
    """Collects and formats validation results."""

    def __init__(self):
        self.errors = []
        self.warnings = []
        self.stats = {}

    def add_error(self, category, message):
        self.errors.append(f"[ERROR] {category}: {message}")

    def add_warning(self, category, message):
        self.warnings.append(f"[WARN] {category}: {message}")

    def add_stat(self, key, value):
        self.stats[key] = value

    def print_report(self):
        print("\n" + "="*60)
        print("ARCHIVE DATA VALIDATION REPORT")
        print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*60)

        print("\n--- STATISTICS ---")
        for key, value in self.stats.items():
            print(f"  {key}: {value}")

        if self.warnings:
            print(f"\n--- WARNINGS ({len(self.warnings)}) ---")
            for w in self.warnings[:20]:
                print(f"  {w}")
            if len(self.warnings) > 20:
                print(f"  ... and {len(self.warnings) - 20} more warnings")

        if self.errors:
            print(f"\n--- ERRORS ({len(self.errors)}) ---")
            for e in self.errors[:20]:
                print(f"  {e}")
            if len(self.errors) > 20:
                print(f"  ... and {len(self.errors) - 20} more errors")
        else:
            print("\n--- NO ERRORS FOUND ---")

        print("\n" + "="*60)
        return len(self.errors) == 0


def load_csv_with_node(filepath):
    """Load CSV using the same parser as the export and test pipeline."""
    result = subprocess.run(
        ['node', '--input-type=module', '--eval', NODE_CSV_PARSE_SCRIPT, str(filepath)],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        encoding='utf-8',
        check=True,
    )
    return json.loads(result.stdout)


def load_csv_with_python(filepath):
    """Load CSV file with Python's standard reader."""
    with open(filepath, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        return list(reader)


def load_csv(filepath):
    """Load CSV file with parser behavior aligned to the export pipeline."""
    if not filepath.exists():
        return None, f"File not found: {filepath}"

    try:
        try:
            records = load_csv_with_node(filepath)
        except (FileNotFoundError, subprocess.CalledProcessError, json.JSONDecodeError):
            records = load_csv_with_python(filepath)
        return records, None
    except Exception as e:
        return None, f"Error reading {filepath}: {e}"


def validate_id_format(record_id, record_type='archive'):
    """Check if ID follows expected format."""
    if not record_id:
        return False, "Empty ID"

    if '-' not in record_id:
        return False, f"No prefix separator: {record_id}"

    prefix = record_id.split('-')[0]
    if prefix not in VALID_ID_PREFIXES:
        return False, f"Unknown prefix '{prefix}' in {record_id}"

    return True, None


def validate_archive_records(report):
    """Validate archive_records-public.csv"""
    print("\nValidating archive records...")

    records, error = load_csv(ARCHIVE_CSV)
    if error:
        report.add_error("Archive CSV", error)
        return

    report.add_stat("Archive Records", len(records))

    # Check field completeness
    field_counts = defaultdict(int)
    id_set = set()
    duplicate_ids = []
    invalid_ids = []

    for i, record in enumerate(records):
        # Check required fields
        for field in REQUIRED_FIELDS['archive']:
            if (record.get(field) or '').strip():
                field_counts[field] += 1

        # Check ID validity
        record_id = record.get('id', '')
        valid, error = validate_id_format(record_id)
        if not valid:
            invalid_ids.append((i+2, record_id, error))

        # Check for duplicates
        if record_id in id_set:
            duplicate_ids.append(record_id)
        id_set.add(record_id)

        # Track all fields
        for field in record.keys():
            if (record.get(field) or '').strip():
                field_counts[f"has_{field}"] += 1

    # Report field completeness
    for field in REQUIRED_FIELDS['archive']:
        pct = 100 * field_counts[field] / len(records) if records else 0
        report.add_stat(f"Archive '{field}' populated", f"{field_counts[field]}/{len(records)} ({pct:.1f}%)")
        if pct < 90:
            report.add_warning("Completeness", f"'{field}' only {pct:.1f}% populated")

    # Report issues
    for row, rid, error in invalid_ids[:5]:
        report.add_error("ID Format", f"Row {row}: {error}")
    if len(invalid_ids) > 5:
        report.add_error("ID Format", f"... and {len(invalid_ids) - 5} more invalid IDs")

    for dup in duplicate_ids[:5]:
        report.add_error("Duplicate ID", dup)
    if len(duplicate_ids) > 5:
        report.add_error("Duplicates", f"... and {len(duplicate_ids) - 5} more duplicates")


def validate_social_posts(report):
    """Validate social_posts.csv"""
    print("Validating social posts...")

    records, error = load_csv(SOCIAL_CSV)
    if error:
        report.add_error("Social CSV", error)
        return

    report.add_stat("Social Posts", len(records))

    # Count by platform
    platforms = Counter()
    for record in records:
        platform = record.get('platform', 'Unknown')
        platforms[platform] += 1

    for platform, count in platforms.most_common():
        report.add_stat(f"  - {platform}", count)


def validate_entities(report):
    """Validate extracted_entities.csv"""
    print("Validating entities...")

    records, error = load_csv(ENTITIES_CSV)
    if error:
        report.add_warning("Entities CSV", error)
        return

    report.add_stat("Entities", len(records))

    # Count by type
    types = Counter()
    for record in records:
        etype = record.get('entity_type', 'Unknown')
        types[etype] += 1

    for etype, count in types.most_common():
        report.add_stat(f"  - {etype}", count)


def validate_relationships(report):
    """Validate extracted_relationships.csv"""
    print("Validating relationships...")

    records, error = load_csv(RELATIONSHIPS_CSV)
    if error:
        report.add_warning("Relationships CSV", error)
        return

    report.add_stat("Relationships", len(records))

    # Count by type
    types = Counter()
    invalid_types = []

    valid_rel_types = {
        'Mentions', 'Criticizes', 'Cites', 'Discusses', 'Expands On',
        'Affiliated With', 'Published In', 'Originated By', 'Occurred At',
        'Supports', 'Owns', 'Owned By', 'Founded By', 'Pioneered',
        'Inspired By', 'Authored By', 'Quoted', 'Interviewed', 'Responds To'
    }

    for record in records:
        rel_type = (record.get('relationship_type') or '').strip()
        types[rel_type] += 1

        # Check for malformed relationship types (CSV parsing issues)
        if rel_type and rel_type not in valid_rel_types:
            if rel_type not in [t for t, _ in invalid_types]:
                invalid_types.append((rel_type, types[rel_type]))

    for rel_type, count in types.most_common(10):
        report.add_stat(f"  - {rel_type}", count)

    # Report invalid types (likely CSV parsing errors)
    for rel_type, count in invalid_types[:5]:
        if not rel_type.replace(' ', '').replace('"', '').isalpha():
            report.add_error("Malformed Relationship", f"'{rel_type}' appears {count} times (likely CSV parsing issue)")


def validate_entity_coverage(report):
    """Check how many records have entity extraction."""
    print("Checking entity coverage...")

    # Load archive records
    archive, _ = load_csv(ARCHIVE_CSV)
    relationships, _ = load_csv(RELATIONSHIPS_CSV)

    if not relationships:
        report.add_warning("Coverage", "No relationships data to analyze")
        return

    # Get unique record IDs from relationships
    covered_records = set()
    for rel in relationships:
        rid = rel.get('source_record_id', '')
        if rid:
            covered_records.add(rid)

    archive_ids = {record.get('id', '') for record in archive or []}
    total_records = len(archive) if archive else 0
    coverage = len(covered_records & archive_ids)
    pct = 100 * coverage / total_records if total_records else 0

    report.add_stat("Archive records with entities", f"{coverage}/{total_records} ({pct:.1f}%)")

    if pct < 50:
        report.add_warning("Coverage", f"Only {pct:.1f}% of records have entity extraction")


def main():
    print("="*60)
    print("STARTING ARCHIVE DATA VALIDATION")
    print("="*60)

    report = ValidationReport()

    # Run all validations
    validate_archive_records(report)
    validate_social_posts(report)
    validate_entities(report)
    validate_relationships(report)
    validate_entity_coverage(report)

    # Print final report
    success = report.print_report()

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
