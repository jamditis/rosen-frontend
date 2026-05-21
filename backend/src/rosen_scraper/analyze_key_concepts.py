# -*- coding: utf-8 -*-
"""
Key Concepts Analysis Script

This script analyzes all key concepts from column Q and their corresponding
recommendations in column AK from the test_runs sheet to identify patterns
and suggest improvements to the taxonomy.

Usage:
    python src/analyze_key_concepts.py
"""

import os
from collections import Counter, defaultdict
from typing import List, Set
from dotenv import load_dotenv
import gspread
from google.oauth2.service_account import Credentials

# Load environment variables
load_dotenv()

# Configuration
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]
CREDENTIALS_FILE = "google_credentials.json"
SPREADSHEET_NAME = os.getenv("SPREADSHEET_NAME", "Rosen Archive URL List")
SHEET_NAME = "test_runs"

# Column mappings (0-indexed)
COL_KEY_CONCEPTS = 16  # Column Q (key_concepts)
COL_CHANGES = 36  # Column AK (changes/recommendations)

OUTPUT_FILE = "key_concepts_analysis.txt"


def setup_google_sheets() -> gspread.Spreadsheet:
    """Initialize Google Sheets connection"""
    creds = Credentials.from_service_account_file(
        CREDENTIALS_FILE,
        scopes=SCOPES
    )
    client = gspread.authorize(creds)
    spreadsheet = client.open(SPREADSHEET_NAME)
    return spreadsheet


def parse_concepts(concepts_str: str) -> List[str]:
    """Parse comma-separated or pipe-separated concepts"""
    if not concepts_str:
        return []

    # Handle both comma and pipe separators
    if '|' in concepts_str:
        concepts = [c.strip() for c in concepts_str.split('|')]
    else:
        concepts = [c.strip() for c in concepts_str.split(',')]

    return [c for c in concepts if c]


def extract_mentioned_concepts(recommendation: str) -> Set[str]:
    """Extract concept mentions from recommendation text"""
    if not recommendation:
        return set()

    mentioned = set()

    # Common patterns for concept mentions
    concepts_keywords = [
        "View from Nowhere",
        "Church of the Savvy",
        "The People Formerly Known as the Audience",
        "Parity Product",
        "Verification in reverse",
        "He said/she said journalism",
        "Audience atomization overcome",
        "The Production of Innocence",
        # Additional concepts that might be mentioned
        "horse-race journalism",
        "citizens agenda",
        "public journalism",
        "accountability journalism",
        "both sides",
        "false balance",
        "objectivity",
        "neutrality"
    ]

    rec_lower = recommendation.lower()
    for concept in concepts_keywords:
        if concept.lower() in rec_lower:
            mentioned.add(concept)

    return mentioned


def analyze_key_concepts(spreadsheet: gspread.Spreadsheet):
    """Analyze key concepts and recommendations from the sheet"""
    worksheet = spreadsheet.worksheet(SHEET_NAME)

    # Get all rows
    all_rows = worksheet.get_all_values()

    if len(all_rows) < 2:
        print("No data rows found in sheet")
        return

    print(f"[*] Analyzing {len(all_rows) - 1} rows...")

    # Data structures for analysis
    concept_counts = Counter()
    concept_recommendations = defaultdict(list)
    suggested_concepts = Counter()
    rows_with_concepts = 0
    rows_with_recommendations = 0

    # Process each row
    for i, row in enumerate(all_rows[1:], start=2):  # Skip header
        # Get key concepts from column Q
        key_concepts_str = row[COL_KEY_CONCEPTS] if len(row) > COL_KEY_CONCEPTS else ""

        # Get recommendations from column AK
        recommendations = row[COL_CHANGES] if len(row) > COL_CHANGES else ""

        if key_concepts_str:
            rows_with_concepts += 1
            concepts = parse_concepts(key_concepts_str)

            for concept in concepts:
                concept_counts[concept] += 1

                # Store recommendation with this concept if present
                if recommendations and recommendations != "Looks good" and recommendations != "Looks good.":
                    concept_recommendations[concept].append({
                        'row': i,
                        'recommendation': recommendations[:200]  # First 200 chars
                    })

        if recommendations:
            rows_with_recommendations += 1

            # Extract mentioned concepts from recommendations
            mentioned = extract_mentioned_concepts(recommendations)
            for concept in mentioned:
                suggested_concepts[concept] += 1

    # Generate report
    report_lines = []
    report_lines.append("=" * 80)
    report_lines.append("KEY CONCEPTS ANALYSIS REPORT")
    report_lines.append("=" * 80)
    report_lines.append("")

    report_lines.append(f"Total rows analyzed: {len(all_rows) - 1}")
    report_lines.append(f"Rows with key concepts: {rows_with_concepts}")
    report_lines.append(f"Rows with recommendations: {rows_with_recommendations}")
    report_lines.append("")

    # Section 1: Current Key Concepts Usage
    report_lines.append("=" * 80)
    report_lines.append("SECTION 1: CURRENT KEY CONCEPTS USAGE")
    report_lines.append("=" * 80)
    report_lines.append("")

    total_concept_instances = sum(concept_counts.values())
    report_lines.append(f"Total concept instances: {total_concept_instances}")
    report_lines.append(f"Unique concepts used: {len(concept_counts)}")
    report_lines.append("")

    report_lines.append("Concept frequency (sorted by count):")
    report_lines.append("-" * 80)
    for concept, count in concept_counts.most_common():
        percentage = (count / total_concept_instances) * 100 if total_concept_instances > 0 else 0
        report_lines.append(f"  {count:4d} ({percentage:5.1f}%) - {concept}")
    report_lines.append("")

    # Section 2: Concepts Mentioned in Recommendations
    report_lines.append("=" * 80)
    report_lines.append("SECTION 2: CONCEPTS MENTIONED IN RECOMMENDATIONS")
    report_lines.append("=" * 80)
    report_lines.append("")
    report_lines.append("These concepts appear in AI recommendations, suggesting they may be")
    report_lines.append("relevant but are not currently in the schema or not being captured:")
    report_lines.append("")

    for concept, count in suggested_concepts.most_common(20):
        report_lines.append(f"  {count:4d} mentions - {concept}")
    report_lines.append("")

    # Section 3: Concepts with Frequent Recommendations
    report_lines.append("=" * 80)
    report_lines.append("SECTION 3: CONCEPTS WITH FREQUENT RECOMMENDATIONS")
    report_lines.append("=" * 80)
    report_lines.append("")
    report_lines.append("Concepts that frequently have recommendations for changes:")
    report_lines.append("")

    concepts_with_many_recs = [(c, len(recs)) for c, recs in concept_recommendations.items()]
    concepts_with_many_recs.sort(key=lambda x: x[1], reverse=True)

    for concept, rec_count in concepts_with_many_recs[:10]:
        report_lines.append(f"\n{concept} - {rec_count} recommendations")
        report_lines.append("-" * 80)
        for rec_info in concept_recommendations[concept][:3]:  # Show first 3 examples
            report_lines.append(f"  Row {rec_info['row']}: {rec_info['recommendation']}")
    report_lines.append("")

    # Section 4: Sample Recommendations for Review
    report_lines.append("=" * 80)
    report_lines.append("SECTION 4: SAMPLE RECOMMENDATIONS FOR REVIEW")
    report_lines.append("=" * 80)
    report_lines.append("")

    sample_recs = []
    for i, row in enumerate(all_rows[1:], start=2):
        recommendations = row[COL_CHANGES] if len(row) > COL_CHANGES else ""
        key_concepts = row[COL_KEY_CONCEPTS] if len(row) > COL_KEY_CONCEPTS else ""

        if recommendations and recommendations not in ["Looks good", "Looks good.", ""]:
            sample_recs.append({
                'row': i,
                'concepts': key_concepts,
                'recommendation': recommendations[:300]
            })

        if len(sample_recs) >= 20:
            break

    for rec in sample_recs:
        report_lines.append(f"Row {rec['row']} - Current: {rec['concepts']}")
        report_lines.append(f"Recommendation: {rec['recommendation']}")
        report_lines.append("-" * 80)

    # Write report to file
    report_text = "\n".join(report_lines)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(report_text)

    print("\n[*] Analysis complete!")
    print(f"[*] Report saved to: {OUTPUT_FILE}")
    print("\n[*] Summary:")
    print(f"  - {rows_with_concepts} rows have key concepts")
    print(f"  - {rows_with_recommendations} rows have recommendations")
    print(f"  - {len(concept_counts)} unique concepts in use")
    print(f"  - {len(suggested_concepts)} concepts mentioned in recommendations")

    return report_text


def main():
    """Main execution function"""
    print("[*] Key Concepts Analysis")
    print("=" * 80)

    # Setup connection
    print("[*] Connecting to Google Sheets...")
    spreadsheet = setup_google_sheets()

    # Analyze
    print("[*] Analyzing key concepts and recommendations...")
    analyze_key_concepts(spreadsheet)


if __name__ == "__main__":
    main()
