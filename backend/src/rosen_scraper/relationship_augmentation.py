"""
Targeted Relationship Augmentation Script

Extracts ONLY new relationship types (Pioneered, Inspired By, Founded By, Owns, Owned By)
from high-value records, focusing on Jay Rosen's intellectual and organizational impact.

Quality filters:
- High prominence entities only (≥7)
- High confidence relationships (≥0.7)
- Records featuring Jay Rosen or his key concepts
- Major media organizations only
"""

import gspread
from google.oauth2.service_account import Credentials
import google.generativeai as genai
import json
import time
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from entity_registry import EntityRegistry

# Configuration
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
SPREADSHEET_NAME = "📎Rosen Archive URL List"
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# Quality thresholds
MIN_PROMINENCE_SCORE = 7  # Only high-prominence entities
MIN_CONFIDENCE_SCORE = 0.5  # Moderate-to-high confidence relationships

# Jay Rosen key concepts to prioritize
ROSEN_CONCEPTS = [
    "View from Nowhere",
    "Church of the Savvy",
    "Public Journalism",
    "Citizens' Agenda",
    "PressThink",
    "He Said She Said Journalism",
    "Transparency is the new objectivity",
    "The Quest for Innocence"
]

# Major media organizations to track ownership
MAJOR_MEDIA_ORGS = [
    "The New York Times", "The Washington Post", "CNN", "NBC", "ABC", "CBS",
    "Fox News", "MSNBC", "NPR", "The Guardian", "BBC", "ProPublica"
]


class RelationshipAugmenter:
    """Augment existing relationships with new high-value types"""

    def __init__(self):
        self.setup_credentials()
        self.setup_gemini()
        self.load_schema()
        self.load_entity_registry()
        self.stats = {
            'records_scanned': 0,
            'records_processed': 0,
            'new_relationships': 0,
            'skipped_low_value': 0
        }

    def setup_credentials(self):
        """Connect to Google Sheets"""
        creds = Credentials.from_service_account_file('google_credentials.json', scopes=SCOPES)
        self.client = gspread.authorize(creds)
        self.spreadsheet = self.client.open(SPREADSHEET_NAME)
        self.test_runs_sheet = self.spreadsheet.worksheet('test_runs')
        self.relationships_sheet = self.spreadsheet.worksheet('extracted_relationships')
        print("[INIT] Connected to Google Sheets")

    def setup_gemini(self):
        """Configure Gemini AI"""
        genai.configure(api_key=GEMINI_API_KEY)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
        print("[INIT] Gemini AI configured")

    def load_schema(self):
        """Load entity extraction schema"""
        with open('src/entity_extraction_schema.json', 'r', encoding='utf-8') as f:
            self.schema = json.load(f)
        print("[INIT] Schema loaded (v2.1 with new relationship types)")

    def load_entity_registry(self):
        """Load existing entities into registry for ID lookups"""
        self.entity_registry = EntityRegistry()

        try:
            print("[INIT] Loading entity registry...")
            all_values = self.client.open(SPREADSHEET_NAME).worksheet('extracted_entities').get_all_values()

            if len(all_values) < 2:
                print("[INIT] No existing entities found")
                return

            headers = all_values[0]
            entities_data = all_values[1:]

            self.entity_registry.load_from_sheet(entities_data, headers)

            stats = self.entity_registry.get_stats()
            print(f"[INIT] Loaded {stats['total_entities']} entities into registry")

        except Exception as e:
            print(f"[INIT] Warning: Could not load entity registry: {e}")
            print("[INIT] Will proceed without entity ID lookups")

    def is_high_value_record(self, record: Dict) -> tuple[bool, str]:
        """Determine if record is worth processing for augmentation"""
        raw_text = record.get('raw_text', '')
        title = record.get('title', '')

        # Check 1: Mentions Jay Rosen
        if 'jay rosen' in raw_text.lower() or 'jay rosen' in title.lower():
            return True, "Contains Jay Rosen"

        # Check 2: Contains Rosen's key concepts
        for concept in ROSEN_CONCEPTS:
            if concept.lower() in raw_text.lower():
                return True, f"Contains concept: {concept}"

        # Check 3: About founding/creation/pioneering
        founding_keywords = ['founded', 'created', 'pioneered', 'started', 'launched', 'established']
        if any(keyword in raw_text.lower() for keyword in founding_keywords):
            return True, "Contains founding/creation language"

        # Check 4: About major media organizations
        for org in MAJOR_MEDIA_ORGS:
            if org.lower() in raw_text.lower():
                return True, f"Contains major media org: {org}"

        # Check 5: Contains "inspired by" or "influenced by" language
        influence_keywords = ['inspired by', 'influenced by', 'building on', 'based on']
        if any(keyword in raw_text.lower() for keyword in influence_keywords):
            return True, "Contains influence language"

        return False, "No high-value indicators"

    def extract_new_relationships(self, record: Dict) -> List[Dict]:
        """Extract ONLY new relationship types from record"""

        prompt = f"""You are analyzing an article from the Jay Rosen Digital Archive.

IMPORTANT: Extract ONLY these 5 relationship types:
1. "Pioneered" - Person pioneered/invented/was first to develop a concept/work/practice
2. "Inspired By" - Work/concept was inspired by or influenced by another work/concept/person
3. "Founded By" - Organization/work was founded or created by a person/organization
4. "Owns" - Organization/person owns or controls another organization
5. "Owned By" - Organization is owned/controlled by another organization/person

QUALITY REQUIREMENTS:
- Only extract relationships with MODERATE-TO-HIGH CONFIDENCE (≥0.5)
- Only extract relationships involving PROMINENT entities (≥7 prominence score)
- Focus on Jay Rosen's intellectual and organizational impact
- Relationships must be EXPLICITLY stated or STRONGLY implied

Article Title: {record.get('title', 'N/A')}
Article Text: {record.get('raw_text', '')[:3000]}

Return ONLY a JSON object with this structure:
{{
  "relationships": [
    {{
      "source_entity_name": "Entity Name",
      "source_entity_type": "Person/Organization/Work/Concept",
      "relationship_type": "Pioneered/Inspired By/Founded By/Owns/Owned By",
      "target_entity_name": "Entity Name",
      "target_entity_type": "Person/Organization/Work/Concept",
      "context": "Brief context from text",
      "confidence_score": 0.0-1.0,
      "prominence_score": 0-10
    }}
  ]
}}

If no high-quality relationships of these types exist, return: {{"relationships": []}}
"""

        try:
            response = self.model.generate_content(prompt)
            result_text = response.text.strip()

            # Clean JSON formatting
            if result_text.startswith('```json'):
                result_text = result_text[7:]
            if result_text.endswith('```'):
                result_text = result_text[:-3]
            result_text = result_text.strip()

            result = json.loads(result_text)

            # Filter by quality thresholds
            high_quality_rels = []
            for rel in result.get('relationships', []):
                if (rel.get('confidence_score', 0) >= MIN_CONFIDENCE_SCORE and
                    rel.get('prominence_score', 0) >= MIN_PROMINENCE_SCORE):
                    high_quality_rels.append(rel)
                else:
                    self.stats['skipped_low_value'] += 1

            return high_quality_rels

        except Exception as e:
            print(f"[ERROR] Extraction failed: {e}")
            return []

    def process_records(self, limit: Optional[int] = None):
        """Process records and augment relationships"""

        # Get all records
        all_records = self.test_runs_sheet.get_all_records()
        print(f"[SCAN] Found {len(all_records)} total records")

        # Get existing relationship IDs to avoid duplicates
        existing_rels = self.relationships_sheet.get_all_values()
        next_rel_id = len(existing_rels)  # Start after existing relationships

        new_relationships = []

        for record in all_records[:limit] if limit else all_records:
            self.stats['records_scanned'] += 1
            # Google Sheets get_all_records() uses column header name "id" not "record_id"
            record_id = record.get('id', record.get('record_id', 'UNKNOWN'))

            # Check if high-value record
            is_valuable, reason = self.is_high_value_record(record)

            if not is_valuable:
                if self.stats['records_scanned'] % 50 == 0:
                    print(f"[PROGRESS] Scanned {self.stats['records_scanned']} records, "
                          f"processed {self.stats['records_processed']}, "
                          f"found {self.stats['new_relationships']} new relationships")
                continue

            print(f"[PROCESS] {record_id} - {reason}")
            self.stats['records_processed'] += 1

            # Extract new relationships
            new_rels = self.extract_new_relationships(record)

            if new_rels:
                print(f"  Found {len(new_rels)} high-quality relationships")

                # Format for sheet with proper entity ID lookups
                for idx, rel in enumerate(new_rels):
                    # Generate proper relationship ID: RECORD-00XXX_REL_001
                    rel_id = f"{record_id}_REL_{idx+1:03d}"

                    # Look up entity IDs from registry
                    source_entity_id, _ = self.entity_registry.get_or_create_entity_id(
                        rel['source_entity_name'],
                        rel['source_entity_type']
                    )

                    target_entity_id, _ = self.entity_registry.get_or_create_entity_id(
                        rel['target_entity_name'],
                        rel['target_entity_type']
                    )

                    # Format row with all required fields
                    row = [
                        rel_id,                              # relationship_id (proper format)
                        record_id,                           # source_record_id
                        source_entity_id,                    # source_entity_id (from registry)
                        rel['source_entity_name'],           # source_entity_name
                        rel['relationship_type'],            # relationship_type
                        target_entity_id,                    # target_entity_id (from registry)
                        rel['target_entity_name'],           # target_entity_name
                        rel['context'][:200],                # context_snippet (limit 200 chars)
                        rel['confidence_score'],             # confidence_score
                        datetime.now().strftime('%Y-%m-%d')  # extracted_date
                    ]
                    new_relationships.append(row)
                    self.stats['new_relationships'] += 1

            # Rate limiting
            time.sleep(6)

        # Write new relationships to sheet
        if new_relationships:
            print(f"\n[WRITE] Writing {len(new_relationships)} new relationships to sheet...")
            self.relationships_sheet.append_rows(new_relationships)
            print("[WRITE] Complete!")

        # Print final stats
        print("\n" + "=" * 80)
        print("AUGMENTATION COMPLETE")
        print("=" * 80)
        print(f"Records scanned: {self.stats['records_scanned']}")
        print(f"High-value records processed: {self.stats['records_processed']}")
        print(f"New relationships added: {self.stats['new_relationships']}")
        print(f"Low-quality relationships skipped: {self.stats['skipped_low_value']}")
        print(f"Total relationships in sheet: {len(existing_rels) - 1 + len(new_relationships)}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Augment relationships with new types')
    parser.add_argument('--limit', type=int, help='Limit number of records to process (for testing)')
    parser.add_argument('--test', action='store_true', help='Test mode - process only 10 records')

    args = parser.parse_args()

    augmenter = RelationshipAugmenter()

    if args.test:
        print("[TEST MODE] Processing first 10 records only")
        augmenter.process_records(limit=10)
    elif args.limit:
        augmenter.process_records(limit=args.limit)
    else:
        augmenter.process_records()
