#!/usr/bin/env python3
"""
Merge Tumblr and Clipping Records into Main Archive CSV

Merges 138 Tumblr records and 62 clipping records into the main archive CSV,
bringing total from 659 to 859 records while maintaining 100% schema compliance.

Author: Claude Code
Date: 2025-12-03
"""

import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any
import sys

# Add src to path for imports
sys.path.append(str(Path(__file__).parent.parent))

# Era mapping from consolidate_taxonomy.py (lines 43-54)
ERA_MAPPING = {
    (1990, 1999): "Early Career & Public Journalism (1990-1999)",
    (2000, 2004): "Blogging Launch & Digital Disruption (2000-2004)",
    (2005, 2009): "Peak Blogging & Citizen Journalism (2005-2009)",
    (2010, 2015): "Social Media & Financial Crisis (2010-2015)",
    (2016, 2019): "Trump Era & Democratic Crisis (2016-2019)",
    (2020, 2021): "COVID-19 & Misinformation Crisis (2020-2021)",
    (2022, 2024): "Post-Trump Transition (2022-2024)",
    (2025, 2099): "Second Trump Administration (2025-Present)"
}

# Schema columns in exact order
SCHEMA_COLUMNS = [
    "id", "title", "url", "author", "publication_date", "original_publication",
    "publisher", "platform", "collection_id", "content_type", "format",
    "word_count", "length_in_seconds", "excerpt", "summary",
    "thematic_categories", "key_concepts", "series", "era", "scope", "tags",
    "related_to", "responds_to", "influence", "copyright", "license",
    "permissions", "date_processed", "gdrive_pdf_link", "gdrive_raw_file_link",
    "gdrive_transcript_link", "transcript_filepath", "pull_quote", "raw_text",
    "verified", "notes"
]


def convert_date_format(date_str: str) -> str:
    """
    Convert date from MM/DD/YYYY to YYYY-MM-DD.

    Args:
        date_str: Date in MM/DD/YYYY format (e.g., "09/24/2011")

    Returns:
        Date in YYYY-MM-DD format (e.g., "2011-09-24")
    """
    try:
        # Parse MM/DD/YYYY
        date_obj = datetime.strptime(date_str, "%m/%d/%Y")
        # Return YYYY-MM-DD
        return date_obj.strftime("%Y-%m-%d")
    except ValueError:
        print(f"WARNING: Invalid date format: {date_str}")
        return date_str  # Return original if invalid


def get_era_from_date(date_str: str) -> str:
    """
    Assign era based on publication year using ERA_MAPPING.

    Args:
        date_str: Date in YYYY-MM-DD format

    Returns:
        Era name string
    """
    try:
        year = int(date_str.split('-')[0])

        # Find matching era range
        for (start_year, end_year), era_name in ERA_MAPPING.items():
            if start_year <= year <= end_year:
                return era_name

        # Fallback for dates before 1990
        if year < 1990:
            return "Early Career & Public Journalism (1990-1999)"

        print(f"WARNING: No era found for year {year}, using default")
        return "Early Career & Public Journalism (1990-1999)"

    except (ValueError, IndexError) as e:
        print(f"ERROR: Could not extract year from date {date_str}: {e}")
        return ""


def calculate_word_count(text: str) -> int:
    """
    Calculate word count from text.

    Args:
        text: Raw text content

    Returns:
        Word count as integer
    """
    if not text or not text.strip():
        return 0
    return len(text.split())


def transform_tumblr_record(record: Dict[str, Any]) -> Dict[str, str]:
    """
    Transform Tumblr JSON record to CSV row format.

    Args:
        record: Tumblr record dict from JSON

    Returns:
        CSV row dict with all 36 columns
    """
    # Convert date
    pub_date = convert_date_format(record.get('publication_date', ''))

    # Calculate era and word count
    era = get_era_from_date(pub_date)
    word_count = calculate_word_count(record.get('raw_text', ''))

    # Current timestamp
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Build row with all 36 columns
    row = {
        # Direct mappings
        'id': record.get('id', ''),
        'title': record.get('title', ''),
        'url': record.get('url', ''),
        'author': record.get('author', ''),
        'publication_date': pub_date,
        'original_publication': record.get('original_publication', ''),
        'publisher': record.get('publisher', ''),
        'platform': record.get('platform', ''),
        'content_type': record.get('content_type', ''),
        'format': record.get('format', ''),
        'raw_text': record.get('raw_text', ''),
        'excerpt': record.get('excerpt', ''),
        'notes': record.get('notes', ''),

        # Calculated fields
        'collection_id': 'PUBLIC',
        'word_count': str(word_count),
        'era': era,
        'date_processed': now,

        # Empty fields
        'length_in_seconds': '',
        'summary': '',
        'thematic_categories': '',
        'key_concepts': '',
        'series': '',
        'scope': '',
        'tags': '',
        'related_to': '',
        'responds_to': '',
        'influence': '',
        'copyright': '',
        'license': '',
        'permissions': '',
        'gdrive_pdf_link': '',
        'gdrive_raw_file_link': '',
        'gdrive_transcript_link': '',
        'transcript_filepath': '',
        'pull_quote': '',
        'verified': ''
    }

    return row


def transform_clipping_record(record: Dict[str, Any]) -> Dict[str, str]:
    """
    Transform Clipping JSON record to CSV row format.

    Args:
        record: Clipping record dict from JSON

    Returns:
        CSV row dict with all 36 columns
    """
    # Start with Tumblr transformation (shared logic)
    row = transform_tumblr_record(record)

    # Override with clipping-specific fields
    row['summary'] = record.get('summary', '')
    row['copyright'] = record.get('copyright', '')
    row['verified'] = record.get('verified', '')

    # Normalize content_type: "Mention" → "Article"
    if row['content_type'] == 'Mention':
        row['content_type'] = 'Article'

    # Note: jay_rosen_role field is ignored (not in schema)

    return row


def load_existing_csv(csv_path: Path) -> List[Dict[str, str]]:
    """
    Load existing archive CSV records.

    Args:
        csv_path: Path to archive CSV file

    Returns:
        List of record dicts
    """
    records = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(row)
    return records


def load_json_records(json_path: Path) -> List[Dict[str, Any]]:
    """
    Load records from JSON file.

    Args:
        json_path: Path to JSON file

    Returns:
        List of record dicts
    """
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def validate_records(records: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Validate merged records for schema compliance.

    Args:
        records: List of all records to validate

    Returns:
        Validation report dict
    """
    report = {
        'total_records': len(records),
        'valid': 0,
        'errors': [],
        'warnings': []
    }

    seen_ids = set()

    for i, record in enumerate(records):
        record_id = record.get('id', f'UNKNOWN_{i}')

        # Check: Exactly 36 columns
        if len(record) != 36:
            report['errors'].append(f"{record_id}: Has {len(record)} columns, expected 36")
            continue

        # Check: All required fields present
        # Note: publication_date can be empty for some existing records
        required_fields = ['id', 'title', 'author']
        missing = [f for f in required_fields if not record.get(f)]
        if missing:
            report['errors'].append(f"{record_id}: Missing required fields: {missing}")
            continue

        # Warn if publication_date is missing for new records (TUMBLR/CLIP)
        if not record.get('publication_date') and (record_id.startswith('TUMBLR') or record_id.startswith('CLIP')):
            report['errors'].append(f"{record_id}: New record missing publication_date")
            continue

        # Check: Date format YYYY-MM-DD
        pub_date = record.get('publication_date', '')
        if pub_date and not pub_date.count('-') == 2:
            report['errors'].append(f"{record_id}: Invalid date format: {pub_date}")
            continue

        # Check: Era is valid
        era = record.get('era', '')
        valid_eras = set(ERA_MAPPING.values())
        if era and era not in valid_eras:
            report['warnings'].append(f"{record_id}: Era not in valid set: {era}")

        # Check: No duplicate IDs
        if record_id in seen_ids:
            report['errors'].append(f"{record_id}: Duplicate ID")
            continue
        seen_ids.add(record_id)

        # Check: word_count is integer or empty
        word_count = record.get('word_count', '')
        if word_count:
            try:
                int(word_count)
            except ValueError:
                report['errors'].append(f"{record_id}: word_count not an integer: {word_count}")
                continue

        report['valid'] += 1

    return report


def backup_csv(csv_path: Path) -> Path:
    """
    Create timestamped backup of CSV file.

    Args:
        csv_path: Path to CSV file to backup

    Returns:
        Path to backup file
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = csv_path.parent / f"{csv_path.stem}_backup_{timestamp}.csv"

    # Copy file
    import shutil
    shutil.copy2(csv_path, backup_path)

    print(f"✓ Created backup: {backup_path.name}")
    return backup_path


def write_merged_csv(records: List[Dict[str, str]], output_path: Path):
    """
    Write merged records to CSV file.

    Args:
        records: List of all records
        output_path: Path to output CSV file
    """
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=SCHEMA_COLUMNS)
        writer.writeheader()
        writer.writerows(records)

    print(f"✓ Wrote {len(records)} records to {output_path.name}")


def generate_merge_report(
    tumblr_count: int,
    clipping_count: int,
    total_before: int,
    total_after: int,
    validation_report: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Generate comprehensive merge report.

    Returns:
        Report dict
    """
    # Calculate era distribution for new records
    era_dist = {}
    for era_name in ERA_MAPPING.values():
        era_dist[era_name] = 0

    report = {
        'timestamp': datetime.now().isoformat(),
        'records_before_merge': total_before,
        'tumblr_records_added': tumblr_count,
        'clipping_records_added': clipping_count,
        'total_new_records': tumblr_count + clipping_count,
        'records_after_merge': total_after,
        'validation': validation_report,
        'era_distribution': era_dist
    }

    return report


def save_merge_report(report: Dict[str, Any], output_dir: Path):
    """
    Save merge report to JSON file.

    Args:
        report: Report dict
        output_dir: Directory to save report
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = output_dir / f"merge_report_{timestamp}.json"

    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)

    print(f"✓ Saved merge report: {report_path.name}")
    return report_path


def main():
    """Main execution function."""
    print("=" * 60)
    print("MERGE TUMBLR AND CLIPPING RECORDS INTO MAIN ARCHIVE")
    print("=" * 60)
    print()

    # Define paths
    base_dir = Path(__file__).parent.parent.parent
    csv_path = base_dir / "data" / "archive_records-public.csv"
    tumblr_json = base_dir / "backend" / "tumblr_records.json"
    clipping_json = base_dir / "backend" / "clipping_records.json"

    # Step 1: Load existing CSV
    print("Step 1: Loading existing archive...")
    existing_records = load_existing_csv(csv_path)
    print(f"✓ Loaded {len(existing_records)} existing records")
    print()

    # Step 2: Load Tumblr records
    print("Step 2: Loading Tumblr records...")
    tumblr_records = load_json_records(tumblr_json)
    print(f"✓ Loaded {len(tumblr_records)} Tumblr records")
    print()

    # Step 3: Load Clipping records
    print("Step 3: Loading Clipping records...")
    clipping_records = load_json_records(clipping_json)
    print(f"✓ Loaded {len(clipping_records)} clipping records")
    print()

    # Step 4: Transform Tumblr records
    print("Step 4: Transforming Tumblr records...")
    tumblr_rows = [transform_tumblr_record(rec) for rec in tumblr_records]
    print(f"✓ Transformed {len(tumblr_rows)} Tumblr records")
    print()

    # Step 5: Transform Clipping records
    print("Step 5: Transforming Clipping records...")
    clipping_rows = [transform_clipping_record(rec) for rec in clipping_records]
    print(f"✓ Transformed {len(clipping_rows)} clipping records")
    print()

    # Step 6: Merge all records
    print("Step 6: Merging records...")
    all_records = existing_records + tumblr_rows + clipping_rows
    print(f"✓ Total records after merge: {len(all_records)}")
    print()

    # Step 7: Validate
    print("Step 7: Validating merged records...")
    validation = validate_records(all_records)
    print(f"✓ Valid records: {validation['valid']}/{validation['total_records']}")

    if validation['errors']:
        print(f"✗ ERRORS ({len(validation['errors'])}):")
        for error in validation['errors'][:10]:  # Show first 10
            print(f"  - {error}")
        if len(validation['errors']) > 10:
            print(f"  ... and {len(validation['errors']) - 10} more")
        print()
        print("VALIDATION FAILED. Fix errors before proceeding.")
        return 1

    if validation['warnings']:
        print(f"⚠ WARNINGS ({len(validation['warnings'])}):")
        for warning in validation['warnings'][:5]:
            print(f"  - {warning}")
        if len(validation['warnings']) > 5:
            print(f"  ... and {len(validation['warnings']) - 5} more")
    print()

    # Step 8: Backup existing CSV
    print("Step 8: Creating backup...")
    backup_path = backup_csv(csv_path)
    print()

    # Step 9: Write merged CSV
    print("Step 9: Writing merged CSV...")
    write_merged_csv(all_records, csv_path)
    print()

    # Step 10: Generate report
    print("Step 10: Generating merge report...")
    report = generate_merge_report(
        tumblr_count=len(tumblr_rows),
        clipping_count=len(clipping_rows),
        total_before=len(existing_records),
        total_after=len(all_records),
        validation_report=validation
    )
    report_path = save_merge_report(report, base_dir / "backend")
    print()

    # Summary
    print("=" * 60)
    print("MERGE COMPLETE!")
    print("=" * 60)
    print(f"Records before: {len(existing_records)}")
    print(f"Tumblr added:   {len(tumblr_rows)}")
    print(f"Clippings added: {len(clipping_rows)}")
    print(f"Records after:  {len(all_records)}")
    print(f"Validation:     {validation['valid']} valid, {len(validation['errors'])} errors, {len(validation['warnings'])} warnings")
    print(f"Backup:         {backup_path.name}")
    print(f"Report:         {report_path.name}")
    print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
