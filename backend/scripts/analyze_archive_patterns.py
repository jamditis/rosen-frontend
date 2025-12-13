#!/usr/bin/env python3
"""
Analyze archive data for patterns, dependencies, and quality issues using desbordante.

This script uses data profiling to discover:
- Functional dependencies (e.g., "author always determines publisher")
- Data quality issues (missing values, inconsistencies)
- Hidden patterns in the archive
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import desbordante
import pandas as pd
from datetime import datetime


def analyze_functional_dependencies(csv_path: str):
    """Discover functional dependencies in the archive data."""
    print("=" * 80)
    print("FUNCTIONAL DEPENDENCY ANALYSIS")
    print("=" * 80)
    print(f"\nAnalyzing: {csv_path}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Load data to check what we're working with
    df = pd.read_csv(csv_path)
    print(f"Total records: {len(df)}")
    print(f"Total columns: {len(df.columns)}")
    print(f"\nColumns: {', '.join(df.columns.tolist())}\n")

    # Run FD algorithm
    print("Running Functional Dependency discovery...")
    print("This may take a few minutes for 869 records...\n")

    algo = desbordante.fd.algorithms.Default()
    algo.load_data(table=(csv_path, ',', True))  # CSV path, separator, has_header
    algo.execute()

    fds = algo.get_fds()

    print(f"Found {len(fds)} functional dependencies:\n")

    # Group by complexity for readability
    simple_fds = []
    complex_fds = []

    for fd in fds:
        if len(fd.lhs_indices) == 1:
            simple_fds.append(fd)
        else:
            complex_fds.append(fd)

    # Print simple dependencies (single column → single column)
    if simple_fds:
        print(f"Simple Dependencies ({len(simple_fds)}):")
        print("-" * 60)
        for fd in simple_fds[:20]:  # Limit to first 20
            lhs_col = df.columns[fd.lhs_indices[0]]
            rhs_col = df.columns[fd.rhs_index]
            print(f"  {lhs_col} → {rhs_col}")
        if len(simple_fds) > 20:
            print(f"  ... and {len(simple_fds) - 20} more")
        print()

    # Print complex dependencies (multiple columns → single column)
    if complex_fds:
        print(f"Complex Dependencies ({len(complex_fds)}):")
        print("-" * 60)
        for fd in complex_fds[:10]:  # Limit to first 10
            lhs_cols = [df.columns[i] for i in fd.lhs_indices]
            rhs_col = df.columns[fd.rhs_index]
            print(f"  [{', '.join(lhs_cols)}] → {rhs_col}")
        if len(complex_fds) > 10:
            print(f"  ... and {len(complex_fds) - 10} more")
        print()

    return fds


def analyze_data_quality(csv_path: str):
    """Analyze data quality metrics."""
    print("=" * 80)
    print("DATA QUALITY ANALYSIS")
    print("=" * 80)
    print()

    df = pd.read_csv(csv_path)

    # Missing values analysis
    print("Missing Values by Column:")
    print("-" * 60)
    missing = df.isnull().sum()
    missing_pct = (missing / len(df) * 100).round(2)

    # Show only columns with missing values
    for col in df.columns:
        if missing[col] > 0:
            print(f"  {col:30s}: {missing[col]:4d} ({missing_pct[col]:5.1f}%)")

    print()

    # Key fields analysis
    print("Key Fields Completeness:")
    print("-" * 60)
    key_fields = ['title', 'author', 'publication_date', 'summary',
                  'thematic_categories', 'key_concepts', 'content_type']

    for field in key_fields:
        if field in df.columns:
            filled = df[field].notna().sum()
            pct = (filled / len(df) * 100).round(2)
            status = "✓" if pct > 95 else "⚠️" if pct > 80 else "✗"
            print(f"  {status} {field:30s}: {filled:4d}/{len(df)} ({pct:5.1f}%)")

    print()

    # Content type distribution
    print("Content Type Distribution:")
    print("-" * 60)
    if 'content_type' in df.columns:
        for ctype, count in df['content_type'].value_counts().items():
            pct = round(count / len(df) * 100, 2)
            print(f"  {ctype:20s}: {count:4d} ({pct:5.1f}%)")

    print()

    # Era distribution
    print("Era Distribution:")
    print("-" * 60)
    if 'era' in df.columns:
        for era, count in df['era'].value_counts().items():
            pct = round(count / len(df) * 100, 2)
            print(f"  {era:45s}: {count:4d} ({pct:5.1f}%)")

    print()


def suggest_improvements(csv_path: str):
    """Suggest data quality improvements based on analysis."""
    print("=" * 80)
    print("SUGGESTED IMPROVEMENTS")
    print("=" * 80)
    print()

    df = pd.read_csv(csv_path)

    suggestions = []

    # Check summary field
    if 'summary' in df.columns:
        missing_summary = df['summary'].isna().sum()
        if missing_summary > 0:
            suggestions.append(
                f"📝 {missing_summary} records missing summaries - "
                f"use sumy library to auto-generate"
            )

        # Check for short summaries
        short_summaries = df[df['summary'].notna() & (df['summary'].str.len() < 100)].shape[0]
        if short_summaries > 0:
            suggestions.append(
                f"📝 {short_summaries} records have short summaries (<100 chars) - "
                f"consider regenerating with sumy"
            )

    # Check key_concepts field
    if 'key_concepts' in df.columns:
        missing_concepts = df['key_concepts'].isna().sum()
        if missing_concepts > 0:
            suggestions.append(
                f"🔑 {missing_concepts} records missing key_concepts - "
                f"run entity extraction"
            )

    # Check thematic_categories
    if 'thematic_categories' in df.columns:
        missing_cats = df['thematic_categories'].isna().sum()
        if missing_cats > 0:
            suggestions.append(
                f"📂 {missing_cats} records missing thematic_categories - "
                f"run categorization"
            )

    # Check for records without publication_date
    if 'publication_date' in df.columns:
        missing_dates = df['publication_date'].isna().sum()
        if missing_dates > 0:
            suggestions.append(
                f"📅 {missing_dates} records missing publication_date - "
                f"manual review needed"
            )

    if suggestions:
        for i, suggestion in enumerate(suggestions, 1):
            print(f"{i}. {suggestion}")
    else:
        print("✓ No immediate data quality issues found!")

    print()


def main():
    csv_path = "/home/user/rosen-frontend/data/archive_records-public.csv"

    print("\n" + "=" * 80)
    print("JAY ROSEN ARCHIVE - DATA PROFILING ANALYSIS")
    print("Using desbordante library for pattern discovery")
    print("=" * 80)
    print()

    try:
        # Run analyses
        analyze_data_quality(csv_path)
        suggest_improvements(csv_path)
        analyze_functional_dependencies(csv_path)

        print("=" * 80)
        print("ANALYSIS COMPLETE")
        print("=" * 80)
        print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print()

    except Exception as e:
        print(f"\n❌ Error during analysis: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    exit(main())
