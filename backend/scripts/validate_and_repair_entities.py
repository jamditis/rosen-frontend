#!/usr/bin/env python3
"""
Rosen Archive Entity/Relationship Validation and Repair Script

This script identifies and repairs data integrity issues in the entity/relationship files:
1. Zero-padding malformed entity IDs (O05 -> O0005)
2. Creating stub entities for missing references
3. Mapping entity names used as IDs to actual entity IDs
4. Generating a validation report

Usage:
    python validate_and_repair_entities.py [--dry-run] [--report-only]
"""

import csv
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# Configuration
DATA_DIR = Path(__file__).parent.parent.parent / "data"
ENTITIES_FILE = DATA_DIR / "extracted_entities.csv"
RELATIONSHIPS_FILE = DATA_DIR / "extracted_relationships.csv"

# Entity type mappings
ENTITY_TYPE_PREFIXES = {
    'P': 'Person',
    'O': 'Organization',
    'C': 'Concept',
    'W': 'Work',
    'E': 'Event',
    'L': 'Location'
}


def load_entities():
    """Load all entities and build lookup indexes."""
    entities = {}
    entities_by_name = defaultdict(list)  # normalized_name -> list of entity_ids
    max_ids = {prefix: 0 for prefix in ENTITY_TYPE_PREFIXES}

    with open(ENTITIES_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            eid = row['entity_id']
            entities[eid] = row

            # Index by normalized name
            norm_name = row.get('normalized_name', '').strip().lower()
            if norm_name:
                entities_by_name[norm_name].append(eid)

            # Track max ID for each prefix
            match = re.match(r'([A-Z])(\d+)', eid)
            if match:
                prefix, num = match.groups()
                if prefix in max_ids:
                    max_ids[prefix] = max(max_ids[prefix], int(num))

    return entities, entities_by_name, max_ids, fieldnames


def analyze_relationships(entities, entities_by_name):
    """Analyze relationships and identify issues."""
    issues = {
        'zero_padding': [],      # Can fix by zero-padding ID
        'name_as_id': [],        # Entity name used as ID, can map to existing
        'missing_with_name': [], # Missing ID but have a name to create stub
        'unfixable': []          # Cannot repair
    }

    with open(RELATIONSHIPS_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    for row in rows:
        for col, name_col in [('source_entity_id', 'source_entity_name'),
                               ('target_entity_id', 'target_entity_name')]:
            eid = row[col].strip()
            if not eid:
                continue

            # Already valid
            if eid in entities:
                continue

            # Check if zero-padding would fix it
            match = re.match(r'^([A-Z])(\d{1,3})$', eid)
            if match:
                prefix, num = match.groups()
                fixed_id = f"{prefix}{num.zfill(4)}"
                if fixed_id in entities:
                    issues['zero_padding'].append({
                        'rel_id': row['relationship_id'],
                        'column': col,
                        'old_id': eid,
                        'new_id': fixed_id,
                        'entity_name': row[name_col]
                    })
                    continue

            # Check if it's an entity name that can be mapped
            name_lower = eid.lower().strip()
            if name_lower in entities_by_name:
                issues['name_as_id'].append({
                    'rel_id': row['relationship_id'],
                    'column': col,
                    'name_used_as_id': eid,
                    'matching_ids': entities_by_name[name_lower],
                    'entity_name': row[name_col]
                })
                continue

            # Check if we can create a stub entity
            entity_name = row[name_col].strip()
            if entity_name and entity_name != eid and len(entity_name) > 2:
                issues['missing_with_name'].append({
                    'rel_id': row['relationship_id'],
                    'column': col,
                    'missing_id': eid,
                    'entity_name': entity_name,
                    'record_id': row['source_record_id']
                })
            else:
                issues['unfixable'].append({
                    'rel_id': row['relationship_id'],
                    'column': col,
                    'bad_id': eid,
                    'entity_name': row[name_col]
                })

    return issues, rows, fieldnames


def generate_stub_entities(issues, max_ids, entity_fieldnames):
    """Generate stub entities for missing references."""
    stubs = []
    id_mapping = {}  # old_id -> new_stub_id

    # Group missing entities by their ID to avoid duplicates
    missing_by_id = defaultdict(list)
    for issue in issues['missing_with_name']:
        missing_by_id[issue['missing_id']].append(issue)

    for old_id, refs in missing_by_id.items():
        # Determine entity type from ID prefix
        prefix = old_id[0] if old_id and old_id[0] in ENTITY_TYPE_PREFIXES else None

        if not prefix:
            # Try to infer type from name
            name = refs[0]['entity_name']
            # Simple heuristics
            if any(word in name.lower() for word in ['concept', 'theory', 'idea', 'movement']):
                prefix = 'C'
            elif any(word in name.lower() for word in ['journal', 'news', 'times', 'post', 'magazine']):
                prefix = 'O'
            else:
                prefix = 'C'  # Default to Concept

        # Generate new ID
        max_ids[prefix] += 1
        new_id = f"{prefix}{str(max_ids[prefix]).zfill(4)}"
        id_mapping[old_id] = new_id

        # Get best name from references
        names = [r['entity_name'] for r in refs if r['entity_name']]
        best_name = max(names, key=len) if names else old_id

        # Create stub entity
        stub = {
            'entity_id': new_id,
            'entity_type': ENTITY_TYPE_PREFIXES[prefix],
            'entity_name': best_name,
            'normalized_name': best_name.lower(),
            'role_or_description': '[Auto-generated stub - needs review]',
            'affiliation': '',
            'prominence_score': '1',
            'first_mention_record_id': refs[0]['record_id'],
            'total_mentions': str(len(refs)),
            'related_entities': '',
            'notes': f'Stub created {datetime.now().isoformat()} from missing ID {old_id}'
        }
        stubs.append(stub)

    return stubs, id_mapping


def apply_repairs(issues, id_mapping, rel_rows, rel_fieldnames, dry_run=False):
    """Apply repairs to the relationships file."""
    repairs_made = 0

    # Build lookup for quick access
    rows_by_id = {row['relationship_id']: row for row in rel_rows}

    # Apply zero-padding fixes
    for fix in issues['zero_padding']:
        row = rows_by_id.get(fix['rel_id'])
        if row:
            if not dry_run:
                row[fix['column']] = fix['new_id']
            repairs_made += 1

    # Apply name-as-id fixes (use first matching ID)
    for fix in issues['name_as_id']:
        row = rows_by_id.get(fix['rel_id'])
        if row and fix['matching_ids']:
            if not dry_run:
                row[fix['column']] = fix['matching_ids'][0]
            repairs_made += 1

    # Apply ID mapping for stub entities
    for fix in issues['missing_with_name']:
        row = rows_by_id.get(fix['rel_id'])
        if row and fix['missing_id'] in id_mapping:
            if not dry_run:
                row[fix['column']] = id_mapping[fix['missing_id']]
            repairs_made += 1

    return repairs_made


def write_repaired_files(entities, stubs, rel_rows, entity_fieldnames, rel_fieldnames, dry_run=False):
    """Write repaired data back to files."""
    if dry_run:
        print("\n[DRY RUN] Would write the following files:")
        print(f"  - {ENTITIES_FILE} (+ {len(stubs)} new entities)")
        print(f"  - {RELATIONSHIPS_FILE} (repaired)")
        return

    # Backup original files
    backup_suffix = datetime.now().strftime('%Y%m%d_%H%M%S')
    ENTITIES_FILE.rename(ENTITIES_FILE.with_suffix(f'.csv.bak.{backup_suffix}'))
    RELATIONSHIPS_FILE.rename(RELATIONSHIPS_FILE.with_suffix(f'.csv.bak.{backup_suffix}'))

    # Write entities with stubs
    with open(ENTITIES_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=entity_fieldnames)
        writer.writeheader()
        for eid in sorted(entities.keys()):
            writer.writerow(entities[eid])
        for stub in stubs:
            writer.writerow(stub)

    # Write repaired relationships
    with open(RELATIONSHIPS_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=rel_fieldnames)
        writer.writeheader()
        writer.writerows(rel_rows)

    print("\n✓ Files written successfully:")
    print(f"  - {ENTITIES_FILE}")
    print(f"  - {RELATIONSHIPS_FILE}")
    print(f"  - Backups created with suffix .bak.{backup_suffix}")


def generate_report(issues, stubs, repairs_made):
    """Generate a validation report."""
    report = []
    report.append("=" * 60)
    report.append("ROSEN ARCHIVE ENTITY VALIDATION REPORT")
    report.append(f"Generated: {datetime.now().isoformat()}")
    report.append("=" * 60)

    report.append("\n## SUMMARY\n")
    report.append(f"Zero-padding fixes:      {len(issues['zero_padding']):>5}")
    report.append(f"Name-as-ID fixes:        {len(issues['name_as_id']):>5}")
    report.append(f"Stub entities created:   {len(stubs):>5}")
    report.append(f"Unfixable issues:        {len(issues['unfixable']):>5}")
    report.append(f"Total repairs made:      {repairs_made:>5}")

    if issues['unfixable']:
        report.append("\n## UNFIXABLE ISSUES (require manual review)\n")
        for issue in issues['unfixable'][:20]:
            report.append(f"  {issue['rel_id']}: {issue['column']}='{issue['bad_id']}' (name: {issue['entity_name']})")
        if len(issues['unfixable']) > 20:
            report.append(f"  ... and {len(issues['unfixable']) - 20} more")

    if stubs:
        report.append("\n## STUB ENTITIES CREATED (need review)\n")
        for stub in stubs[:20]:
            report.append(f"  {stub['entity_id']}: {stub['entity_name']} ({stub['entity_type']})")
        if len(stubs) > 20:
            report.append(f"  ... and {len(stubs) - 20} more")

    return "\n".join(report)


def main():
    dry_run = '--dry-run' in sys.argv
    report_only = '--report-only' in sys.argv

    print("Loading entities...")
    entities, entities_by_name, max_ids, entity_fieldnames = load_entities()
    print(f"  Loaded {len(entities)} entities")

    print("Analyzing relationships...")
    issues, rel_rows, rel_fieldnames = analyze_relationships(entities, entities_by_name)
    print(f"  Found {sum(len(v) for v in issues.values())} issues")

    if report_only:
        print(generate_report(issues, [], 0))
        return

    print("Generating stub entities...")
    stubs, id_mapping = generate_stub_entities(issues, max_ids, entity_fieldnames)
    print(f"  Generated {len(stubs)} stubs")

    print("Applying repairs...")
    repairs_made = apply_repairs(issues, id_mapping, rel_rows, rel_fieldnames, dry_run)
    print(f"  Made {repairs_made} repairs")

    # Generate and print report
    report = generate_report(issues, stubs, repairs_made)
    print(report)

    if not dry_run and not report_only:
        write_repaired_files(entities, stubs, rel_rows, entity_fieldnames, rel_fieldnames)

    # Save report to file
    report_file = DATA_DIR / f"entity_validation_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    with open(report_file, 'w') as f:
        f.write(report)
    print(f"\nReport saved to: {report_file}")


if __name__ == '__main__':
    main()
