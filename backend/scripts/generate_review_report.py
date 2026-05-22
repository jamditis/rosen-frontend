#!/usr/bin/env python3
"""
Generate Review Report - Comprehensive archive data quality report

This script generates a detailed report of archive records that may need
manual review for categorization, content verification, or relationship mapping.
"""

import csv
from datetime import datetime
from pathlib import Path
from collections import Counter, defaultdict

PROJECT_ROOT = Path(__file__).parent.parent.parent


def load_records():
    """Load all archive records."""
    records = []
    csv_path = PROJECT_ROOT / 'data' / 'archive_records-public.csv'
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(row)
    return records


def load_entities():
    """Load all entities."""
    entities = []
    csv_path = PROJECT_ROOT / 'data' / 'extracted_entities.csv'
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            entities.append(row)
    return entities


def load_relationships():
    """Load all relationships."""
    relationships = []
    csv_path = PROJECT_ROOT / 'data' / 'extracted_relationships.csv'
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            relationships.append(row)
    return relationships


def analyze_records(records):
    """Analyze records for quality issues."""
    issues = defaultdict(list)

    for record in records:
        record_id = record.get('id', '')
        title = record.get('title', '')[:50]

        # Missing categories
        if not record.get('thematic_categories', '').strip():
            issues['missing_categories'].append({
                'id': record_id,
                'title': title,
                'type': record.get('content_type', ''),
                'url': record.get('url', '')[:80]
            })

        # Missing key concepts (optional but useful)
        if not record.get('key_concepts', '').strip():
            issues['missing_concepts'].append(record_id)

        # Missing summary
        if not record.get('summary', '').strip():
            issues['missing_summary'].append({
                'id': record_id,
                'title': title,
                'url': record.get('url', '')[:80]
            })

        # Unverified records
        if record.get('verified', '').strip() == 'FALSE':
            issues['unverified'].append({
                'id': record_id,
                'title': title,
                'type': record.get('content_type', '')
            })

        # Missing era
        if not record.get('era', '').strip():
            issues['missing_era'].append({
                'id': record_id,
                'title': title,
                'date': record.get('publication_date', '')
            })

    return issues


def generate_report(records, entities, relationships):
    """Generate comprehensive review report."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    issues = analyze_records(records)

    # Statistics
    total_records = len(records)
    verified_count = sum(1 for r in records if r.get('verified', '').strip() == 'TRUE')
    categorized_count = total_records - len(issues['missing_categories'])

    # Category distribution
    cats = Counter()
    for r in records:
        cat_str = r.get('thematic_categories', '').strip()
        if cat_str:
            for cat in cat_str.split(','):
                cats[cat.strip()] += 1

    # Era distribution
    eras = Counter()
    for r in records:
        era = r.get('era', '').strip()
        eras[era if era else '[EMPTY]'] += 1

    # Content type distribution
    types = Counter()
    for r in records:
        t = r.get('content_type', '').strip()
        types[t if t else '[EMPTY]'] += 1

    report = []
    report.append("=" * 80)
    report.append("COMPREHENSIVE ARCHIVE DATA QUALITY REPORT")
    report.append(f"Generated: {timestamp}")
    report.append("=" * 80)

    report.append("\n## EXECUTIVE SUMMARY\n")
    report.append(f"Total records:           {total_records}")
    report.append(f"Verified records:        {verified_count} ({100*verified_count/total_records:.1f}%)")
    report.append(f"Categorized records:     {categorized_count} ({100*categorized_count/total_records:.1f}%)")
    report.append(f"Total entities:          {len(entities)}")
    report.append(f"Total relationships:     {len(relationships)}")

    report.append("\n## DATA QUALITY METRICS\n")
    report.append("| Metric                  | Count | Percentage |")
    report.append("|-------------------------|-------|------------|")
    report.append(f"| Missing categories      | {len(issues['missing_categories']):5d} | {100*len(issues['missing_categories'])/total_records:6.1f}%    |")
    report.append(f"| Missing concepts        | {len(issues['missing_concepts']):5d} | {100*len(issues['missing_concepts'])/total_records:6.1f}%    |")
    report.append(f"| Missing summary         | {len(issues['missing_summary']):5d} | {100*len(issues['missing_summary'])/total_records:6.1f}%    |")
    report.append(f"| Unverified records      | {len(issues['unverified']):5d} | {100*len(issues['unverified'])/total_records:6.1f}%    |")
    report.append(f"| Missing era             | {len(issues['missing_era']):5d} | {100*len(issues['missing_era'])/total_records:6.1f}%    |")

    report.append("\n## ERA DISTRIBUTION\n")
    for era, count in sorted(eras.items(), key=lambda x: -x[1]):
        pct = 100 * count / total_records
        bar = "█" * int(pct / 2)
        report.append(f"  {count:4d} ({pct:5.1f}%) {bar} {era}")

    report.append("\n## CATEGORY DISTRIBUTION\n")
    for cat, count in sorted(cats.items(), key=lambda x: -x[1]):
        pct = 100 * count / total_records
        bar = "█" * int(pct / 2)
        report.append(f"  {count:4d} ({pct:5.1f}%) {bar} {cat}")

    report.append("\n## CONTENT TYPE DISTRIBUTION\n")
    for t, count in sorted(types.items(), key=lambda x: -x[1]):
        pct = 100 * count / total_records
        report.append(f"  {count:4d} ({pct:5.1f}%): {t}")

    # Records needing manual review
    report.append("\n" + "=" * 80)
    report.append("RECORDS REQUIRING MANUAL REVIEW")
    report.append("=" * 80)

    report.append("\n### Records Missing Categories (Top 50)\n")
    report.append("These records have no thematic categories assigned:\n")
    for item in issues['missing_categories'][:50]:
        report.append(f"  {item['id']}: {item['title']}")
        report.append(f"     Type: {item['type']}, URL: {item['url']}")

    if len(issues['missing_categories']) > 50:
        report.append(f"\n  ... and {len(issues['missing_categories']) - 50} more")

    report.append("\n### Records Missing Summary (Top 20)\n")
    for item in issues['missing_summary'][:20]:
        report.append(f"  {item['id']}: {item['title']}")
        report.append(f"     URL: {item['url']}")

    # Entity statistics
    report.append("\n" + "=" * 80)
    report.append("ENTITY & RELATIONSHIP STATISTICS")
    report.append("=" * 80)

    entity_types = Counter()
    for e in entities:
        entity_types[e.get('entity_type', 'Unknown')] += 1

    report.append("\n### Entity Types\n")
    for et, count in sorted(entity_types.items(), key=lambda x: -x[1]):
        report.append(f"  {count:5d}: {et}")

    rel_types = Counter()
    for r in relationships:
        rel_types[r.get('relationship_type', 'Unknown')] += 1

    report.append("\n### Relationship Types (Top 15)\n")
    for rt, count in sorted(rel_types.items(), key=lambda x: -x[1])[:15]:
        report.append(f"  {count:5d}: {rt}")

    report.append("\n" + "=" * 80)
    report.append("END OF REPORT")
    report.append("=" * 80)

    return '\n'.join(report), issues


def main():
    print("Loading data...")
    records = load_records()
    entities = load_entities()
    relationships = load_relationships()

    print("Generating report...")
    report, issues = generate_report(records, entities, relationships)

    # Save report
    report_path = PROJECT_ROOT / 'data' / f'archive_review_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.txt'
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)

    print(report)
    print(f"\nReport saved to: {report_path}")

    # Export records needing categorization to CSV for easy review
    if issues['missing_categories']:
        csv_path = PROJECT_ROOT / 'data' / 'records_needing_categories.csv'
        with open(csv_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['id', 'title', 'type', 'url'])
            writer.writeheader()
            writer.writerows(issues['missing_categories'])
        print(f"Records needing categories exported to: {csv_path}")


if __name__ == '__main__':
    main()
