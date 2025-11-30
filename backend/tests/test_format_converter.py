# -*- coding: utf-8 -*-
"""
Test script for the data format converter.
"""

import sys
import os
import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
DIAGNOSTICS_DIR = ROOT_DIR / "tools" / "diagnostics"
for path in (SRC_DIR, DIAGNOSTICS_DIR):
    if str(path) not in sys.path:
        sys.path.append(str(path))

from format_converter import get_format_converter

def test_format_converter():
    """Test the data format conversion system."""
    print("Testing Data Format Converter")
    print("=" * 50)

    converter = get_format_converter()

    # Test sample record with CSV format
    sample_record = {
        'id': 'TEST-00001',
        'title': 'Sample Article',
        'thematic_categories': 'Press & Media Criticism, Journalism Theory & Practice, Technology & Digital Media',
        'key_concepts': 'View from Nowhere, Church of the Savvy, The People Formerly Known as the Audience',
        'tags': 'journalism, media, criticism, analysis',
        'mentioned_entities': 'New York Times, Washington Post, Twitter, Facebook, Congress',
        'related_to': 'NYT-00123, WAPO-00456, CNN-00789',
        'responds_to': 'ANALYSIS-00001',
        'series': 'Digital Journalism Analysis',
        'scope': 'Commentary/Critique, Historical Analysis'
    }

    print("Original record (CSV format):")
    for key, value in sample_record.items():
        if isinstance(value, str) and len(value) > 50:
            print(f"  {key}: {value[:50]}...")
        else:
            print(f"  {key}: {value}")

    print("\nConverting to JSON format...")
    converted_record = converter.convert_record_to_json_format(sample_record)

    print("\nConverted record (JSON format):")
    for key, value in converted_record.items():
        if key in converter.array_fields or key in converter.relationship_fields:
            print(f"  {key}: {json.dumps(value, indent=4)}")
        else:
            print(f"  {key}: {value}")

    # Test individual conversion functions
    print("\n" + "=" * 50)
    print("Testing individual conversion functions:")

    # Test CSV to array
    csv_test = "Press & Media Criticism, Journalism Theory & Practice, Technology & Digital Media"
    array_result = converter.convert_csv_to_array(csv_test)
    print(f"\nCSV to Array:")
    print(f"  Input:  {csv_test}")
    print(f"  Output: {array_result}")

    # Test entity conversion
    entities_test = "New York Times, Twitter, Congress, Unknown Entity"
    entities_result = converter.convert_entities_to_structured(entities_test)
    print(f"\nEntities to Structured:")
    print(f"  Input:  {entities_test}")
    print(f"  Output: {json.dumps(entities_result, indent=2)}")

    # Test relationship conversion
    relations_test = "NYT-00123, WAPO-00456, CNN-00789"
    relations_result = converter.convert_relationships_to_structured(relations_test, "related_to")
    print(f"\nRelationships to Structured:")
    print(f"  Input:  {relations_test}")
    print(f"  Output: {json.dumps(relations_result, indent=2)}")

    # Test validation
    print("\n" + "=" * 50)
    print("Testing format validation:")

    sample_records = [
        sample_record,  # CSV format
        converted_record,  # JSON format
        {  # Mixed format
            'id': 'MIXED-00001',
            'thematic_categories': ['Already JSON'],  # JSON
            'key_concepts': 'Still CSV, format'  # CSV
        }
    ]

    validation_report = converter.create_format_validation_report(sample_records)
    print("\nValidation Report:")
    print(json.dumps(validation_report, indent=2))

    print("\nFormat conversion testing completed!")

if __name__ == "__main__":
    test_format_converter()
