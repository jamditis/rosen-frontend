#!/usr/bin/env python3
"""
Backfill missing or short summaries using the sumy library.

This script:
1. Identifies records with missing or short summaries
2. Uses existing raw_text or fetches content from URLs
3. Generates summaries using LSA (Latent Semantic Analysis) algorithm
4. Updates the CSV with new summaries

Usage:
    python backfill_summaries_sumy.py [--dry-run] [--min-length 100] [--sentences 3]
"""

import sys
from pathlib import Path
import argparse
import csv
from typing import Optional
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lsa import LsaSummarizer
from sumy.summarizers.lex_rank import LexRankSummarizer
from sumy.summarizers.text_rank import TextRankSummarizer
import nltk

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    print("Downloading NLTK punkt tokenizer...")
    nltk.download('punkt')

try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    print("Downloading NLTK punkt_tab tokenizer...")
    nltk.download('punkt_tab')


class SummaryGenerator:
    """Generate summaries using sumy library."""

    def __init__(self, algorithm: str = 'lsa', sentences: int = 3):
        """
        Initialize summarizer.

        Args:
            algorithm: Summarization algorithm ('lsa', 'lexrank', 'textrank')
            sentences: Number of sentences in summary
        """
        self.sentences = sentences
        self.tokenizer = Tokenizer("english")

        # Choose algorithm
        if algorithm == 'lsa':
            self.summarizer = LsaSummarizer()
        elif algorithm == 'lexrank':
            self.summarizer = LexRankSummarizer()
        elif algorithm == 'textrank':
            self.summarizer = TextRankSummarizer()
        else:
            raise ValueError(f"Unknown algorithm: {algorithm}")

        print(f"Initialized {algorithm.upper()} summarizer ({sentences} sentences)")

    def generate_summary(self, text: str) -> Optional[str]:
        """
        Generate summary from text.

        Args:
            text: Full text to summarize

        Returns:
            Summary string or None if failed
        """
        if not text or len(text.strip()) < 100:
            return None

        try:
            # Parse text
            parser = PlaintextParser.from_string(text, self.tokenizer)

            # Generate summary
            summary_sentences = self.summarizer(parser.document, self.sentences)

            # Convert to string
            summary = ' '.join([str(sentence) for sentence in summary_sentences])

            return summary.strip()

        except Exception as e:
            print(f"  ⚠️  Error generating summary: {e}")
            return None


def identify_records_needing_summaries(
    df: pd.DataFrame,
    min_length: int = 100
) -> pd.DataFrame:
    """
    Identify records with missing or short summaries.

    Args:
        df: DataFrame with archive records
        min_length: Minimum summary length in characters

    Returns:
        DataFrame with records needing summaries
    """
    # Missing summaries
    missing = df['summary'].isna()

    # Short summaries
    short = df['summary'].notna() & (df['summary'].str.len() < min_length)

    # Combine
    needs_summary = df[missing | short].copy()

    return needs_summary


def backfill_summaries(
    csv_path: str,
    output_path: Optional[str] = None,
    dry_run: bool = False,
    min_length: int = 100,
    sentences: int = 3,
    algorithm: str = 'lsa',
    limit: Optional[int] = None
):
    """
    Backfill summaries for records.

    Args:
        csv_path: Path to archive CSV
        output_path: Output path (defaults to input path)
        dry_run: If True, don't write changes
        min_length: Minimum summary length
        sentences: Number of sentences in summary
        algorithm: Summarization algorithm
        limit: Max number of records to process (for testing)
    """
    print("=" * 80)
    print("SUMMARY BACKFILL SCRIPT")
    print(f"Using sumy library with {algorithm.upper()} algorithm")
    print("=" * 80)
    print()

    # Load data
    print(f"Loading: {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"Total records: {len(df)}\n")

    # Identify records needing summaries
    needs_summary = identify_records_needing_summaries(df, min_length)

    print(f"Records needing summaries: {len(needs_summary)}")
    print(f"  - Missing summary: {needs_summary['summary'].isna().sum()}")
    print(f"  - Short summary (<{min_length} chars): "
          f"{needs_summary['summary'].notna().sum()}\n")

    if len(needs_summary) == 0:
        print("✓ All records have adequate summaries!")
        return

    # Apply limit if specified
    if limit:
        needs_summary = needs_summary.head(limit)
        print(f"Processing first {limit} records (--limit flag)\n")

    # Initialize summarizer
    generator = SummaryGenerator(algorithm=algorithm, sentences=sentences)

    # Process records
    print("Processing records:")
    print("-" * 80)

    updated_count = 0
    skipped_count = 0

    for idx, row in needs_summary.iterrows():
        record_id = row['id']
        title = row['title'][:50] + "..." if len(row['title']) > 50 else row['title']

        print(f"\n[{updated_count + skipped_count + 1}/{len(needs_summary)}] {record_id}")
        print(f"  Title: {title}")

        # Get text content
        text_source = None
        text = None

        # Try raw_text field first
        if pd.notna(row.get('raw_text')):
            text = row['raw_text']
            text_source = 'raw_text'

        # Try excerpt if no raw_text
        elif pd.notna(row.get('excerpt')):
            text = row['excerpt']
            text_source = 'excerpt'

        if not text:
            print("  ⚠️  No text available - skipping")
            skipped_count += 1
            continue

        print(f"  Source: {text_source} ({len(text)} chars)")

        # Generate summary
        summary = generator.generate_summary(text)

        if summary:
            print(f"  ✓ Generated summary ({len(summary)} chars)")
            print(f"    Preview: {summary[:100]}...")

            # Update dataframe
            df.at[idx, 'summary'] = summary
            updated_count += 1
        else:
            print("  ⚠️  Failed to generate summary")
            skipped_count += 1

    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Records processed: {len(needs_summary)}")
    print(f"Summaries generated: {updated_count}")
    print(f"Skipped: {skipped_count}")
    print()

    # Save results
    if not dry_run and updated_count > 0:
        output_path = output_path or csv_path
        backup_path = csv_path.replace('.csv', f'_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv')

        print(f"Creating backup: {backup_path}")
        df_original = pd.read_csv(csv_path)
        df_original.to_csv(backup_path, index=False)

        print(f"Writing updated data: {output_path}")
        df.to_csv(output_path, index=False, quoting=csv.QUOTE_ALL)

        print("\n✓ Backfill complete!")
    elif dry_run:
        print("DRY RUN - No changes written")
    else:
        print("No updates to write")

    print()


def main():
    parser = argparse.ArgumentParser(
        description="Backfill missing summaries using sumy library"
    )
    parser.add_argument(
        '--csv',
        default='/home/user/rosen-frontend/data/archive_records-public.csv',
        help='Path to archive CSV'
    )
    parser.add_argument(
        '--output',
        help='Output path (defaults to input path)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without writing'
    )
    parser.add_argument(
        '--min-length',
        type=int,
        default=100,
        help='Minimum summary length in characters (default: 100)'
    )
    parser.add_argument(
        '--sentences',
        type=int,
        default=3,
        help='Number of sentences in summary (default: 3)'
    )
    parser.add_argument(
        '--algorithm',
        choices=['lsa', 'lexrank', 'textrank'],
        default='lsa',
        help='Summarization algorithm (default: lsa)'
    )
    parser.add_argument(
        '--limit',
        type=int,
        help='Process only first N records (for testing)'
    )

    args = parser.parse_args()

    backfill_summaries(
        csv_path=args.csv,
        output_path=args.output,
        dry_run=args.dry_run,
        min_length=args.min_length,
        sentences=args.sentences,
        algorithm=args.algorithm,
        limit=args.limit
    )


if __name__ == "__main__":
    main()
