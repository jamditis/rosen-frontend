# -*- coding: utf-8 -*-
"""
Data Format Converter for Rosen Archive

Converts legacy CSV string formats to structured JSON arrays for better
frontend integration and data processing. Handles migration of existing
data while maintaining backward compatibility.
"""

import re
import json
import gspread
import os
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional, Union
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

from src.logger import get_logger

load_dotenv()

class DataFormatConverter:
    """
    Handles conversion between CSV string formats and JSON array formats
    for various data fields in the Rosen Archive.
    """

    def __init__(self):
        """Initialize the format converter."""
        self.logger = get_logger()

        # Fields that should be converted from CSV strings to JSON arrays
        self.array_fields = {
            'thematic_categories',
            'key_concepts',
            'tags',
            'mentioned_entities',
            'mentioned_locations',
            'mentioned_organizations',
            'series',
            'scope'
        }

        # Fields that should be converted to structured relationship objects
        self.relationship_fields = {
            'related_to',
            'responds_to',
            'influence'
        }

        # Entity type mappings for mentioned_entities
        self.entity_type_mappings = {
            # Publications
            'new york times': 'publication',
            'washington post': 'publication',
            'wall street journal': 'publication',
            'cnn': 'publication',
            'fox news': 'publication',
            'msnbc': 'publication',
            'npr': 'publication',

            # Tech platforms
            'twitter': 'platform',
            'facebook': 'platform',
            'instagram': 'platform',
            'youtube': 'platform',
            'google': 'platform',
            'tiktok': 'platform',

            # Government/Organizations
            'congress': 'government',
            'senate': 'government',
            'house': 'government',
            'white house': 'government',
            'supreme court': 'government',

            # Default for unknown
            'default': 'entity'
        }

    def convert_csv_to_array(self, csv_string: str) -> List[str]:
        """
        Convert CSV string to clean array.

        Args:
            csv_string: Comma-separated string

        Returns:
            List of cleaned strings
        """
        if not csv_string or not isinstance(csv_string, str):
            return []

        # Split on commas and semicolons
        items = re.split(r'[,;]', csv_string)

        # Clean and filter items
        cleaned = []
        for item in items:
            item = item.strip()
            if item and item.lower() not in ['none', 'n/a', 'null', '']:
                cleaned.append(item)

        # Remove duplicates while preserving order
        seen = set()
        result = []
        for item in cleaned:
            if item.lower() not in seen:
                seen.add(item.lower())
                result.append(item)

        return result

    def convert_entities_to_structured(self, csv_string: str) -> List[Dict[str, str]]:
        """
        Convert entity CSV string to structured array with types.

        Args:
            csv_string: Comma-separated entity names

        Returns:
            List of entity objects with name and type
        """
        entities = self.convert_csv_to_array(csv_string)
        structured = []

        for entity in entities:
            entity_lower = entity.lower()
            entity_type = self.entity_type_mappings.get(entity_lower, 'entity')

            structured.append({
                'name': entity,
                'type': entity_type
            })

        return structured

    def convert_relationships_to_structured(self, csv_string: str, relationship_type: str = 'related_to') -> List[Dict[str, Any]]:
        """
        Convert relationship CSV string to structured array with metadata.

        Args:
            csv_string: Comma-separated record IDs
            relationship_type: Type of relationship

        Returns:
            List of relationship objects with ID, type, and confidence
        """
        if not csv_string:
            return []

        ids = self.convert_csv_to_array(csv_string)
        structured = []

        for record_id in ids:
            # Basic validation that this looks like a record ID
            if re.match(r'^[A-Z]+-\d+$', record_id):
                structured.append({
                    'id': record_id,
                    'relationship': relationship_type,
                    'confidence': 1.0  # Default confidence, can be updated by analysis
                })

        return structured

    def convert_record_to_json_format(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert a single record from CSV format to JSON format.

        Args:
            record: Record dictionary with CSV-formatted fields

        Returns:
            Record with JSON-formatted fields
        """
        converted = record.copy()

        # Convert simple array fields
        for field in self.array_fields:
            if field in converted:
                if field == 'mentioned_entities':
                    converted[field] = self.convert_entities_to_structured(converted[field])
                else:
                    converted[field] = self.convert_csv_to_array(converted[field])

        # Convert relationship fields
        for field in self.relationship_fields:
            if field in converted:
                converted[field] = self.convert_relationships_to_structured(
                    converted[field], field
                )

        return converted

    def convert_batch_records(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Convert a batch of records from CSV to JSON format.

        Args:
            records: List of records to convert

        Returns:
            List of converted records
        """
        converted_records = []

        for i, record in enumerate(records):
            try:
                converted = self.convert_record_to_json_format(record)
                converted_records.append(converted)

                if (i + 1) % 100 == 0:
                    self.logger.logger.info(f"Converted {i + 1}/{len(records)} records")

            except Exception as e:
                self.logger.log_error("format_conversion", f"Error converting record: {e}",
                                    record_id=record.get('id', f'index_{i}'))
                # Keep original record if conversion fails
                converted_records.append(record)

        return converted_records

    def migrate_google_sheets_format(self, dry_run: bool = True) -> Dict[str, Any]:
        """
        Migrate Google Sheets data from CSV to JSON format.

        Args:
            dry_run: If True, only analyze what would be changed

        Returns:
            Migration report with statistics and results
        """
        self.logger.logger.info(f"Starting format migration {'(DRY RUN)' if dry_run else '(LIVE RUN)'}")

        try:
            # Connect to Google Sheets
            credentials_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
            )
            gc = gspread.service_account(filename=credentials_path)
            sh = gc.open(os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List"))
            worksheet = sh.worksheet("test_runs")

            # Get all current data
            all_records = worksheet.get_all_records()
            self.logger.logger.info(f"Found {len(all_records)} records to analyze")

            # Analyze current format usage
            format_analysis = self._analyze_current_formats(all_records)

            if dry_run:
                # Convert sample records for analysis
                sample_size = min(10, len(all_records))
                sample_records = all_records[:sample_size]
                converted_sample = self.convert_batch_records(sample_records)

                report = {
                    'dry_run': True,
                    'total_records': len(all_records),
                    'analyzed_sample': sample_size,
                    'format_analysis': format_analysis,
                    'conversion_preview': {
                        'original_sample': sample_records[:3],  # Show first 3
                        'converted_sample': converted_sample[:3]
                    },
                    'migration_plan': self._create_migration_plan(format_analysis)
                }
            else:
                # Perform actual migration
                converted_records = self.convert_batch_records(all_records)

                # Update Google Sheets (This would require more complex implementation)
                # For now, save to JSON file for review
                json_output_path = 'migrated_data.json'
                with open(json_output_path, 'w', encoding='utf-8') as f:
                    json.dump(converted_records, f, indent=2, ensure_ascii=False)

                report = {
                    'dry_run': False,
                    'total_records': len(all_records),
                    'converted_records': len(converted_records),
                    'format_analysis': format_analysis,
                    'output_file': json_output_path,
                    'migration_completed': True
                }

            return report

        except Exception as e:
            self.logger.log_error("migration_error", f"Error during format migration: {e}")
            return {'error': str(e)}

    def _analyze_current_formats(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyze current format usage in the dataset.

        Args:
            records: List of records to analyze

        Returns:
            Analysis report of current format usage
        """
        analysis = {
            'field_usage': {},
            'csv_format_detected': {},
            'needs_conversion': {}
        }

        all_fields = self.array_fields.union(self.relationship_fields)

        for field in all_fields:
            field_values = [record.get(field, '') for record in records if record.get(field)]

            analysis['field_usage'][field] = len(field_values)

            # Detect CSV format (contains commas)
            csv_count = len([v for v in field_values if ',' in str(v)])
            analysis['csv_format_detected'][field] = csv_count

            # Determine if conversion is needed
            analysis['needs_conversion'][field] = csv_count > 0

        return analysis

    def _create_migration_plan(self, format_analysis: Dict[str, Any]) -> List[str]:
        """
        Create a migration plan based on format analysis.

        Args:
            format_analysis: Results from format analysis

        Returns:
            List of migration steps
        """
        plan = []

        for field, needs_conversion in format_analysis['needs_conversion'].items():
            if needs_conversion:
                csv_count = format_analysis['csv_format_detected'][field]
                if field in self.relationship_fields:
                    plan.append(f"Convert {field}: {csv_count} records → structured relationship objects")
                elif field == 'mentioned_entities':
                    plan.append(f"Convert {field}: {csv_count} records → typed entity objects")
                else:
                    plan.append(f"Convert {field}: {csv_count} records → JSON arrays")

        if not plan:
            plan.append("No format conversion needed - data already in correct format")

        return plan

    def create_format_validation_report(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Create a validation report for data format compliance.

        Args:
            records: Records to validate

        Returns:
            Validation report with compliance statistics
        """
        report = {
            'total_records': len(records),
            'json_compliant': 0,
            'csv_format': 0,
            'mixed_format': 0,
            'field_compliance': {}
        }

        all_fields = self.array_fields.union(self.relationship_fields)

        for field in all_fields:
            report['field_compliance'][field] = {
                'total_with_data': 0,
                'json_format': 0,
                'csv_format': 0,
                'compliance_rate': 0.0
            }

        for record in records:
            record_json_fields = 0
            record_csv_fields = 0

            for field in all_fields:
                value = record.get(field)
                if not value:
                    continue

                report['field_compliance'][field]['total_with_data'] += 1

                # Check if value is already JSON format (list or dict)
                if isinstance(value, (list, dict)):
                    report['field_compliance'][field]['json_format'] += 1
                    record_json_fields += 1
                elif isinstance(value, str) and ',' in value:
                    report['field_compliance'][field]['csv_format'] += 1
                    record_csv_fields += 1

            # Categorize record overall format
            if record_json_fields > 0 and record_csv_fields == 0:
                report['json_compliant'] += 1
            elif record_csv_fields > 0 and record_json_fields == 0:
                report['csv_format'] += 1
            elif record_json_fields > 0 and record_csv_fields > 0:
                report['mixed_format'] += 1

        # Calculate compliance rates
        for field in all_fields:
            field_data = report['field_compliance'][field]
            total = field_data['total_with_data']
            if total > 0:
                field_data['compliance_rate'] = field_data['json_format'] / total

        return report

# Global converter instance
_global_converter = None

def get_format_converter() -> DataFormatConverter:
    """Get the global format converter instance."""
    global _global_converter
    if _global_converter is None:
        _global_converter = DataFormatConverter()
    return _global_converter
