# -*- coding: utf-8 -*-
"""
Data Standardization Analysis

Analyzes CSV data for inconsistent formatting, non-standard values,
and data quality issues WITHIN fields (not just field completeness).
"""

import csv
import json
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime
import re


class DataStandardizationAnalyzer:
    """Analyze data standardization issues within CSV fields."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.issues = defaultdict(list)

    def analyze_date_formats(self, records):
        """Analyze publication_date field for inconsistent formats."""
        print("\n" + "="*80)
        print("DATE FORMAT STANDARDIZATION")
        print("="*80)

        date_patterns = Counter()
        invalid_dates = []

        for record in records:
            date_str = record.get('publication_date', '').strip()
            if not date_str:
                continue

            # Detect pattern
            if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
                date_patterns['YYYY-MM-DD'] += 1
            elif re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', date_str):
                date_patterns['M/D/YYYY'] += 1
            elif re.match(r'^\d{4}/\d{2}/\d{2}$', date_str):
                date_patterns['YYYY/MM/DD'] += 1
            elif re.match(r'^\d{2}/\d{2}/\d{4}$', date_str):
                date_patterns['MM/DD/YYYY'] += 1
            else:
                date_patterns['OTHER'] += 1
                invalid_dates.append((record.get('id'), date_str))

        print(f"\n{'Date Format':<20} {'Count':>10}")
        print("-" * 35)
        for fmt, count in date_patterns.most_common():
            print(f"{fmt:<20} {count:>10}")

        if invalid_dates:
            print(f"\n⚠️  Found {len(invalid_dates)} non-standard date formats:")
            for record_id, date_val in invalid_dates[:10]:
                print(f"  {record_id}: '{date_val}'")

        if len(date_patterns) > 1:
            self.issues['date_format'].append(f"Multiple date formats found: {dict(date_patterns)}")

    def analyze_content_types(self, records):
        """Analyze content_type field for inconsistencies."""
        print("\n" + "="*80)
        print("CONTENT TYPE STANDARDIZATION")
        print("="*80)

        content_types = Counter(r.get('content_type', '').strip() for r in records)

        # Identify potential duplicates (case variations, plurals, etc.)
        type_variations = defaultdict(list)
        for ctype in content_types.keys():
            normalized = ctype.lower().strip()
            type_variations[normalized].append(ctype)

        print(f"\n{'Content Type':<30} {'Count':>10}")
        print("-" * 45)
        for ctype, count in content_types.most_common():
            flag = ""
            # Check for case issues
            if ctype != ctype.title() and ctype.lower() != ctype:
                flag = " ⚠️  Mixed case"
            # Check for empty
            if not ctype:
                flag = " ⚠️  EMPTY"
            print(f"{ctype or '(empty)':<30} {count:>10}{flag}")

        # Report variations
        print("\n" + "-"*80)
        print("CASE VARIATIONS DETECTED:")
        print("-"*80)

        variations_found = False
        for normalized, variations in type_variations.items():
            if len(variations) > 1:
                variations_found = True
                print(f"\n'{normalized}' has variations:")
                for var in variations:
                    print(f"  - '{var}' ({content_types[var]} records)")
                self.issues['content_type'].append(f"Variations: {variations}")

        if not variations_found:
            print("\n✅ No case variations detected")

    def analyze_category_formatting(self, records):
        """Analyze thematic_categories field for formatting issues."""
        print("\n" + "="*80)
        print("THEMATIC CATEGORIES FORMATTING")
        print("="*80)

        all_categories = []
        formatting_patterns = Counter()

        for record in records:
            cats_str = record.get('thematic_categories', '').strip()
            if not cats_str:
                continue

            # Detect delimiter
            if ',' in cats_str and ';' in cats_str:
                formatting_patterns['mixed_delimiters'] += 1
            elif ',' in cats_str:
                formatting_patterns['comma_delimited'] += 1
            elif ';' in cats_str:
                formatting_patterns['semicolon_delimited'] += 1
            elif '|' in cats_str:
                formatting_patterns['pipe_delimited'] += 1
            else:
                formatting_patterns['single_value'] += 1

            # Extract individual categories
            if ',' in cats_str:
                cats = [c.strip() for c in cats_str.split(',')]
            elif ';' in cats_str:
                cats = [c.strip() for c in cats_str.split(';')]
            elif '|' in cats_str:
                cats = [c.strip() for c in cats_str.split('|')]
            else:
                cats = [cats_str]

            all_categories.extend(cats)

        print(f"\n{'Formatting Pattern':<30} {'Count':>10}")
        print("-" * 45)
        for pattern, count in formatting_patterns.most_common():
            flag = ""
            if pattern == 'mixed_delimiters':
                flag = " ⚠️  INCONSISTENT"
            print(f"{pattern:<30} {count:>10}{flag}")

        if 'mixed_delimiters' in formatting_patterns:
            self.issues['thematic_categories'].append("Mixed delimiters (commas and semicolons)")

        # Check for case variations in category names
        category_counts = Counter(all_categories)
        category_variations = defaultdict(list)

        for cat in category_counts.keys():
            normalized = cat.lower().strip()
            category_variations[normalized].append(cat)

        print("\n" + "-"*80)
        print("CATEGORY NAME VARIATIONS:")
        print("-"*80)

        variations_found = False
        for normalized, variations in category_variations.items():
            if len(variations) > 1:
                variations_found = True
                print(f"\n'{normalized}' has variations:")
                for var in sorted(variations):
                    print(f"  - '{var}' ({category_counts[var]} occurrences)")
                self.issues['thematic_categories'].append(f"Variations: {variations}")

        if not variations_found:
            print("\n✅ No category name variations detected")

    def analyze_era_standardization(self, records):
        """Analyze era field for inconsistencies."""
        print("\n" + "="*80)
        print("ERA STANDARDIZATION")
        print("="*80)

        eras = Counter(r.get('era', '').strip() for r in records if r.get('era', '').strip())

        print(f"\n{'Era Name':<60} {'Count':>10}")
        print("-" * 75)
        for era, count in eras.most_common():
            flag = ""
            # Check for date range format inconsistencies
            if '(' in era and ')' in era:
                # Has parentheses
                if not re.search(r'\(\d{4}-\d{4}\)|\(\d{4}-Present\)', era):
                    flag = " ⚠️  Non-standard date range"
            print(f"{era:<60} {count:>10}{flag}")

        # Look for similar era names
        era_variations = defaultdict(list)
        for era in eras.keys():
            # Remove date ranges for comparison
            base_name = re.sub(r'\s*\([^)]+\)', '', era).strip()
            era_variations[base_name.lower()].append(era)

        print("\n" + "-"*80)
        print("ERA NAME VARIATIONS:")
        print("-"*80)

        variations_found = False
        for base, variations in era_variations.items():
            if len(variations) > 1:
                variations_found = True
                print(f"\n'{base}' has date range variations:")
                for var in sorted(variations):
                    print(f"  - '{var}' ({eras[var]} records)")
                self.issues['era'].append(f"Variations: {variations}")

        if not variations_found:
            print("\n✅ No era name variations detected")

    def analyze_author_formatting(self, records):
        """Analyze author field for formatting issues."""
        print("\n" + "="*80)
        print("AUTHOR FIELD STANDARDIZATION")
        print("="*80)

        authors = Counter(r.get('author', '').strip() for r in records if r.get('author', '').strip())

        # Look for potential issues
        multi_author_patterns = Counter()
        name_format_issues = []

        for author in authors.keys():
            # Check for multiple authors with different delimiters
            if ' and ' in author.lower():
                multi_author_patterns['and_separator'] += 1
            if ',' in author and ' and ' not in author.lower():
                multi_author_patterns['comma_separator'] += 1
            if ';' in author:
                multi_author_patterns['semicolon_separator'] += 1
            if ' & ' in author:
                multi_author_patterns['ampersand_separator'] += 1

            # Check for inconsistent name formats
            if ',' in author and ' and ' not in author.lower():
                # Might be "Last, First" or multiple authors
                parts = author.split(',')
                if len(parts) == 2 and ' ' in parts[1].strip():
                    # Looks like "Last, First Middle"
                    multi_author_patterns['last_first_format'] += 1

        print(f"\n{'Author Format Pattern':<30} {'Count':>10}")
        print("-" * 45)
        for pattern, count in multi_author_patterns.most_common():
            print(f"{pattern:<30} {count:>10}")

        if len([k for k in multi_author_patterns.keys() if 'separator' in k]) > 1:
            self.issues['author'].append("Multiple author separators used (and, comma, semicolon, ampersand)")

        # Show most common authors
        print(f"\n{'Top 10 Authors':<50} {'Count':>10}")
        print("-" * 65)
        for author, count in authors.most_common(10):
            print(f"{author:<50} {count:>10}")

    def analyze_url_formats(self, records):
        """Analyze URL field for formatting issues."""
        print("\n" + "="*80)
        print("URL STANDARDIZATION")
        print("="*80)

        url_patterns = Counter()
        url_issues = []

        for record in records:
            url = record.get('url', '').strip()
            if not url:
                continue

            # Check protocol
            if url.startswith('https://'):
                url_patterns['https'] += 1
            elif url.startswith('http://'):
                url_patterns['http'] += 1
                url_issues.append((record.get('id'), 'http (not https)', url[:50]))
            else:
                url_patterns['no_protocol'] += 1
                url_issues.append((record.get('id'), 'missing protocol', url[:50]))

            # Check for common issues
            if ' ' in url:
                url_issues.append((record.get('id'), 'contains spaces', url[:50]))
            if '\n' in url or '\r' in url:
                url_issues.append((record.get('id'), 'contains line breaks', url[:50]))

        print(f"\n{'URL Pattern':<30} {'Count':>10}")
        print("-" * 45)
        for pattern, count in url_patterns.most_common():
            print(f"{pattern:<30} {count:>10}")

        if url_issues:
            print(f"\n⚠️  Found {len(url_issues)} URLs with potential issues:")
            for record_id, issue, url_preview in url_issues[:10]:
                print(f"  {record_id}: {issue} - {url_preview}...")
            self.issues['url'].extend([f"{r[0]}: {r[1]}" for r in url_issues])

    def analyze_tags_formatting(self, records):
        """Analyze tags field for formatting issues."""
        print("\n" + "="*80)
        print("TAGS FORMATTING")
        print("="*80)

        delimiter_patterns = Counter()
        all_tags = []

        for record in records:
            tags_str = record.get('tags', '').strip()
            if not tags_str:
                continue

            # Detect delimiter
            if ',' in tags_str and ';' in tags_str:
                delimiter_patterns['mixed'] += 1
            elif ',' in tags_str:
                delimiter_patterns['comma'] += 1
                tags = [t.strip() for t in tags_str.split(',')]
            elif ';' in tags_str:
                delimiter_patterns['semicolon'] += 1
                tags = [t.strip() for t in tags_str.split(';')]
            elif '|' in tags_str:
                delimiter_patterns['pipe'] += 1
                tags = [t.strip() for t in tags_str.split('|')]
            else:
                delimiter_patterns['single'] += 1
                tags = [tags_str]

            all_tags.extend(tags)

        print(f"\n{'Delimiter Type':<30} {'Count':>10}")
        print("-" * 45)
        for pattern, count in delimiter_patterns.most_common():
            flag = " ⚠️  INCONSISTENT" if pattern == 'mixed' else ""
            print(f"{pattern:<30} {count:>10}{flag}")

        # Tag statistics
        tag_counts = Counter(all_tags)
        print(f"\n{'Top 20 Most Common Tags':<40} {'Count':>10}")
        print("-" * 55)
        for tag, count in tag_counts.most_common(20):
            print(f"{tag[:40]:<40} {count:>10}")

        if 'mixed' in delimiter_patterns:
            self.issues['tags'].append("Mixed delimiters used")

    def generate_recommendations(self):
        """Generate standardization recommendations."""
        print("\n" + "="*80)
        print("STANDARDIZATION RECOMMENDATIONS")
        print("="*80)

        recommendations = []

        if self.issues['date_format']:
            recommendations.append({
                'field': 'publication_date',
                'issue': 'Multiple date formats',
                'recommendation': 'Standardize all dates to YYYY-MM-DD (ISO 8601)',
                'priority': 'HIGH'
            })

        if self.issues['content_type']:
            recommendations.append({
                'field': 'content_type',
                'issue': 'Case variations',
                'recommendation': 'Standardize to Title Case (Article, Video, Podcast)',
                'priority': 'MEDIUM'
            })

        if self.issues['thematic_categories']:
            recommendations.append({
                'field': 'thematic_categories',
                'issue': 'Inconsistent formatting/delimiters',
                'recommendation': 'Use consistent comma delimiter, standardize category names',
                'priority': 'HIGH'
            })

        if self.issues['era']:
            recommendations.append({
                'field': 'era',
                'issue': 'Variations in date ranges',
                'recommendation': 'Standardize era names and date range format',
                'priority': 'MEDIUM'
            })

        if self.issues['author']:
            recommendations.append({
                'field': 'author',
                'issue': 'Multiple author separators',
                'recommendation': 'Standardize to "Author1, Author2, and Author3" format',
                'priority': 'LOW'
            })

        if self.issues['url']:
            recommendations.append({
                'field': 'url',
                'issue': 'Non-HTTPS URLs, formatting issues',
                'recommendation': 'Upgrade to HTTPS where possible, remove whitespace',
                'priority': 'MEDIUM'
            })

        if self.issues['tags']:
            recommendations.append({
                'field': 'tags',
                'issue': 'Mixed delimiters',
                'recommendation': 'Standardize to comma-separated format',
                'priority': 'LOW'
            })

        if recommendations:
            print("\n")
            for i, rec in enumerate(recommendations, 1):
                print(f"{i}. [{rec['priority']}] {rec['field']}")
                print(f"   Issue: {rec['issue']}")
                print(f"   Recommendation: {rec['recommendation']}")
                print()
        else:
            print("\n✅ No major standardization issues found!")

        return recommendations

    def run_analysis(self):
        """Run all standardization analyses."""
        csv_file = self.data_dir / "archive_records-public.csv"

        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            records = list(reader)

        print("\n" + "="*80)
        print("DATA STANDARDIZATION ANALYSIS")
        print("="*80)
        print(f"\nAnalyzing {len(records)} records for formatting inconsistencies...")

        self.analyze_date_formats(records)
        self.analyze_content_types(records)
        self.analyze_category_formatting(records)
        self.analyze_era_standardization(records)
        self.analyze_author_formatting(records)
        self.analyze_url_formats(records)
        self.analyze_tags_formatting(records)

        recommendations = self.generate_recommendations()

        # Save report
        report = {
            'generated': datetime.now().isoformat(),
            'total_records': len(records),
            'issues': dict(self.issues),
            'recommendations': recommendations
        }

        report_file = self.data_dir.parent / 'backend' / 'data_standardization_report.json'
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

        print(f"\n📄 Full report saved to: {report_file}")


def main():
    """Run the standardization analysis."""
    data_dir = Path(__file__).parent.parent.parent / 'data'

    if not data_dir.exists():
        print(f"❌ Data directory not found: {data_dir}")
        return

    analyzer = DataStandardizationAnalyzer(data_dir)
    analyzer.run_analysis()

    print("\n" + "="*80)
    print("ANALYSIS COMPLETE")
    print("="*80)
    print()


if __name__ == "__main__":
    main()
