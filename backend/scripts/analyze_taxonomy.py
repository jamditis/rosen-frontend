# -*- coding: utf-8 -*-
"""
Taxonomy Analysis Script

Analyzes eras, tags, and key_concepts for:
1. Logical coherence of era definitions
2. Tag consolidation opportunities (case variations, duplicates)
3. Key_concepts specificity and frequency
4. Recommendations for standardization
"""

import csv
import json
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime
import re


class TaxonomyAnalyzer:
    """Analyze and recommend taxonomy improvements."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.recommendations = []

    def analyze_eras(self, records):
        """Analyze era definitions for logical coherence."""
        print("\n" + "="*80)
        print("ERA ANALYSIS")
        print("="*80)

        eras = Counter(r.get('era', '').strip() for r in records if r.get('era', '').strip())

        # Parse era definitions into structured data
        era_data = []
        for era_name, count in eras.items():
            # Extract date range if present
            date_match = re.search(r'\((\d{4})-(\d{4}|\w+)\)', era_name)
            if date_match:
                start_year = int(date_match.group(1))
                end_year = date_match.group(2)
                if end_year.lower() == 'present':
                    end_year = 2025
                else:
                    end_year = int(end_year)

                # Extract base name (without date range)
                base_name = re.sub(r'\s*\([^)]+\)', '', era_name).strip()

                era_data.append({
                    'full_name': era_name,
                    'base_name': base_name,
                    'start_year': start_year,
                    'end_year': end_year,
                    'count': count,
                    'span': end_year - start_year + 1
                })
            else:
                # Era without date range
                era_data.append({
                    'full_name': era_name,
                    'base_name': era_name,
                    'start_year': None,
                    'end_year': None,
                    'count': count,
                    'span': None
                })

        # Sort by start year
        era_data_sorted = sorted([e for e in era_data if e['start_year']],
                                key=lambda x: x['start_year'])
        era_data_no_dates = [e for e in era_data if not e['start_year']]

        print(f"\n{'Era Name':<70} {'Years':<15} {'Records':>10} {'Span':>6}")
        print("-" * 105)

        for era in era_data_sorted:
            year_range = f"{era['start_year']}-{era['end_year']}"
            span = f"{era['span']}y" if era['span'] else "N/A"
            print(f"{era['full_name']:<70} {year_range:<15} {era['count']:>10} {span:>6}")

        if era_data_no_dates:
            print("\n⚠️  Eras WITHOUT date ranges:")
            for era in era_data_no_dates:
                print(f"  - {era['full_name']}: {era['count']} records")

        # Check for overlaps
        print("\n" + "-"*80)
        print("OVERLAP ANALYSIS:")
        print("-"*80)

        overlaps = []
        for i, era1 in enumerate(era_data_sorted):
            for era2 in era_data_sorted[i+1:]:
                # Check if date ranges overlap
                if era1['start_year'] <= era2['start_year'] <= era1['end_year']:
                    overlap_years = era1['end_year'] - era2['start_year'] + 1
                    overlaps.append({
                        'era1': era1['full_name'],
                        'era2': era2['full_name'],
                        'overlap_years': overlap_years,
                        'years': f"{era2['start_year']}-{era1['end_year']}"
                    })

        if overlaps:
            print("\n⚠️  Found date range overlaps:")
            for overlap in overlaps:
                print(f"  - '{overlap['era1']}'")
                print(f"    OVERLAPS with '{overlap['era2']}'")
                print(f"    Overlap: {overlap['years']} ({overlap['overlap_years']} years)")
                print()
            self.recommendations.append({
                'category': 'eras',
                'issue': 'Date range overlaps',
                'details': overlaps,
                'priority': 'HIGH'
            })
        else:
            print("\n✅ No date range overlaps found")

        # Check for gaps
        print("\n" + "-"*80)
        print("GAP ANALYSIS:")
        print("-"*80)

        gaps = []
        for i in range(len(era_data_sorted) - 1):
            era1 = era_data_sorted[i]
            era2 = era_data_sorted[i + 1]

            if era1['end_year'] + 1 < era2['start_year']:
                gap_years = era2['start_year'] - era1['end_year'] - 1
                gaps.append({
                    'after': era1['full_name'],
                    'before': era2['full_name'],
                    'gap_years': gap_years,
                    'years': f"{era1['end_year'] + 1}-{era2['start_year'] - 1}"
                })

        if gaps:
            print("\n⚠️  Found gaps in coverage:")
            for gap in gaps:
                print(f"  - Gap between '{gap['after']}'")
                print(f"    and '{gap['before']}'")
                print(f"    Missing: {gap['years']} ({gap['gap_years']} years)")
                print()
            self.recommendations.append({
                'category': 'eras',
                'issue': 'Coverage gaps',
                'details': gaps,
                'priority': 'MEDIUM'
            })
        else:
            print("\n✅ No gaps in era coverage")

        # Analyze era distribution
        print("\n" + "-"*80)
        print("RECORD DISTRIBUTION:")
        print("-"*80)

        total_with_eras = sum(e['count'] for e in era_data)
        total_records = len(records)
        missing_eras = total_records - total_with_eras

        print(f"\nTotal records: {total_records}")
        print(f"Records with eras: {total_with_eras}")
        print(f"Records missing eras: {missing_eras}")

        if missing_eras > 0:
            print(f"\n⚠️  {missing_eras} records are missing era assignments")
            self.recommendations.append({
                'category': 'eras',
                'issue': 'Missing era assignments',
                'count': missing_eras,
                'priority': 'MEDIUM'
            })

        return era_data_sorted

    def analyze_tags(self, records):
        """Analyze tags for consolidation opportunities."""
        print("\n" + "="*80)
        print("TAG ANALYSIS")
        print("="*80)

        all_tags = []
        for record in records:
            tags_str = record.get('tags', '').strip()
            if tags_str:
                # Split on commas (most common delimiter)
                tags = [t.strip() for t in tags_str.split(',')]
                all_tags.extend(tags)

        tag_counts = Counter(all_tags)

        print(f"\nTotal tag instances: {len(all_tags)}")
        print(f"Unique tags: {len(tag_counts)}")

        # Find case variations
        print("\n" + "-"*80)
        print("CASE VARIATIONS:")
        print("-"*80)

        tag_variations = defaultdict(list)
        for tag in tag_counts.keys():
            normalized = tag.lower().strip()
            tag_variations[normalized].append(tag)

        case_issues = []
        for normalized, variations in sorted(tag_variations.items()):
            if len(variations) > 1:
                case_issues.append({
                    'normalized': normalized,
                    'variations': variations,
                    'total_count': sum(tag_counts[v] for v in variations)
                })

        if case_issues:
            print(f"\n⚠️  Found {len(case_issues)} tags with case variations:")
            for issue in case_issues[:20]:  # Show first 20
                print(f"\n  '{issue['normalized']}' ({issue['total_count']} total):")
                for var in sorted(issue['variations'], key=lambda x: tag_counts[x], reverse=True):
                    print(f"    - '{var}' ({tag_counts[var]} occurrences)")

            if len(case_issues) > 20:
                print(f"\n  ... and {len(case_issues) - 20} more")

            self.recommendations.append({
                'category': 'tags',
                'issue': 'Case variations',
                'count': len(case_issues),
                'examples': case_issues[:10],
                'priority': 'HIGH'
            })
        else:
            print("\n✅ No case variations found")

        # Find potential duplicates (similar names)
        print("\n" + "-"*80)
        print("POTENTIAL DUPLICATES:")
        print("-"*80)

        # Look for tags that might mean the same thing
        potential_duplicates = []

        # Common patterns to check
        patterns = [
            ('new york times', ['nyt', 'new york times', 'times', 'the new york times']),
            ('washington post', ['wapo', 'washington post', 'post', 'the washington post']),
            ('social media', ['social media', 'social networks', 'social networking']),
            ('twitter', ['twitter', 'x', 'twitter/x']),
            ('journalism', ['journalism', 'journalists', 'journalist']),
            ('media', ['media', 'news media', 'mainstream media', 'msm']),
        ]

        for concept, variants in patterns:
            found_variants = []
            for variant in variants:
                if variant in tag_variations:
                    actual_tags = tag_variations[variant]
                    total = sum(tag_counts[t] for t in actual_tags)
                    found_variants.append({'tag': variant, 'count': total, 'variations': actual_tags})

            if len(found_variants) > 1:
                potential_duplicates.append({
                    'concept': concept,
                    'variants': found_variants,
                    'total': sum(v['count'] for v in found_variants)
                })

        if potential_duplicates:
            print("\n⚠️  Found potential duplicate concepts:")
            for dup in potential_duplicates:
                print(f"\n  Concept: '{dup['concept']}' ({dup['total']} total)")
                for var in dup['variants']:
                    print(f"    - '{var['tag']}': {var['count']}")

            self.recommendations.append({
                'category': 'tags',
                'issue': 'Potential duplicate concepts',
                'count': len(potential_duplicates),
                'examples': potential_duplicates,
                'priority': 'MEDIUM'
            })

        # Show top tags
        print("\n" + "-"*80)
        print("TOP 30 MOST COMMON TAGS:")
        print("-"*80)

        print(f"\n{'Tag':<50} {'Count':>10}")
        print("-" * 65)
        for tag, count in tag_counts.most_common(30):
            print(f"{tag[:50]:<50} {count:>10}")

        return tag_counts

    def analyze_key_concepts(self, records):
        """Analyze key_concepts for specificity."""
        print("\n" + "="*80)
        print("KEY_CONCEPTS ANALYSIS")
        print("="*80)

        all_concepts = []
        for record in records:
            concepts_str = record.get('key_concepts', '').strip()
            if concepts_str:
                # Split on commas
                concepts = [c.strip() for c in concepts_str.split(',')]
                all_concepts.extend(concepts)

        concept_counts = Counter(all_concepts)

        print(f"\nTotal concept instances: {len(all_concepts)}")
        print(f"Unique concepts: {len(concept_counts)}")

        # Find case variations
        print("\n" + "-"*80)
        print("CASE VARIATIONS:")
        print("-"*80)

        concept_variations = defaultdict(list)
        for concept in concept_counts.keys():
            normalized = concept.lower().strip()
            concept_variations[normalized].append(concept)

        case_issues = []
        for normalized, variations in sorted(concept_variations.items()):
            if len(variations) > 1:
                case_issues.append({
                    'normalized': normalized,
                    'variations': variations,
                    'total_count': sum(concept_counts[v] for v in variations)
                })

        if case_issues:
            print(f"\n⚠️  Found {len(case_issues)} concepts with case variations:")
            for issue in case_issues[:20]:
                print(f"\n  '{issue['normalized']}' ({issue['total_count']} total):")
                for var in sorted(issue['variations'], key=lambda x: concept_counts[x], reverse=True):
                    print(f"    - '{var}' ({concept_counts[var]} occurrences)")

            if len(case_issues) > 20:
                print(f"\n  ... and {len(case_issues) - 20} more")

            self.recommendations.append({
                'category': 'key_concepts',
                'issue': 'Case variations',
                'count': len(case_issues),
                'examples': case_issues[:10],
                'priority': 'HIGH'
            })
        else:
            print("\n✅ No case variations found")

        # Analyze concept specificity
        print("\n" + "-"*80)
        print("SPECIFICITY ANALYSIS:")
        print("-"*80)

        # Concepts that appear too frequently might be too generic
        high_frequency = [(c, count) for c, count in concept_counts.most_common(30) if count > 50]

        if high_frequency:
            print(f"\n⚠️  Potentially too generic (>50 occurrences):")
            for concept, count in high_frequency:
                print(f"  - '{concept}': {count} occurrences")

            self.recommendations.append({
                'category': 'key_concepts',
                'issue': 'Potentially too generic',
                'concepts': [{'concept': c, 'count': count} for c, count in high_frequency],
                'priority': 'LOW'
            })

        # Concepts that appear rarely might be too specific or errors
        low_frequency = [(c, count) for c, count in concept_counts.items() if count == 1]

        print(f"\n📊 Single-occurrence concepts: {len(low_frequency)}")
        print(f"   (May be highly specific or potential errors)")

        # Show top concepts
        print("\n" + "-"*80)
        print("TOP 30 MOST COMMON CONCEPTS:")
        print("-"*80)

        print(f"\n{'Concept':<50} {'Count':>10}")
        print("-" * 65)
        for concept, count in concept_counts.most_common(30):
            print(f"{concept[:50]:<50} {count:>10}")

        return concept_counts

    def generate_recommendations(self):
        """Generate final recommendations."""
        print("\n" + "="*80)
        print("TAXONOMY IMPROVEMENT RECOMMENDATIONS")
        print("="*80)

        if not self.recommendations:
            print("\n✅ No major issues found!")
            return

        # Group by priority
        high_priority = [r for r in self.recommendations if r['priority'] == 'HIGH']
        medium_priority = [r for r in self.recommendations if r['priority'] == 'MEDIUM']
        low_priority = [r for r in self.recommendations if r['priority'] == 'LOW']

        if high_priority:
            print("\n🔴 HIGH PRIORITY:")
            for i, rec in enumerate(high_priority, 1):
                print(f"\n{i}. {rec['category'].upper()}: {rec['issue']}")
                if 'count' in rec:
                    print(f"   Affected items: {rec['count']}")

        if medium_priority:
            print("\n🟡 MEDIUM PRIORITY:")
            for i, rec in enumerate(medium_priority, 1):
                print(f"\n{i}. {rec['category'].upper()}: {rec['issue']}")
                if 'count' in rec:
                    print(f"   Affected items: {rec['count']}")

        if low_priority:
            print("\n🟢 LOW PRIORITY:")
            for i, rec in enumerate(low_priority, 1):
                print(f"\n{i}. {rec['category'].upper()}: {rec['issue']}")
                if 'count' in rec:
                    print(f"   Affected items: {rec['count']}")

        # Save detailed report
        report_file = self.data_dir.parent / 'backend' / 'taxonomy_analysis_report.json'
        report = {
            'generated': datetime.now().isoformat(),
            'recommendations': self.recommendations
        }

        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

        print(f"\n\n📄 Full report saved to: {report_file}")

    def run_analysis(self):
        """Run all taxonomy analyses."""
        csv_file = self.data_dir / "archive_records-public.csv"

        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            records = list(reader)

        print("\n" + "="*80)
        print("TAXONOMY ANALYSIS")
        print("="*80)
        print(f"\nAnalyzing {len(records)} records...")

        self.analyze_eras(records)
        self.analyze_tags(records)
        self.analyze_key_concepts(records)
        self.generate_recommendations()


def main():
    """Run the taxonomy analysis."""
    data_dir = Path(__file__).parent.parent.parent / 'data'

    if not data_dir.exists():
        print(f"❌ Data directory not found: {data_dir}")
        return

    analyzer = TaxonomyAnalyzer(data_dir)
    analyzer.run_analysis()

    print("\n" + "="*80)
    print("ANALYSIS COMPLETE")
    print("="*80)
    print()


if __name__ == "__main__":
    main()
