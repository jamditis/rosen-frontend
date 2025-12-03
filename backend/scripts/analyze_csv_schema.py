# -*- coding: utf-8 -*-
"""
CSV Schema Validation

Compares actual CSV column headers against schema.json to identify:
1. Columns in CSV but not in schema (unexpected)
2. Columns in schema but not in CSV (missing)
3. Column ordering differences
4. Unique values in controlled vocabulary fields
"""

import csv
import json
from pathlib import Path
from collections import Counter


def analyze_schema_compliance():
    """Analyze CSV headers against schema.json."""

    # Paths
    data_dir = Path(__file__).parent.parent.parent / 'data'
    schema_file = Path(__file__).parent.parent / 'schema.json'
    csv_file = data_dir / 'archive_records-public.csv'

    # Load schema (handle UTF-8 BOM)
    with open(schema_file, 'r', encoding='utf-8-sig') as f:
        schema = json.load(f)

    schema_headers = schema['output_headers']

    # Load CSV headers
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        csv_headers = reader.fieldnames
        records = list(reader)

    print("\n" + "="*80)
    print("CSV SCHEMA VALIDATION")
    print("="*80)

    print(f"\nSchema headers: {len(schema_headers)}")
    print(f"CSV headers: {len(csv_headers)}")

    # Compare headers
    schema_set = set(schema_headers)
    csv_set = set(csv_headers)

    # Headers in CSV but not in schema
    unexpected = csv_set - schema_set
    if unexpected:
        print("\n" + "-"*80)
        print("⚠️  UNEXPECTED COLUMNS (in CSV but not in schema):")
        print("-"*80)
        for col in unexpected:
            print(f"  - '{col}'")
            # Show sample values
            sample_values = [r.get(col, '') for r in records if r.get(col, '').strip()][:5]
            if sample_values:
                print(f"    Sample values: {sample_values}")
        print("\n💡 Action: Either add to schema.json or remove from CSV")
    else:
        print("\n✅ No unexpected columns")

    # Headers in schema but not in CSV
    missing = schema_set - csv_set
    if missing:
        print("\n" + "-"*80)
        print("⚠️  MISSING COLUMNS (in schema but not in CSV):")
        print("-"*80)
        for col in missing:
            print(f"  - '{col}'")
        print("\n💡 Action: Add columns to CSV or remove from schema.json")
    else:
        print("\n✅ No missing columns")

    # Check ordering
    print("\n" + "-"*80)
    print("COLUMN ORDERING:")
    print("-"*80)

    # Find columns in both
    common_headers = [h for h in schema_headers if h in csv_set]
    csv_common = [h for h in csv_headers if h in schema_set]

    if common_headers == csv_common:
        print("\n✅ Column order matches schema exactly")
    else:
        print("\n⚠️  Column order differs from schema")
        print("\nFirst 10 columns:")
        print(f"  Schema: {schema_headers[:10]}")
        print(f"  CSV:    {list(csv_headers)[:10]}")

    # Analyze controlled vocabulary fields
    print("\n" + "="*80)
    print("CONTROLLED VOCABULARY FIELDS")
    print("="*80)

    # content_type / format
    print("\n" + "-"*80)
    print("content_type:")
    print("-"*80)
    content_types = Counter(r.get('content_type', '').strip() for r in records if r.get('content_type', '').strip())
    schema_formats = set(schema['taxonomy']['content_format'])

    print(f"\nSchema defines {len(schema_formats)} content_format values:")
    for fmt in sorted(schema_formats):
        print(f"  - {fmt}")

    print(f"\nCSV has {len(content_types)} unique content_type values:")
    for ctype, count in content_types.most_common():
        in_schema = "✓" if ctype in schema_formats else "✗"
        print(f"  {in_schema} '{ctype}': {count}")

    # Check for mismatches
    csv_types = set(content_types.keys())
    unexpected_types = csv_types - schema_formats
    if unexpected_types:
        print(f"\n⚠️  {len(unexpected_types)} content_type values NOT in schema:")
        for ct in unexpected_types:
            print(f"  - '{ct}' ({content_types[ct]} records)")

    # scope
    print("\n" + "-"*80)
    print("scope:")
    print("-"*80)
    scopes = Counter(r.get('scope', '').strip() for r in records if r.get('scope', '').strip())
    schema_scopes = set(schema['taxonomy']['scope'])

    print(f"\nSchema defines {len(schema_scopes)} scope values:")
    for s in sorted(schema_scopes):
        print(f"  - {s}")

    print(f"\nCSV has {len(scopes)} unique scope values:")
    for scope, count in scopes.most_common():
        in_schema = "✓" if scope in schema_scopes else "✗"
        print(f"  {in_schema} '{scope}': {count}")

    # Check for mismatches
    csv_scopes = set(scopes.keys())
    unexpected_scopes = csv_scopes - schema_scopes
    if unexpected_scopes:
        print(f"\n⚠️  {len(unexpected_scopes)} scope values NOT in schema:")
        for sc in unexpected_scopes:
            print(f"  - '{sc}' ({scopes[sc]} records)")

    # platform
    print("\n" + "-"*80)
    print("platform:")
    print("-"*80)
    platforms = Counter(r.get('platform', '').strip() for r in records if r.get('platform', '').strip())

    print(f"\nCSV has {len(platforms)} unique platform values:")
    for platform, count in platforms.most_common():
        print(f"  - '{platform}': {count}")

    print("\n💡 Consider: Should 'platform' have a controlled vocabulary in schema.json?")

    # publisher
    print("\n" + "-"*80)
    print("publisher:")
    print("-"*80)
    publishers = Counter(r.get('publisher', '').strip() for r in records if r.get('publisher', '').strip())

    print(f"\nCSV has {len(publishers)} unique publisher values:")
    for pub, count in publishers.most_common(20):
        print(f"  - '{pub}': {count}")
    if len(publishers) > 20:
        print(f"  ... and {len(publishers) - 20} more")

    # original_publication
    print("\n" + "-"*80)
    print("original_publication:")
    print("-"*80)
    orig_pubs = Counter(r.get('original_publication', '').strip() for r in records if r.get('original_publication', '').strip())

    print(f"\nCSV has {len(orig_pubs)} unique original_publication values:")
    for op, count in orig_pubs.most_common(20):
        print(f"  - '{op}': {count}")
    if len(orig_pubs) > 20:
        print(f"  ... and {len(orig_pubs) - 20} more")

    # Generate recommendations
    print("\n" + "="*80)
    print("RECOMMENDATIONS")
    print("="*80)

    recommendations = []

    if unexpected:
        recommendations.append({
            'priority': 'HIGH',
            'issue': f"{len(unexpected)} unexpected columns in CSV",
            'action': 'Review and either add to schema or remove from CSV',
            'columns': list(unexpected)
        })

    if missing:
        recommendations.append({
            'priority': 'MEDIUM',
            'issue': f"{len(missing)} missing columns from CSV",
            'action': 'Add columns to CSV or remove from schema',
            'columns': list(missing)
        })

    if unexpected_types:
        recommendations.append({
            'priority': 'HIGH',
            'issue': f"{len(unexpected_types)} content_type values not in schema",
            'action': 'Add to schema.json content_format list or fix typos in CSV',
            'values': list(unexpected_types)
        })

    if unexpected_scopes:
        recommendations.append({
            'priority': 'HIGH',
            'issue': f"{len(unexpected_scopes)} scope values not in schema",
            'action': 'Add to schema.json scope list or fix typos in CSV',
            'values': list(unexpected_scopes)
        })

    if len(platforms) > 10:
        recommendations.append({
            'priority': 'LOW',
            'issue': f"{len(platforms)} unique platform values (no schema control)",
            'action': 'Consider adding controlled vocabulary for platform field',
            'suggestion': 'Add taxonomy.platform list to schema.json'
        })

    if recommendations:
        for i, rec in enumerate(recommendations, 1):
            print(f"\n{i}. [{rec['priority']}] {rec['issue']}")
            print(f"   Action: {rec['action']}")
            if 'columns' in rec:
                print(f"   Columns: {rec['columns']}")
            if 'values' in rec:
                print(f"   Values: {rec['values']}")
            if 'suggestion' in rec:
                print(f"   Suggestion: {rec['suggestion']}")
    else:
        print("\n✅ No schema compliance issues found!")

    # Save report
    report_file = Path(__file__).parent.parent / 'csv_schema_validation_report.json'
    report = {
        'schema_headers': schema_headers,
        'csv_headers': list(csv_headers),
        'unexpected_columns': list(unexpected),
        'missing_columns': list(missing),
        'controlled_vocab_issues': {
            'content_type': {
                'schema': list(schema_formats),
                'csv_unique': list(csv_types),
                'unexpected': list(unexpected_types)
            },
            'scope': {
                'schema': list(schema_scopes),
                'csv_unique': list(csv_scopes),
                'unexpected': list(unexpected_scopes)
            },
            'platform': {
                'csv_unique': list(platforms.keys()),
                'schema': None
            }
        },
        'recommendations': recommendations
    }

    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\n\n📄 Full report saved to: {report_file}")
    print("\n" + "="*80)
    print()


if __name__ == "__main__":
    analyze_schema_compliance()
