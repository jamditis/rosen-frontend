#!/usr/bin/env python3
"""
Archive Record Reviewer - Systematic validation and repair of archive records

This script validates all archive records against the schema taxonomy and
repairs inconsistencies in categorization, labeling, and relationships.

Usage:
    python backend/scripts/archive_record_reviewer.py [--dry-run] [--report-only]
"""

import csv
import sys
from datetime import datetime
from pathlib import Path
from collections import Counter, defaultdict

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Schema-defined taxonomies (from backend/schema.json)
VALID_ERAS = [
    "Early Career & Public Journalism (1990-1999)",
    "Blogging Launch & Digital Disruption (2000-2004)",
    "Peak Blogging & Citizen Journalism (2005-2009)",
    "Social Media & Financial Crisis (2010-2015)",
    "Trump Era & Democratic Crisis (2016-2020)",
    "Platform Transition & Future Models (2021-Present)"
]

VALID_CATEGORIES = [
    "Press & Media Criticism",
    "Journalism Theory & Practice",
    "Journalism Education",
    "Politics & Democracy",
    "Technology & Digital Media",
    "Audience & Public Engagement"
]

VALID_CONCEPTS = [
    "View from Nowhere",
    "Church of the Savvy",
    "The People Formerly Known as the Audience",
    "Parity Product",
    "Verification in reverse",
    "He said/she said journalism",
    "Audience atomization overcome",
    "The Production of Innocence",
    "Horse-race journalism",
    "False balance",
    "The Citizens' Agenda",
    "Not the odds but the stakes",
    "Mindcasting"
]

VALID_SCOPES = [
    "Theoretical",
    "Commentary/Critique",
    "Historical Analysis",
    "Case Study",
    "Pedagogical",
    "Personal Reflection"
]

VALID_FORMATS = [
    "Blog Post",
    "Article",
    "Academic Paper",
    "Book Chapter",
    "Interview (Text)",
    "Interview (Audio/Video)",
    "Lecture/Presentation",
    "Panel Discussion",
    "Tweet/Thread",
    "Tumblr Post",
    "Newspaper Clipping"
]

# Era mapping for normalization
ERA_MAPPINGS = {
    # Direct matches (already valid)
    "Early Career & Public Journalism (1990-1999)": "Early Career & Public Journalism (1990-1999)",
    "Blogging Launch & Digital Disruption (2000-2004)": "Blogging Launch & Digital Disruption (2000-2004)",
    "Peak Blogging & Citizen Journalism (2005-2009)": "Peak Blogging & Citizen Journalism (2005-2009)",
    "Social Media & Financial Crisis (2010-2015)": "Social Media & Financial Crisis (2010-2015)",
    "Trump Era & Democratic Crisis (2016-2019)": "Trump Era & Democratic Crisis (2016-2020)",
    "Trump Era & Democratic Crisis (2016-2020)": "Trump Era & Democratic Crisis (2016-2020)",
    "Platform Transition & Future Models (2021-Present)": "Platform Transition & Future Models (2021-Present)",

    # Variant mappings
    "Early Career & Public Journalism (1989-1999)": "Early Career & Public Journalism (1990-1999)",
    "The Rise of the Web & Blogging (2000-2009)": "Peak Blogging & Citizen Journalism (2005-2009)",
    "Social Media & Networked Journalism (2010-2016)": "Social Media & Financial Crisis (2010-2015)",
    "COVID-19 & Misinformation Crisis (2020-2021)": "Platform Transition & Future Models (2021-Present)",
    "Post-Trump Transition (2022-2024)": "Platform Transition & Future Models (2021-Present)",
    "Post-Trump & Future of News (2022-Present)": "Platform Transition & Future Models (2021-Present)",
    "Second Trump Administration (2025-Present)": "Platform Transition & Future Models (2021-Present)",
}

# Category mapping for normalization
CATEGORY_MAPPINGS = {
    "Social Media": "Technology & Digital Media",
    "Press Criticism": "Press & Media Criticism",
    "Journalism Practice": "Journalism Theory & Practice",
    "Journalism Practice & Theory": "Journalism Theory & Practice",
    "Democratic Theory": "Politics & Democracy",
    "Journalism History": "Journalism Theory & Practice",
}

# Concept mapping for normalization (keeping only valid ones)
CONCEPT_MAPPINGS = {
    "Citizen Journalism": None,  # Not in approved list - remove
    "Civic Journalism": None,
    "Public Journalism": None,
    "Media Bias": None,
    "Legacy Media": None,
    "Digital Journalism": None,
    "Pro-am journalism": None,
    "Open-source journalism": None,
}


class ArchiveRecordReviewer:
    def __init__(self, csv_path: str, dry_run: bool = False):
        self.csv_path = Path(csv_path)
        self.dry_run = dry_run
        self.records = []
        self.fieldnames = []
        self.issues = defaultdict(list)
        self.repairs = defaultdict(int)

    def load_records(self):
        """Load all records from CSV."""
        with open(self.csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            self.fieldnames = reader.fieldnames
            self.records = list(reader)
        print(f"Loaded {len(self.records)} records from {self.csv_path}")

    def validate_era(self, record: dict) -> tuple[str, str | None]:
        """Validate and normalize era field."""
        era = record.get('era', '').strip()
        if not era:
            return era, None

        # Check if already valid
        if era in VALID_ERAS:
            return era, None

        # Check mappings
        if era in ERA_MAPPINGS:
            return ERA_MAPPINGS[era], f"era: '{era}' -> '{ERA_MAPPINGS[era]}'"

        # Try to infer from publication date
        pub_date = record.get('publication_date', '').strip()
        if pub_date:
            try:
                year = int(pub_date[:4])
                if 1990 <= year <= 1999:
                    return "Early Career & Public Journalism (1990-1999)", f"era: '{era}' -> inferred from year {year}"
                elif 2000 <= year <= 2004:
                    return "Blogging Launch & Digital Disruption (2000-2004)", f"era: '{era}' -> inferred from year {year}"
                elif 2005 <= year <= 2009:
                    return "Peak Blogging & Citizen Journalism (2005-2009)", f"era: '{era}' -> inferred from year {year}"
                elif 2010 <= year <= 2015:
                    return "Social Media & Financial Crisis (2010-2015)", f"era: '{era}' -> inferred from year {year}"
                elif 2016 <= year <= 2020:
                    return "Trump Era & Democratic Crisis (2016-2020)", f"era: '{era}' -> inferred from year {year}"
                elif year >= 2021:
                    return "Platform Transition & Future Models (2021-Present)", f"era: '{era}' -> inferred from year {year}"
            except (ValueError, IndexError):
                pass

        self.issues['invalid_era'].append((record.get('id', ''), era))
        return era, None

    def validate_categories(self, record: dict) -> tuple[str, str | None]:
        """Validate and normalize thematic categories."""
        cat_str = record.get('thematic_categories', '').strip()
        if not cat_str:
            return cat_str, None

        categories = [c.strip() for c in cat_str.split(',') if c.strip()]
        normalized = []
        changes = []

        for cat in categories:
            if cat in VALID_CATEGORIES:
                normalized.append(cat)
            elif cat in CATEGORY_MAPPINGS:
                if CATEGORY_MAPPINGS[cat]:  # Not None
                    normalized.append(CATEGORY_MAPPINGS[cat])
                    changes.append(f"'{cat}' -> '{CATEGORY_MAPPINGS[cat]}'")
            else:
                # Unknown category - try fuzzy match
                matched = False
                for valid in VALID_CATEGORIES:
                    if cat.lower() in valid.lower() or valid.lower() in cat.lower():
                        normalized.append(valid)
                        changes.append(f"'{cat}' -> '{valid}'")
                        matched = True
                        break
                if not matched:
                    self.issues['invalid_category'].append((record.get('id', ''), cat))

        # Remove duplicates while preserving order
        seen = set()
        unique = []
        for c in normalized:
            if c not in seen:
                seen.add(c)
                unique.append(c)

        result = ', '.join(unique)
        if changes:
            return result, f"categories: {'; '.join(changes)}"
        return result, None

    def validate_concepts(self, record: dict) -> tuple[str, str | None]:
        """Validate and normalize key concepts."""
        concept_str = record.get('key_concepts', '').strip()
        if not concept_str:
            return concept_str, None

        concepts = [c.strip() for c in concept_str.split(',') if c.strip()]
        normalized = []
        changes = []
        removed = []

        for concept in concepts:
            if concept in VALID_CONCEPTS:
                normalized.append(concept)
            elif concept in CONCEPT_MAPPINGS:
                if CONCEPT_MAPPINGS[concept]:  # Not None - has a mapping
                    normalized.append(CONCEPT_MAPPINGS[concept])
                    changes.append(f"'{concept}' -> '{CONCEPT_MAPPINGS[concept]}'")
                else:
                    removed.append(concept)
            else:
                # Check for case variations
                matched = False
                for valid in VALID_CONCEPTS:
                    if concept.lower() == valid.lower():
                        normalized.append(valid)
                        if concept != valid:
                            changes.append(f"'{concept}' -> '{valid}'")
                        matched = True
                        break
                if not matched:
                    removed.append(concept)

        # Remove duplicates while preserving order
        seen = set()
        unique = []
        for c in normalized:
            if c not in seen:
                seen.add(c)
                unique.append(c)

        result = ', '.join(unique)

        change_notes = []
        if changes:
            change_notes.append(f"normalized: {'; '.join(changes)}")
        if removed:
            change_notes.append(f"removed non-standard: {', '.join(removed)}")

        if change_notes:
            return result, f"concepts: {'; '.join(change_notes)}"
        return result, None

    def validate_verification(self, record: dict) -> tuple[str, str | None]:
        """Normalize verification status to TRUE/FALSE."""
        verified = record.get('verified', '').strip()

        if verified in ['TRUE', 'true', 'True', 'Yes', 'yes', '1']:
            if verified != 'TRUE':
                return 'TRUE', f"verified: '{verified}' -> 'TRUE'"
            return 'TRUE', None
        elif verified in ['FALSE', 'false', 'False', 'No', 'no', '0']:
            if verified != 'FALSE':
                return 'FALSE', f"verified: '{verified}' -> 'FALSE'"
            return 'FALSE', None
        elif not verified:
            return 'FALSE', "verified: [empty] -> 'FALSE'"
        else:
            self.issues['invalid_verification'].append((record.get('id', ''), verified))
            return verified, None

    def validate_record(self, record: dict) -> tuple[dict, list[str]]:
        """Validate and normalize a single record."""
        updated = dict(record)
        changes = []

        # Validate era
        era, era_change = self.validate_era(record)
        if era_change:
            updated['era'] = era
            changes.append(era_change)
            self.repairs['era'] += 1

        # Validate categories
        cats, cats_change = self.validate_categories(record)
        if cats_change:
            updated['thematic_categories'] = cats
            changes.append(cats_change)
            self.repairs['categories'] += 1

        # Validate concepts
        concepts, concepts_change = self.validate_concepts(record)
        if concepts_change:
            updated['key_concepts'] = concepts
            changes.append(concepts_change)
            self.repairs['concepts'] += 1

        # Validate verification status
        verified, verified_change = self.validate_verification(record)
        if verified_change:
            updated['verified'] = verified
            changes.append(verified_change)
            self.repairs['verification'] += 1

        return updated, changes

    def review_all_records(self):
        """Review and validate all records."""
        print("\n" + "=" * 60)
        print("REVIEWING ALL ARCHIVE RECORDS")
        print("=" * 60)

        updated_records = []
        total_changes = 0

        for i, record in enumerate(self.records):
            updated, changes = self.validate_record(record)
            updated_records.append(updated)

            if changes:
                total_changes += len(changes)
                record_id = record.get('id', f'row_{i}')
                if len(changes) <= 3:
                    print(f"  {record_id}: {'; '.join(changes)}")
                else:
                    print(f"  {record_id}: {len(changes)} changes")

        self.records = updated_records
        print(f"\nTotal changes made: {total_changes}")

    def generate_report(self) -> str:
        """Generate a detailed validation report."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        report = []
        report.append("=" * 70)
        report.append("ARCHIVE RECORD VALIDATION REPORT")
        report.append(f"Generated: {timestamp}")
        report.append("=" * 70)

        report.append("\n## SUMMARY\n")
        report.append(f"Total records reviewed: {len(self.records)}")
        report.append(f"Dry run mode: {self.dry_run}")

        report.append("\n### Repairs Made")
        for field, count in sorted(self.repairs.items()):
            report.append(f"  {field}: {count}")
        report.append(f"  TOTAL: {sum(self.repairs.values())}")

        if self.issues:
            report.append("\n### Unresolved Issues")
            for issue_type, items in sorted(self.issues.items()):
                report.append(f"\n  {issue_type}: {len(items)} issues")
                for record_id, value in items[:10]:
                    report.append(f"    - {record_id}: '{value}'")
                if len(items) > 10:
                    report.append(f"    ... and {len(items) - 10} more")

        # Post-validation statistics
        report.append("\n## POST-VALIDATION STATISTICS\n")

        # Era distribution
        eras = Counter()
        for r in self.records:
            era = r.get('era', '').strip()
            eras[era if era else '[EMPTY]'] += 1
        report.append("### Era Distribution")
        for era, count in sorted(eras.items(), key=lambda x: -x[1]):
            valid = "✓" if era in VALID_ERAS else "✗"
            report.append(f"  {valid} {count:4d}: {era[:60]}")

        # Category distribution
        cats = Counter()
        empty_cats = 0
        for r in self.records:
            cat_str = r.get('thematic_categories', '').strip()
            if cat_str:
                for cat in cat_str.split(','):
                    cats[cat.strip()] += 1
            else:
                empty_cats += 1
        report.append(f"\n### Category Distribution (empty: {empty_cats})")
        for cat, count in sorted(cats.items(), key=lambda x: -x[1]):
            valid = "✓" if cat in VALID_CATEGORIES else "✗"
            report.append(f"  {valid} {count:4d}: {cat}")

        # Concept distribution
        concepts = Counter()
        empty_concepts = 0
        for r in self.records:
            concept_str = r.get('key_concepts', '').strip()
            if concept_str:
                for c in concept_str.split(','):
                    concepts[c.strip()] += 1
            else:
                empty_concepts += 1
        report.append(f"\n### Concept Distribution (empty: {empty_concepts})")
        for c, count in sorted(concepts.items(), key=lambda x: -x[1]):
            valid = "✓" if c in VALID_CONCEPTS else "✗"
            report.append(f"  {valid} {count:4d}: {c}")

        # Verification status
        verified = Counter()
        for r in self.records:
            v = r.get('verified', '').strip()
            verified[v if v else '[EMPTY]'] += 1
        report.append("\n### Verification Status")
        for v, count in sorted(verified.items(), key=lambda x: -x[1]):
            report.append(f"  {count:4d}: {v}")

        return '\n'.join(report)

    def save_records(self, output_path: str = None):
        """Save validated records back to CSV."""
        if output_path is None:
            output_path = self.csv_path

        if self.dry_run:
            print(f"\n[DRY RUN] Would save to: {output_path}")
            return

        with open(output_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=self.fieldnames)
            writer.writeheader()
            writer.writerows(self.records)

        print(f"\nSaved {len(self.records)} records to {output_path}")

    def run(self, report_only: bool = False):
        """Run the full validation process."""
        self.load_records()
        self.review_all_records()

        report = self.generate_report()
        print("\n" + report)

        # Save report
        report_path = PROJECT_ROOT / 'data' / f'validation_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.txt'
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(report)
        print(f"\nReport saved to: {report_path}")

        if not report_only:
            self.save_records()


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Archive Record Reviewer')
    parser.add_argument('--dry-run', action='store_true', help='Do not save changes')
    parser.add_argument('--report-only', action='store_true', help='Only generate report, no modifications')
    args = parser.parse_args()

    csv_path = PROJECT_ROOT / 'data' / 'archive_records-public.csv'

    reviewer = ArchiveRecordReviewer(str(csv_path), dry_run=args.dry_run)
    reviewer.run(report_only=args.report_only)


if __name__ == '__main__':
    main()
