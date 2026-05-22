#!/usr/bin/env python3
"""
Generate summaries for archive records that are missing them.

This script:
1. Identifies records with empty summary fields
2. Generates appropriate summaries based on available content
3. Updates the CSV with new summaries
4. Generates a report of changes

Author: Archive Automation
Date: 2026-01-06
"""

import csv
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional


class SummaryGenerator:
    """Generates summaries for archive records based on available content."""

    def __init__(self, csv_path: str):
        self.csv_path = Path(csv_path)
        self.records: List[Dict] = []
        self.updates: List[Dict] = []

    def load_records(self) -> None:
        """Load all records from CSV."""
        with open(self.csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            self.records = list(reader)
        print(f"Loaded {len(self.records)} records from {self.csv_path}")

    def extract_hashtags(self, text: str) -> List[str]:
        """Extract hashtags from text, removing the # symbol."""
        if not text:
            return []

        # Find all hashtags
        hashtags = re.findall(r'#([A-Za-z0-9_]+)', text)
        return hashtags

    def clean_text(self, text: str) -> str:
        """Clean text by removing timestamps, special characters, and extra whitespace."""
        if not text:
            return ""

        # Remove timestamps like "5/11/2011 12:00:00 AM"
        text = re.sub(r'\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M', '', text)

        # Remove special characters like ¶ and ●
        text = re.sub(r'[¶●]', '', text)

        # Remove "X notes" pattern
        text = re.sub(r'\d+\s+notes?', '', text)

        # Remove hashtags (we'll handle them separately)
        text = re.sub(r'#[A-Za-z0-9_]+', '', text)

        # Clean up whitespace
        text = ' '.join(text.split())

        return text.strip()

    def generate_summary_from_content(self, record: Dict) -> Optional[str]:
        """Generate a summary based on available record content."""
        title = record.get('title', '').strip()
        raw_text = record.get('raw_text', '').strip()
        platform = record.get('platform', '').strip()
        publication_date = record.get('publication_date', '').strip()

        # Extract hashtags for context
        hashtags = self.extract_hashtags(raw_text)

        # Clean the raw text
        cleaned_text = self.clean_text(raw_text)

        # Build summary based on available information
        summary_parts = []

        # Determine post type
        if 'photo' in title.lower():
            post_type = "Photo post"
        elif hashtags or cleaned_text:
            post_type = "Post"
        else:
            post_type = "Tumblr post"

        # Start with title or generic description
        if title and title != "Studio 20":
            # Use the title as the main description
            if title.startswith("Photos from"):
                summary_parts.append(f"{title}.")
            elif "explainer" in title.lower():
                summary_parts.append(f"{post_type} about {title}.")
            else:
                summary_parts.append(f"{title}.")
        else:
            # Generic Studio 20 post
            if hashtags:
                # Use hashtags to describe the content
                topic = " and ".join(hashtags[:3])  # Use first 3 hashtags
                summary_parts.append(f"Studio 20 {post_type.lower()} about {topic}.")
            else:
                summary_parts.append(f"Studio 20 {post_type.lower()}.")

        # Add hashtag context if available and not already used
        if hashtags and len(summary_parts) == 1 and "about" not in summary_parts[0]:
            tag_text = ", ".join(hashtags[:5])
            summary_parts.append(f"Tagged with: {tag_text}.")

        # Add temporal context
        if publication_date:
            try:
                # Parse the date and extract year
                year = publication_date.split('-')[0]
                summary_parts.append(f"Published in {year}.")
            except Exception as e:
                print(f"  Could not parse publication date '{publication_date}': {e}")

        # Add platform attribution
        if platform == "tumblr":
            summary_parts.append("Shared on the Studio 20 Tumblr blog.")

        # Combine parts
        summary = " ".join(summary_parts)

        # Ensure summary is not too long (150 words max)
        words = summary.split()
        if len(words) > 150:
            summary = " ".join(words[:150]) + "..."

        return summary if summary else None

    def find_missing_summaries(self) -> List[Dict]:
        """Find all records with empty summary fields."""
        missing = []
        for record in self.records:
            if not record.get('summary', '').strip():
                missing.append(record)
        return missing

    def generate_summaries(self) -> None:
        """Generate summaries for all records missing them."""
        missing = self.find_missing_summaries()

        print(f"\nFound {len(missing)} records missing summaries")
        print("\nGenerating summaries...\n")

        for record in missing:
            record_id = record.get('id', 'UNKNOWN')
            title = record.get('title', 'Untitled')

            # Generate summary
            summary = self.generate_summary_from_content(record)

            if summary:
                # Update the record
                record['summary'] = summary

                # Track the update
                self.updates.append({
                    'id': record_id,
                    'title': title,
                    'old_summary': '',
                    'new_summary': summary
                })

                print(f"✓ {record_id}: {title[:50]}")
                print(f"  Summary: {summary[:100]}...")
                print()
            else:
                print(f"✗ {record_id}: Could not generate summary")
                print()

    def save_updated_csv(self) -> None:
        """Save the updated records back to CSV."""
        if not self.updates:
            print("No updates to save.")
            return

        # Create backup
        backup_path = self.csv_path.with_suffix('.csv.backup')
        import shutil
        shutil.copy2(self.csv_path, backup_path)
        print(f"\n✓ Created backup at {backup_path}")

        # Write updated records
        with open(self.csv_path, 'w', encoding='utf-8', newline='') as f:
            if self.records:
                writer = csv.DictWriter(f, fieldnames=self.records[0].keys())
                writer.writeheader()
                writer.writerows(self.records)

        print(f"✓ Updated {len(self.updates)} records in {self.csv_path}")

    def generate_report(self) -> str:
        """Generate a detailed report of all updates."""
        if not self.updates:
            return "No summaries were generated."

        report_lines = [
            "=" * 80,
            "SUMMARY GENERATION REPORT",
            "=" * 80,
            f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"Total records processed: {len(self.records)}",
            f"Records updated: {len(self.updates)}",
            "",
            "UPDATES:",
            "=" * 80,
            ""
        ]

        for update in self.updates:
            report_lines.extend([
                f"ID: {update['id']}",
                f"Title: {update['title']}",
                f"New Summary: {update['new_summary']}",
                "-" * 80,
                ""
            ])

        report_lines.extend([
            "=" * 80,
            "SUMMARY",
            "=" * 80,
            f"✓ Successfully generated {len(self.updates)} summaries",
            "✓ CSV backup created",
            "✓ CSV updated with new summaries",
            ""
        ])

        return "\n".join(report_lines)

    def save_report(self, report: str) -> None:
        """Save the report to a file."""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        report_path = self.csv_path.parent / f"summary_generation_report_{timestamp}.txt"

        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(report)

        print(f"\n✓ Report saved to {report_path}")

    def run(self, dry_run: bool = False) -> None:
        """Run the complete summary generation process."""
        print("=" * 80)
        print("ARCHIVE SUMMARY GENERATOR")
        print("=" * 80)
        print()

        # Load records
        self.load_records()

        # Generate summaries
        self.generate_summaries()

        # Generate report
        report = self.generate_report()
        print(report)

        # Save changes (unless dry run)
        if dry_run:
            print("\n⚠ DRY RUN MODE - No changes saved")
            print("Run without --dry-run to apply changes")
        else:
            self.save_updated_csv()
            self.save_report(report)
            print("\n✓ All changes saved successfully")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate summaries for archive records missing them"
    )
    parser.add_argument(
        '--csv',
        default='data/archive_records-public.csv',
        help='Path to the archive CSV file (default: data/archive_records-public.csv)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without saving (default: False)'
    )

    args = parser.parse_args()

    # Determine CSV path (relative to repo root)
    repo_root = Path(__file__).parent.parent.parent
    csv_path = repo_root / args.csv

    if not csv_path.exists():
        print(f"Error: CSV file not found at {csv_path}")
        return 1

    # Run the generator
    generator = SummaryGenerator(str(csv_path))
    generator.run(dry_run=args.dry_run)

    return 0


if __name__ == '__main__':
    exit(main())
