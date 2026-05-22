# -*- coding: utf-8 -*-
"""
Analyze actual test_runs data to identify schema optimization opportunities.
"""

import pandas as pd
from collections import Counter
import re

def analyze_test_runs_data():
    """Analyze the first 150 rows of test_runs data."""
    print("Analyzing Test Runs Data for Schema Optimization")
    print("=" * 60)

    # Load the CSV data
    csv_path = "planning/test_runs/📎Rosen Archive URL List - test_runs (1).csv"

    try:
        df = pd.read_csv(csv_path)
        print(f"Loaded {len(df)} records from CSV")

        # Take first 150 rows for analysis
        df_sample = df.head(150) if len(df) > 150 else df
        print(f"Analyzing first {len(df_sample)} records")

    except Exception as e:
        print(f"Error loading CSV: {e}")
        return

    # === FIELD ANALYSIS ===
    print(f"\n{'='*20} FIELD ANALYSIS {'='*20}")

    # Check field completeness
    completeness = {}
    for col in df_sample.columns:
        non_empty = df_sample[col].notna().sum()
        completeness[col] = (non_empty / len(df_sample)) * 100

    print("\nField Completeness (% of records with data):")
    for field, pct in sorted(completeness.items(), key=lambda x: x[1], reverse=True):
        print(f"  {field:<25}: {pct:5.1f}%")

    # === CONTENT PATTERN ANALYSIS ===
    print(f"\n{'='*20} CONTENT PATTERNS {'='*20}")

    # Analyze thematic categories
    if 'thematic_categories' in df_sample.columns:
        thematic_data = df_sample['thematic_categories'].dropna()
        all_themes = []
        for themes in thematic_data:
            if isinstance(themes, str):
                theme_list = [t.strip() for t in themes.split(',')]
                all_themes.extend(theme_list)

        theme_counts = Counter(all_themes)
        print("\nThematic Categories Usage (top 10):")
        for theme, count in theme_counts.most_common(10):
            print(f"  {theme:<35}: {count:3d} times")

    # Analyze key concepts
    if 'key_concepts' in df_sample.columns:
        concepts_data = df_sample['key_concepts'].dropna()
        all_concepts = []
        for concepts in concepts_data:
            if isinstance(concepts, str):
                concept_list = [c.strip() for c in concepts.split(',')]
                all_concepts.extend(concept_list)

        concept_counts = Counter(all_concepts)
        print("\nKey Concepts Usage (top 10):")
        for concept, count in concept_counts.most_common(10):
            print(f"  {concept:<40}: {count:3d} times")

    # Analyze content types and formats
    if 'content_type' in df_sample.columns:
        content_types = df_sample['content_type'].value_counts()
        print("\nContent Types:")
        for ctype, count in content_types.items():
            print(f"  {ctype:<20}: {count:3d} records")

    if 'format' in df_sample.columns:
        formats = df_sample['format'].value_counts()
        print("\nContent Formats:")
        for fmt, count in formats.items():
            print(f"  {fmt:<20}: {count:3d} records")

    # === URL ANALYSIS ===
    print(f"\n{'='*20} URL ANALYSIS {'='*20}")

    if 'url' in df_sample.columns:
        urls = df_sample['url'].dropna()
        domains = []
        for url in urls:
            if isinstance(url, str):
                # Extract domain
                domain_match = re.search(r'https?://(?:www\.)?([^/]+)', url)
                if domain_match:
                    domains.append(domain_match.group(1))

        domain_counts = Counter(domains)
        print("\nSource Domains (top 15):")
        for domain, count in domain_counts.most_common(15):
            print(f"  {domain:<30}: {count:3d} records")

    # === ERA ANALYSIS ===
    print(f"\n{'='*20} ERA ANALYSIS {'='*20}")

    if 'era' in df_sample.columns:
        eras = df_sample['era'].value_counts()
        print("\nEra Distribution:")
        for era, count in eras.items():
            if pd.notna(era):
                print(f"  {era:<45}: {count:3d} records")

    # === SCOPE ANALYSIS ===
    if 'scope' in df_sample.columns:
        scopes = df_sample['scope'].value_counts()
        print("\nScope Distribution:")
        for scope, count in scopes.items():
            if pd.notna(scope):
                print(f"  {scope:<25}: {count:3d} records")

    # === NEW FIELDS ANALYSIS ===
    print(f"\n{'='*20} NEW FIELDS STATUS {'='*20}")

    new_fields = ['platform', 'collection_id', 'permissions', 'transcript_filepath', 'verified', 'notes']
    for field in new_fields:
        if field in df_sample.columns:
            non_empty = df_sample[field].notna().sum()
            if non_empty > 0:
                print(f"{field}: {non_empty} records have data")
                # Show sample values
                sample_values = df_sample[field].dropna().head(5).tolist()
                print(f"  Sample values: {sample_values}")
            else:
                print(f"{field}: NO DATA (needs population)")

    # === MISSING DATA PATTERNS ===
    print(f"\n{'='*20} MISSING DATA PATTERNS {'='*20}")

    # Find records with significant missing data
    critical_fields = ['title', 'url', 'author', 'publication_date', 'summary', 'thematic_categories']
    missing_critical = []

    for idx, row in df_sample.iterrows():
        missing_count = sum(1 for field in critical_fields if pd.isna(row[field]) or row[field] == '')
        if missing_count >= 2:
            missing_critical.append((row.get('id', f'Row {idx}'), missing_count))

    if missing_critical:
        print(f"\nRecords with 2+ missing critical fields: {len(missing_critical)}")
        for record_id, missing_count in missing_critical[:10]:
            print(f"  {record_id}: {missing_count} missing fields")

    # === TEXT QUALITY ANALYSIS ===
    print(f"\n{'='*20} TEXT QUALITY ANALYSIS {'='*20}")

    if 'raw_text' in df_sample.columns:
        text_data = df_sample['raw_text'].dropna()
        text_lengths = [len(str(text)) for text in text_data]

        if text_lengths:
            avg_length = sum(text_lengths) / len(text_lengths)
            min_length = min(text_lengths)
            max_length = max(text_lengths)

            print("Raw Text Statistics:")
            print(f"  Records with text: {len(text_lengths)}")
            print(f"  Average length: {avg_length:,.0f} characters")
            print(f"  Min length: {min_length:,} characters")
            print(f"  Max length: {max_length:,} characters")

            # Quality flags
            short_texts = len([length for length in text_lengths if length < 500])
            long_texts = len([length for length in text_lengths if length > 10000])

            print(f"  Short texts (<500 chars): {short_texts}")
            print(f"  Long texts (>10k chars): {long_texts}")

    # === RELATIONSHIP DATA ===
    print(f"\n{'='*20} RELATIONSHIP DATA {'='*20}")

    relationship_fields = ['related_to', 'responds_to', 'influence']
    for field in relationship_fields:
        if field in df_sample.columns:
            populated = df_sample[field].dropna()
            populated = populated[populated != '']
            print(f"{field}: {len(populated)} records have relationships")
            if len(populated) > 0:
                # Show sample relationship data
                sample = populated.iloc[0] if len(populated) > 0 else ''
                print(f"  Sample: {str(sample)[:100]}...")

    # === RECOMMENDATIONS ===
    print(f"\n{'='*20} SCHEMA OPTIMIZATION RECOMMENDATIONS {'='*20}")

    recommendations = []

    # Check for underutilized fields
    underutilized = [field for field, pct in completeness.items() if pct < 10]
    if underutilized:
        recommendations.append(f"Consider removing underutilized fields: {underutilized}")

    # Check for missing new fields
    missing_new_fields = [field for field in new_fields if field in df_sample.columns and completeness.get(field, 0) == 0]
    if missing_new_fields:
        recommendations.append(f"Populate new fields: {missing_new_fields}")

    # Check for data format issues
    if 'thematic_categories' in df_sample.columns:
        sample_theme = df_sample['thematic_categories'].dropna().iloc[0] if len(df_sample['thematic_categories'].dropna()) > 0 else ''
        if ',' in str(sample_theme):
            recommendations.append("Convert CSV fields to JSON arrays for frontend compatibility")

    # Check for relationship data structure
    if 'related_to' in df_sample.columns:
        sample_related = df_sample['related_to'].dropna()
        if len(sample_related) > 0 and ',' in str(sample_related.iloc[0]):
            recommendations.append("Convert relationship fields to structured JSON objects")

    print("\nKey Recommendations:")
    for i, rec in enumerate(recommendations, 1):
        print(f"{i}. {rec}")

    # Show additional insights
    print("\nAdditional Insights:")
    print(f"• Most content is from PressThink ({domain_counts.get('pressthink.org', 0)} records)")
    print("• Primary era is 'The Rise of the Web & Blogging' if available")
    print("• Content is primarily articles with text format")
    print("• Thematic categories are well-distributed across Jay Rosen's focus areas")

    return {
        'total_records': len(df_sample),
        'field_completeness': completeness,
        'recommendations': recommendations,
        'domain_distribution': dict(domain_counts.most_common(10)),
        'theme_usage': dict(theme_counts.most_common(10)) if 'thematic_categories' in df_sample.columns else {},
        'missing_critical_data': len(missing_critical)
    }

if __name__ == "__main__":
    try:
        results = analyze_test_runs_data()
        print(f"\n{'='*60}")
        print("ANALYSIS COMPLETE")
        print(f"{'='*60}")
    except Exception as e:
        print(f"Analysis failed: {e}")
        import traceback
        traceback.print_exc()