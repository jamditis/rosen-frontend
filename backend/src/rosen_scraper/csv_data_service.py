# -*- coding: utf-8 -*-
"""
CSV Data Service

Provides read/write operations for local CSV files, replacing Google Sheets.
This allows the backend pipeline to work entirely offline with manually
exported CSV files.

Usage:
    1. Export Google Sheets tabs to CSV files in the project's csv/ directory
    2. Run the workflow - it reads from CSV and writes results to CSV
    3. Optionally import the output CSV back to Google Sheets
"""

import csv
from pathlib import Path
from typing import Dict, List, Any, Optional, Set
from datetime import datetime
from rosen_scraper.path_utils import find_project_root


class CSVDataService:
    """Service for reading and writing CSV data files."""

    def __init__(self, csv_dir: Optional[Path] = None):
        """
        Initialize the CSV data service.

        Args:
            csv_dir: Path to CSV directory. Defaults to project_root/csv/
        """
        self.project_root = find_project_root()
        self.csv_dir = csv_dir or self.project_root.parent / 'csv'

        # Define file paths
        self.urls_file = self.csv_dir / 'urls_to_scrape.csv'
        self.records_file = self.csv_dir / 'archive_records-public.csv'
        self.social_file = self.csv_dir / 'social_posts.csv'
        self.entities_file = self.csv_dir / 'extracted_entities.csv'
        self.relationships_file = self.csv_dir / 'extracted_relationships.csv'

        # Output directory for new/updated records
        self.output_dir = self.csv_dir / 'output'
        if self.csv_dir.exists():
            self.output_dir.mkdir(exist_ok=True)

    def set_data_dir(self, data_dir: Path):
        """
        Override the default data directory paths.

        This allows using a custom directory structure for imports
        (e.g., data/social_import/ instead of csv/).

        Args:
            data_dir: Path to the data directory containing CSV files
        """
        data_dir = Path(data_dir)
        self.csv_dir = data_dir

        # Update file paths to look in the new directory
        # Support both naming conventions (with and without 'rosen_' prefix)
        self.urls_file = data_dir / 'urls_to_scrape.csv'
        self.records_file = data_dir / 'archive_records-public.csv'

        # Social posts - check both naming conventions
        social_prefixed = data_dir / 'rosen_social_posts.csv'
        social_standard = data_dir / 'social_posts.csv'
        self.social_file = social_prefixed if social_prefixed.exists() else social_standard

        # Entities - check both naming conventions
        entities_prefixed = data_dir / 'rosen_extracted_entities.csv'
        entities_standard = data_dir / 'extracted_entities.csv'
        self.entities_file = entities_prefixed if entities_prefixed.exists() else entities_standard

        # Relationships - check both naming conventions
        relationships_prefixed = data_dir / 'rosen_extracted_relationships.csv'
        relationships_standard = data_dir / 'extracted_relationships.csv'
        self.relationships_file = relationships_prefixed if relationships_prefixed.exists() else relationships_standard

        # Output directory
        self.output_dir = data_dir / 'output'
        self.output_dir.mkdir(exist_ok=True)

        print(f"[CSV SERVICE] Data directory set to: {data_dir}")
        print(f"[CSV SERVICE] Social posts: {self.social_file.name}")
        print(f"[CSV SERVICE] Entities: {self.entities_file.name}")
        print(f"[CSV SERVICE] Relationships: {self.relationships_file.name}")

    def get_urls_to_process(self, start_row: int = 0, end_row: Optional[int] = None,
                            skip_processed: bool = True) -> List[Dict[str, str]]:
        """
        Read URLs from the urls_to_scrape.csv file.

        Args:
            start_row: Starting row index (0-based, after header)
            end_row: Ending row index (None = all remaining)
            skip_processed: If True, skip URLs that have already been processed

        Returns:
            List of dicts with 'id', 'url', 'processed_on', 'notes' keys
        """
        if not self.urls_file.exists():
            print(f"WARNING: URLs file not found: {self.urls_file}")
            return []

        urls = []
        with open(self.urls_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                if i < start_row:
                    continue
                if end_row is not None and i >= end_row:
                    break

                # Skip already processed if requested
                if skip_processed and row.get('processed_on'):
                    continue

                if row.get('url'):
                    urls.append({
                        'id': row.get('id', f'URL{i}'),
                        'url': row['url'].strip(),
                        'processed_on': row.get('processed_on', ''),
                        'notes': row.get('Notes', row.get('notes', ''))
                    })

        return urls

    def get_existing_record_ids(self) -> Set[str]:
        """
        Get all existing record IDs from the archive records file.

        Returns:
            Set of record ID strings
        """
        ids = set()

        for csv_file in [self.records_file, self.social_file]:
            if csv_file.exists():
                with open(csv_file, 'r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        record_id = row.get('id', row.get('ID', ''))
                        if record_id:
                            ids.add(record_id)

        return ids

    def get_existing_urls(self) -> Set[str]:
        """
        Get all URLs that have already been processed.

        Returns:
            Set of URL strings
        """
        urls = set()

        for csv_file in [self.records_file, self.social_file]:
            if csv_file.exists():
                with open(csv_file, 'r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        url = row.get('url', row.get('URL', ''))
                        if url:
                            urls.add(url.strip())

        return urls

    def get_headers(self) -> List[str]:
        """
        Get the column headers from the archive records file.

        Returns:
            List of header strings
        """
        if not self.records_file.exists():
            return []

        with open(self.records_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.reader(f)
            return next(reader, [])

    def append_record(self, record: Dict[str, Any], headers: Optional[List[str]] = None) -> bool:
        """
        Append a new record to the output file.

        Args:
            record: Dictionary of record data
            headers: Column headers (uses existing if not provided)

        Returns:
            True if successful
        """
        output_file = self.output_dir / f'processed_records_{datetime.now().strftime("%Y%m%d")}.csv'

        if headers is None:
            headers = self.get_headers()

        file_exists = output_file.exists()

        try:
            with open(output_file, 'a', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')

                if not file_exists:
                    writer.writeheader()

                writer.writerow(record)
            return True
        except Exception as e:
            print(f"ERROR: Failed to write record: {e}")
            return False

    def update_url_status(self, url: str, status: str, notes: str = '') -> bool:
        """
        Update the processing status of a URL in the urls file.

        Note: This updates an in-memory list that should be written back
        at the end of processing for efficiency.

        Args:
            url: The URL that was processed
            status: SUCCESS or FAILED
            notes: Additional notes about the processing result

        Returns:
            True if successful
        """
        # For efficiency, we'll write to a separate log file
        log_file = self.output_dir / f'processing_log_{datetime.now().strftime("%Y%m%d")}.csv'

        file_exists = log_file.exists()

        try:
            with open(log_file, 'a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)

                if not file_exists:
                    writer.writerow(['url', 'status', 'processed_on', 'notes'])

                writer.writerow([
                    url,
                    status,
                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    notes
                ])
            return True
        except Exception as e:
            print(f"ERROR: Failed to log URL status: {e}")
            return False

    def read_social_posts(self) -> List[Dict[str, str]]:
        """
        Read all social posts from the social posts file.

        Returns:
            List of social post dictionaries
        """
        if not self.social_file.exists():
            return []

        with open(self.social_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            return list(reader)


# Convenience function for getting a service instance
_service_instance = None


def get_csv_service() -> CSVDataService:
    """Get or create the CSV data service singleton."""
    global _service_instance
    if _service_instance is None:
        _service_instance = CSVDataService()
    return _service_instance
