#!/usr/bin/env python3
"""
Auto-categorize archive records based on title, URL, and content analysis.

This script analyzes uncategorized records and assigns appropriate thematic categories
using keyword matching and heuristic rules. It is conservative - only assigning categories
when there is high confidence, and flagging records that need manual review.

The valid thematic categories are defined once in backend/schema.json
(taxonomy.thematic_categories). This script's CATEGORY_PATTERNS keys are checked
against that list at import and raise if they drift.

Usage:
    python auto_categorize_records.py [--dry-run] [--confidence-threshold 0.6]
"""

import csv
import re
import sys
from pathlib import Path
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Tuple
import argparse

# Import the shared taxonomy loader whether this file is run directly
# (python backend/scripts/...) or imported as a module.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from taxonomy import thematic_categories


# Category keyword patterns (case-insensitive)
CATEGORY_PATTERNS = {
    "Journalism Education": {
        "strong": [
            r"\bstudio\s*20\b",
            r"\bnyu\b",
            r"\bteaching\b",
            r"\bcurriculum\b",
            r"\bpedagog",
            r"\bjournalism\s+school",
            r"\bjournalism\s+education",
            r"\bstudent project",
            r"\bclass\s+of\s+\d{4}",
            r"\bsummer\s+gig",
            r"\binternship",
        ],
        "medium": [
            r"\bacademic",
            r"\buniversity",
            r"\bcollege",
            r"\blearning",
            r"\btraining",
            r"\bprofessor",
        ],
    },
    "Technology & Digital Media": {
        "strong": [
            r"\bblog(?:ging|s)?\b",
            r"\btwitter\b",
            r"\bsocial\s+media\b",
            r"\bplatform",
            r"\bdigital",
            r"\bonline",
            r"\binternet\b",
            r"\bweb\b",
            r"\btechnology",
            r"\btech\b",
            r"\bfacebook\b",
            r"\bbluesky\b",
            r"\bsubstack\b",
            r"\bnewsletter",
        ],
        "medium": [
            r"\bdata",
            r"\balgorithm",
            r"\bai\b",
            r"\bapp\b",
            r"\bsite\b",
            r"\bvideo\b",
            r"\bpodcast",
        ],
    },
    "Audience & Public Engagement": {
        "strong": [
            r"\baudience\b",
            r"\breader",
            r"\bpublic\s+journalism",
            r"\bcivic\s+journalism",
            r"\bcitizen",
            r"\bcommunity\s+engagement",
            r"\bparticipat",
            r"\bpeople\s+formerly\s+known",
            r"\batomization",
            r"\bengagement",
        ],
        "medium": [
            r"\buser",
            r"\bcommunity",
            r"\bpublic\b",
            r"\bpeople\b",
            r"\bcomment",
            r"\bconversation",
        ],
    },
    "Press & Media Criticism": {
        "strong": [
            r"\bpress\b",
            r"\bmedia\s+criticism",
            r"\bnews\s+coverage",
            r"\bjournalistic\s+practice",
            r"\bmedia\s+performance",
            r"\bcoverage\s+failure",
            r"\bmedia\s+dysfunction",
            r"\bview\s+from\s+nowhere",
            r"\bchurch\s+of\s+the\s+savvy",
            r"\bhe\s+said[,\s]+she\s+said",
            r"\bfalse\s+balance",
            r"\bhorse[- ]race",
        ],
        "medium": [
            r"\bmedia\b",
            r"\bnews",
            r"\bnewsroom",
            r"\breporter",
            r"\bpress\s+critic",
            r"\bcoverage",
            r"\bjournalist",
        ],
    },
    "Politics & Democracy": {
        "strong": [
            r"\bdemocracy\b",
            r"\belection",
            r"\bvoting\b",
            r"\bpolitical\s+coverage",
            r"\bcampaign",
            r"\bgovernment",
            r"\bdemocratic\s+backsliding",
            r"\bauthoritarian",
            r"\btrump\b",
            r"\bobama\b",
            r"\bpresident",
        ],
        "medium": [
            r"\bpolitic",
            r"\bdemocrat",
            r"\brepublican",
            r"\bcandidate",
            r"\bpolicy\b",
            r"\bcivic",
        ],
    },
    "Journalism Theory & Practice": {
        "strong": [
            r"\bjournalism\s+theory",
            r"\bjournalistic\s+method",
            r"\bprofessional\s+standard",
            r"\bobjectivity",
            r"\bverification",
            r"\breporting\s+practice",
            r"\bjournalistic\s+principle",
            r"\bnews\s+judgment",
        ],
        "medium": [
            r"\bjournalism\b",
            r"\breporting\b",
            r"\beditor",
            r"\bnewspaper",
            r"\bstory(?:telling)?",
            r"\bnews\s+organization",
        ],
    },
}

# URL patterns for specific categories
URL_PATTERNS = {
    "Journalism Education": [
        r"studio20",
        r"journalism\.nyu\.edu",
        r"education",
    ],
    "Technology & Digital Media": [
        r"twitter\.com",
        r"facebook\.com",
        r"tumblr",
        r"blog",
        r"digital",
    ],
}


def _assert_patterns_match_schema() -> None:
    """Fail loud if a keyword rule names a bucket schema.json does not list.

    A CATEGORY_PATTERNS or URL_PATTERNS key outside the canonical set would try
    to assign a value the reviewer then rejects, so it is a bug. A canonical
    category with no rule is fine: a new bucket can stay manual-only until
    someone writes heuristics for it, which keeps adding a category a one-file
    edit to schema.json rather than a schema edit plus placeholder rules.
    """
    canonical = set(thematic_categories())
    unknown = sorted(set(CATEGORY_PATTERNS) - canonical)
    if unknown:
        raise SystemExit(
            "CATEGORY_PATTERNS names buckets not in backend/schema.json "
            f"(taxonomy.thematic_categories): {unknown}. "
            "Edit schema.json and the rules together."
        )
    unknown_urls = sorted(set(URL_PATTERNS) - canonical)
    if unknown_urls:
        raise SystemExit(
            "URL_PATTERNS references buckets not in backend/schema.json "
            f"(taxonomy.thematic_categories): {unknown_urls}. "
            "Edit schema.json and the rules together."
        )


_assert_patterns_match_schema()

# Special case patterns
SPECIAL_CASES = {
    # Generic "Studio 20" titles should be education
    r"^Studio\s+20\s*$": ["Journalism Education"],
}


class RecordCategorizer:
    """Categorizes archive records based on content analysis."""

    def __init__(self, confidence_threshold: float = 0.6):
        """
        Initialize categorizer.

        Args:
            confidence_threshold: Minimum confidence score (0-1) to assign a category
        """
        self.confidence_threshold = confidence_threshold
        self.stats = {
            "total": 0,
            "categorized": 0,
            "needs_review": 0,
            "no_content": 0,
            "categories_assigned": defaultdict(int),
        }
        self.review_cases = []

    def analyze_text(self, text: str, category: str, patterns: Dict[str, List[str]]) -> float:
        """
        Analyze text for category-specific patterns and return confidence score.

        Args:
            text: Text to analyze
            category: Category name
            patterns: Dict with 'strong' and 'medium' pattern lists

        Returns:
            Confidence score between 0 and 1
        """
        if not text:
            return 0.0

        text_lower = text.lower()
        score = 0.0
        matches = []

        # Strong patterns contribute more to confidence
        for pattern in patterns.get("strong", []):
            if re.search(pattern, text_lower):
                score += 0.3
                matches.append(("strong", pattern))

        # Medium patterns contribute less
        for pattern in patterns.get("medium", []):
            if re.search(pattern, text_lower):
                score += 0.1
                matches.append(("medium", pattern))

        # Cap at 1.0
        return min(score, 1.0)

    def analyze_url(self, url: str, category: str) -> float:
        """Analyze URL for category-specific patterns."""
        if not url:
            return 0.0

        url_lower = url.lower()
        patterns = URL_PATTERNS.get(category, [])

        for pattern in patterns:
            if re.search(pattern, url_lower):
                return 0.2  # URLs give a small confidence boost

        return 0.0

    def check_special_cases(self, title: str) -> List[str]:
        """Check if title matches any special case patterns."""
        if not title:
            return []

        for pattern, categories in SPECIAL_CASES.items():
            if re.match(pattern, title, re.IGNORECASE):
                return categories

        return []

    def categorize_record(self, record: Dict[str, str]) -> Tuple[List[str], float, str]:
        """
        Categorize a single record.

        Args:
            record: Dict containing record data

        Returns:
            Tuple of (categories list, confidence score, reason/notes)
        """
        # Check special cases first
        special = self.check_special_cases(record.get("title", ""))
        if special:
            return special, 1.0, "Special case: generic Studio 20 title"

        # Combine all available text
        text_parts = [
            record.get("title", ""),
            record.get("summary", ""),
            record.get("excerpt", ""),
            record.get("raw_text", "")[:2000],  # Limit raw text length
            record.get("tags", ""),
        ]
        combined_text = " ".join(filter(None, text_parts))

        if not combined_text.strip():
            return [], 0.0, "No content available for analysis"

        # Score each category
        category_scores = {}
        for category, patterns in CATEGORY_PATTERNS.items():
            text_score = self.analyze_text(combined_text, category, patterns)
            url_score = self.analyze_url(record.get("url", ""), category)
            category_scores[category] = text_score + url_score

        # Select categories above threshold
        selected_categories = [
            cat for cat, score in category_scores.items()
            if score >= self.confidence_threshold
        ]

        # Calculate overall confidence as max score
        max_score = max(category_scores.values()) if category_scores else 0.0

        # Generate reason
        if selected_categories:
            reason = f"Matched patterns (scores: {', '.join(f'{cat}: {category_scores[cat]:.2f}' for cat in selected_categories)})"
        else:
            reason = f"Below confidence threshold (max score: {max_score:.2f})"

        return selected_categories, max_score, reason

    def process_records(
        self,
        records_to_categorize: List[str],
        all_records: Dict[str, Dict[str, str]]
    ) -> Dict[str, List[str]]:
        """
        Process all records and assign categories.

        Args:
            records_to_categorize: List of record IDs needing categorization
            all_records: Dict mapping record IDs to their full data

        Returns:
            Dict mapping record IDs to assigned categories
        """
        categorizations = {}

        for record_id in records_to_categorize:
            self.stats["total"] += 1

            if record_id not in all_records:
                print(f"WARNING: Record {record_id} not found in main archive")
                continue

            record = all_records[record_id]
            categories, confidence, reason = self.categorize_record(record)

            if not categories:
                if "No content" in reason:
                    self.stats["no_content"] += 1
                else:
                    self.stats["needs_review"] += 1
                    self.review_cases.append({
                        "id": record_id,
                        "title": record.get("title", ""),
                        "reason": reason,
                        "confidence": confidence,
                    })
            else:
                self.stats["categorized"] += 1
                for cat in categories:
                    self.stats["categories_assigned"][cat] += 1

            categorizations[record_id] = categories

        return categorizations

    def print_report(self):
        """Print categorization report."""
        print("\n" + "=" * 80)
        print("AUTO-CATEGORIZATION REPORT")
        print("=" * 80)
        print(f"\nTotal records processed: {self.stats['total']}")
        print(f"Successfully categorized: {self.stats['categorized']} ({self.stats['categorized']/self.stats['total']*100:.1f}%)")
        print(f"Need manual review: {self.stats['needs_review']} ({self.stats['needs_review']/self.stats['total']*100:.1f}%)")
        print(f"No content available: {self.stats['no_content']} ({self.stats['no_content']/self.stats['total']*100:.1f}%)")

        print("\n" + "-" * 80)
        print("CATEGORIES ASSIGNED:")
        print("-" * 80)
        for category, count in sorted(self.stats["categories_assigned"].items(), key=lambda x: x[1], reverse=True):
            print(f"  {category}: {count}")

        if self.review_cases:
            print("\n" + "-" * 80)
            print(f"RECORDS NEEDING MANUAL REVIEW ({len(self.review_cases)}):")
            print("-" * 80)
            for case in self.review_cases[:20]:  # Show first 20
                print(f"\n  {case['id']}: {case['title'][:60]}")
                print(f"    Reason: {case['reason']}")
            if len(self.review_cases) > 20:
                print(f"\n  ... and {len(self.review_cases) - 20} more")


def load_records_needing_categories(filepath: Path) -> List[str]:
    """Load list of record IDs that need categorization."""
    record_ids = []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            record_ids.append(row['id'])
    return record_ids


def load_all_records(filepath: Path) -> Dict[str, Dict[str, str]]:
    """Load all archive records into a dict keyed by ID."""
    records = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            records[row['id']] = row
    return records


def update_archive_csv(
    filepath: Path,
    categorizations: Dict[str, List[str]],
    dry_run: bool = False
) -> None:
    """Update the archive CSV with new categories."""
    # Read all records
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    # Update records with new categories
    updated_count = 0
    for row in rows:
        record_id = row['id']
        if record_id in categorizations and categorizations[record_id]:
            # Join categories with semicolon
            row['thematic_categories'] = '; '.join(categorizations[record_id])
            updated_count += 1

    print(f"\nUpdating {updated_count} records in CSV...")

    if not dry_run:
        # Write back to file
        with open(filepath, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        print(f"✓ Successfully updated {filepath}")
    else:
        print(f"✓ DRY RUN: Would update {filepath}")


def save_categorization_report(
    categorizations: Dict[str, List[str]],
    all_records: Dict[str, Dict[str, str]],
    output_path: Path
) -> None:
    """Save detailed categorization report to CSV."""
    with open(output_path, 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['id', 'title', 'url', 'assigned_categories', 'status']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for record_id, categories in categorizations.items():
            record = all_records.get(record_id, {})
            writer.writerow({
                'id': record_id,
                'title': record.get('title', ''),
                'url': record.get('url', ''),
                'assigned_categories': '; '.join(categories) if categories else '',
                'status': 'Categorized' if categories else 'Needs Review',
            })

    print(f"✓ Saved detailed report to {output_path}")


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(description='Auto-categorize archive records')
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Run without modifying files'
    )
    parser.add_argument(
        '--confidence-threshold',
        type=float,
        default=0.6,
        help='Minimum confidence score to assign category (0-1, default: 0.6)'
    )
    args = parser.parse_args()

    # Setup paths
    project_root = Path(__file__).parent.parent.parent
    data_dir = project_root / 'data'
    records_needing_categories = data_dir / 'records_needing_categories.csv'
    archive_csv = data_dir / 'archive_records-public.csv'
    report_path = project_root / 'backend' / 'reports' / f'categorization_report_{datetime.now():%Y%m%d_%H%M%S}.csv'

    # Ensure report directory exists
    report_path.parent.mkdir(exist_ok=True)

    print("=" * 80)
    print("AUTO-CATEGORIZATION SCRIPT")
    print("=" * 80)
    print("\nConfiguration:")
    print(f"  Confidence threshold: {args.confidence_threshold}")
    print(f"  Dry run: {args.dry_run}")
    print("\nLoading data...")

    # Load data
    record_ids_to_categorize = load_records_needing_categories(records_needing_categories)
    all_records = load_all_records(archive_csv)

    print(f"  Records needing categorization: {len(record_ids_to_categorize)}")
    print(f"  Total records in archive: {len(all_records)}")

    # Process records
    print("\nProcessing records...")
    categorizer = RecordCategorizer(confidence_threshold=args.confidence_threshold)
    categorizations = categorizer.process_records(record_ids_to_categorize, all_records)

    # Print report
    categorizer.print_report()

    # Update CSV
    print("\n" + "=" * 80)
    update_archive_csv(archive_csv, categorizations, dry_run=args.dry_run)

    # Save detailed report
    save_categorization_report(categorizations, all_records, report_path)

    print("\n" + "=" * 80)
    print("COMPLETE")
    print("=" * 80)
    if args.dry_run:
        print("\nThis was a DRY RUN. No files were modified.")
        print("Run without --dry-run to apply changes.")
    else:
        print("\n✓ Categories have been assigned to records")
        print(f"✓ Detailed report saved to: {report_path}")
        print("\nNext steps:")
        print(f"  1. Review the {categorizer.stats['needs_review']} records marked for manual review")
        print(f"  2. Check the categorization report at: {report_path}")
        print("  3. Manually categorize remaining records as needed")


if __name__ == "__main__":
    main()
