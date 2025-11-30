# -*- coding: utf-8 -*-
"""
Test script for the updated schema with new fields.
"""

import sys
import os
import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

from src.workflow import enrich_data, get_schema
from src.entity_resolver import load_known_entities

def test_updated_schema():
    """Test the updated schema and field population logic."""
    print("Testing Updated Schema with New Fields")
    print("=" * 50)

    # Load schema
    schema_file = ROOT_DIR / 'schema.json'
    schema = get_schema(str(schema_file))
    if not schema:
        print("ERROR: Could not load schema")
        return

    # Load known entities
    known_entities_file = SRC_DIR / 'known_entities.json'
    known_entities = load_known_entities(str(known_entities_file))
    if not known_entities:
        print("ERROR: Could not load known entities")
        return

    print(f"Schema loaded with {len(schema['output_headers'])} fields")
    print("New fields in schema:", [h for h in schema['output_headers'] if h in ['platform', 'collection_id', 'permissions', 'transcript_filepath', 'verified', 'notes']])

    # Test sample data
    test_records = [
        {
            'id': 'TEST-00001',
            'title': 'Press Think Article on Digital Journalism',
            'url': 'https://pressthink.org/2024/01/future-of-journalism',
            'text': 'This is a sample article about the future of journalism in the digital age. It discusses various aspects of media criticism and journalism theory.',
            'thematic_categories': 'Press & Media Criticism, Journalism Theory & Practice',
            'series': 'Digital Journalism Analysis',
            'format': 'text'
        },
        {
            'id': 'NYT-00001',
            'title': 'New York Times Premium Article',
            'url': 'https://www.nytimes.com/2024/01/media-analysis',
            'text': 'Premium content from New York Times about media landscape.',
            'thematic_categories': 'Technology & Digital Media',
            'format': 'text'
        },
        {
            'id': 'VIDEO-00001',
            'title': 'Educational Lecture on Journalism',
            'url': 'https://www.youtube.com/watch?v=example123',
            'text': 'Transcript of educational lecture about journalism practices.',
            'thematic_categories': 'Journalism Education',
            'format': 'video'
        }
    ]

    # Test enrichment for each record
    for i, record in enumerate(test_records):
        print(f"\n--- Testing Record {i+1}: {record['id']} ---")
        print(f"URL: {record['url']}")

        # Test the enrichment function
        enriched = enrich_data(record.copy(), record['url'], known_entities)

        # Show the new fields
        new_fields = ['platform', 'collection_id', 'permissions', 'verified', 'notes']
        print("New field values:")
        for field in new_fields:
            value = enriched.get(field, 'NOT SET')
            print(f"  {field}: {value}")

    # Test schema compliance
    print(f"\n--- Schema Compliance Test ---")
    sample_record = test_records[0]
    enriched_sample = enrich_data(sample_record.copy(), sample_record['url'], known_entities)

    missing_fields = []
    for header in schema['output_headers']:
        if header not in enriched_sample:
            missing_fields.append(header)

    if missing_fields:
        print(f"WARNING: Missing fields in enriched record: {missing_fields}")
    else:
        print("✓ All schema fields present in enriched record")

    # Show final enriched record structure
    print(f"\n--- Sample Enriched Record (First 10 fields) ---")
    for i, header in enumerate(schema['output_headers'][:10]):
        value = enriched_sample.get(header, '')
        if isinstance(value, str) and len(value) > 50:
            value = value[:50] + "..."
        print(f"  {header}: {value}")

    print(f"\nSchema testing completed!")
    print(f"Total fields in updated schema: {len(schema['output_headers'])}")

if __name__ == "__main__":
    test_updated_schema()
