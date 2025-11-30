# -*- coding: utf-8 -*-
"""
Analyze "Founded By" and "Pioneered" Relationships

This script queries the extracted_relationships sheet to get accurate counts
of what Jay Rosen actually founded vs pioneered, and what entity types are involved.

Purpose: Investigate the source of the incorrect "120+ organizations" claim.
"""

import os
import sys
from collections import Counter
from typing import Dict, List
import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
SPREADSHEET_NAME = os.environ.get("SPREADSHEET_NAME", "📎Rosen Archive URL List")
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]


def connect_to_sheets():
    """Connect to Google Sheets."""
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        # Try default locations
        for path in ["credentials.json", "service_account.json", "../credentials.json"]:
            if os.path.exists(path):
                creds_path = path
                break

    if not creds_path or not os.path.exists(creds_path):
        print("ERROR: Could not find credentials file.")
        print("Set GOOGLE_APPLICATION_CREDENTIALS environment variable or place credentials.json in project root.")
        sys.exit(1)

    creds = Credentials.from_service_account_file(creds_path, scopes=SCOPES)
    gc = gspread.authorize(creds)

    # Open spreadsheet
    spreadsheet = gc.open(SPREADSHEET_NAME)
    return spreadsheet


def analyze_relationships(spreadsheet):
    """Analyze Founded By and Pioneered relationships."""

    print("\n" + "="*80)
    print("ANALYZING ENTITY EXTRACTION RELATIONSHIPS")
    print("="*80)

    # Load relationships sheet
    print("\nLoading extracted_relationships sheet...")
    relationships_sheet = spreadsheet.worksheet("extracted_relationships")
    relationships_data = relationships_sheet.get_all_records()
    print(f"Total relationships: {len(relationships_data)}")

    # Load entities sheet for entity type info
    print("Loading extracted_entities sheet...")
    entities_sheet = spreadsheet.worksheet("extracted_entities")
    entities_data = entities_sheet.get_all_records()
    print(f"Total entities: {len(entities_data)}")

    # Build entity type lookup
    entity_types = {e.get('entity_name', ''): e.get('entity_type', 'Unknown') for e in entities_data}

    # Analyze all relationship types
    print("\n" + "-"*60)
    print("ALL RELATIONSHIP TYPES:")
    print("-"*60)

    rel_type_counts = Counter(r.get('relationship_type', 'Unknown') for r in relationships_data)
    for rel_type, count in rel_type_counts.most_common():
        pct = count / len(relationships_data) * 100
        print(f"  {rel_type}: {count} ({pct:.1f}%)")

    # Focus on Jay Rosen relationships
    print("\n" + "-"*60)
    print("JAY ROSEN AS SOURCE (all relationship types):")
    print("-"*60)

    rosen_as_source = [r for r in relationships_data if r.get('source_entity_name', '').lower() == 'jay rosen']
    rosen_rel_counts = Counter(r.get('relationship_type', 'Unknown') for r in rosen_as_source)
    print(f"\nTotal relationships where Jay Rosen is source: {len(rosen_as_source)}")
    for rel_type, count in rosen_rel_counts.most_common():
        print(f"  {rel_type}: {count}")

    # CRITICAL: Analyze "Founded By" relationships where Jay Rosen is source
    print("\n" + "-"*60)
    print("FOUNDED BY RELATIONSHIPS (Jay Rosen as source):")
    print("-"*60)

    founded_by_rosen = [r for r in relationships_data
                       if r.get('source_entity_name', '').lower() == 'jay rosen'
                       and r.get('relationship_type', '') == 'Founded By']

    print(f"\nTotal 'Founded By' with Jay Rosen as source: {len(founded_by_rosen)}")

    # Group by target entity type
    founded_by_type = Counter()
    founded_targets = []
    for r in founded_by_rosen:
        target = r.get('target_entity_name', '')
        target_type = entity_types.get(target, r.get('target_entity_type', 'Unknown'))
        founded_by_type[target_type] += 1
        founded_targets.append({
            'target': target,
            'type': target_type,
            'confidence': r.get('confidence_score', 'N/A'),
            'context': r.get('context', '')[:100] if r.get('context') else ''
        })

    print("\nBy target entity type:")
    for entity_type, count in founded_by_type.most_common():
        print(f"  {entity_type}: {count}")

    # List actual organizations founded
    print("\n" + "-"*60)
    print("ORGANIZATIONS 'Founded By' Jay Rosen:")
    print("-"*60)

    org_founded = [t for t in founded_targets if t['type'] == 'Organization']
    print(f"\nTotal: {len(org_founded)}")
    for i, item in enumerate(sorted(org_founded, key=lambda x: x['target']), 1):
        print(f"  {i}. {item['target']} (confidence: {item['confidence']})")

    # CRITICAL: Analyze "Pioneered" relationships where Jay Rosen is source
    print("\n" + "-"*60)
    print("PIONEERED RELATIONSHIPS (Jay Rosen as source):")
    print("-"*60)

    pioneered_by_rosen = [r for r in relationships_data
                         if r.get('source_entity_name', '').lower() == 'jay rosen'
                         and r.get('relationship_type', '') == 'Pioneered']

    print(f"\nTotal 'Pioneered' with Jay Rosen as source: {len(pioneered_by_rosen)}")

    # Group by target entity type
    pioneered_by_type = Counter()
    pioneered_targets = []
    for r in pioneered_by_rosen:
        target = r.get('target_entity_name', '')
        target_type = entity_types.get(target, r.get('target_entity_type', 'Unknown'))
        pioneered_by_type[target_type] += 1
        pioneered_targets.append({
            'target': target,
            'type': target_type,
            'confidence': r.get('confidence_score', 'N/A')
        })

    print("\nBy target entity type:")
    for entity_type, count in pioneered_by_type.most_common():
        print(f"  {entity_type}: {count}")

    # List concepts pioneered
    print("\n" + "-"*60)
    print("CONCEPTS 'Pioneered' by Jay Rosen:")
    print("-"*60)

    concepts_pioneered = [t for t in pioneered_targets if t['type'] == 'Concept']
    print(f"\nTotal: {len(concepts_pioneered)}")
    for i, item in enumerate(sorted(concepts_pioneered, key=lambda x: x['target']), 1):
        print(f"  {i}. {item['target']} (confidence: {item['confidence']})")

    # THE REAL ANSWER
    print("\n" + "="*80)
    print("SUMMARY: WHAT THE DATA ACTUALLY SHOWS")
    print("="*80)

    print(f"""
The R script combined these counts:
  - "Founded By" relationships (all target types): {len(founded_by_rosen)}
  - "Pioneered" relationships (all target types):  {len(pioneered_by_rosen)}
  - Combined total: {len(founded_by_rosen) + len(pioneered_by_rosen)}

After filtering for Organization OR Concept entity types:
  - Organizations "Founded By": {founded_by_type.get('Organization', 0)}
  - Concepts "Founded By": {founded_by_type.get('Concept', 0)}
  - Organizations "Pioneered": {pioneered_by_type.get('Organization', 0)}
  - Concepts "Pioneered": {pioneered_by_type.get('Concept', 0)}
  - Works "Founded By": {founded_by_type.get('Work', 0)}
  - Works "Pioneered": {pioneered_by_type.get('Work', 0)}

ACTUAL COUNT of organizations Jay Rosen founded: {founded_by_type.get('Organization', 0)}
(Not {len(founded_by_rosen) + len(pioneered_by_rosen)} or "120+")

The "120+ organizations" claim conflated:
  1. "Founded By" with "Pioneered" (different relationship types)
  2. Organizations with Concepts (different entity types)
  3. Possibly Works created with Organizations founded
""")

    # Check for duplicates
    print("\n" + "-"*60)
    print("CHECKING FOR DUPLICATES IN 'Founded By':")
    print("-"*60)

    org_names = [t['target'] for t in org_founded]
    duplicates = [name for name, count in Counter(org_names).items() if count > 1]
    if duplicates:
        print(f"\nDuplicate organization names found: {len(duplicates)}")
        for name in duplicates:
            print(f"  - {name}")
    else:
        print("\nNo duplicate organization names found.")

    unique_orgs = len(set(org_names))
    print(f"\nUnique organizations 'Founded By' Jay Rosen: {unique_orgs}")

    return {
        'total_relationships': len(relationships_data),
        'founded_by_rosen': len(founded_by_rosen),
        'pioneered_by_rosen': len(pioneered_by_rosen),
        'orgs_founded': founded_by_type.get('Organization', 0),
        'concepts_pioneered': pioneered_by_type.get('Concept', 0),
        'org_list': org_founded,
        'concept_list': concepts_pioneered
    }


def main():
    """Main entry point."""
    print("Connecting to Google Sheets...")
    spreadsheet = connect_to_sheets()
    print(f"Connected to: {spreadsheet.title}")

    results = analyze_relationships(spreadsheet)

    print("\n" + "="*80)
    print("ANALYSIS COMPLETE")
    print("="*80)

    return results


if __name__ == "__main__":
    main()
