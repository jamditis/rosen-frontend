#!/usr/bin/env python3
"""
Fix Entity Relationships - Repairs invalid entity IDs in extracted_relationships.csv

This script addresses the 14 unfixable issues identified in the entity validation report:
- Organization names as IDs instead of proper O-codes
- Invalid "O000" entity IDs
- "N/A" or "Concept" as entity IDs

For each unfixable issue:
1. Look up the source record to understand context
2. Either create a new entity ID if one doesn't exist, or map to existing entity
3. Update the relationships file with the corrected target_entity_id

Generated: 2026-01-06
"""

import csv
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

# File paths
BASE_DIR = Path(__file__).parent.parent.parent
DATA_DIR = BASE_DIR / "data"
ENTITIES_FILE = DATA_DIR / "extracted_entities.csv"
RELATIONSHIPS_FILE = DATA_DIR / "extracted_relationships.csv"
ARCHIVE_FILE = DATA_DIR / "archive_records-public.csv"

# Backup suffix
BACKUP_SUFFIX = f".backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"


class EntityRelationshipFixer:
    """Fixes invalid entity IDs in relationship records."""

    def __init__(self):
        self.entities: List[Dict] = []
        self.relationships: List[Dict] = []
        self.archive_records: List[Dict] = []
        self.entity_map: Dict[str, Dict] = {}  # entity_id -> entity data
        self.fixes_applied: List[Tuple[str, str, str, str]] = []  # (rel_id, old_id, new_id, reason)
        self.new_entities: List[Dict] = []

    def load_data(self):
        """Load all CSV files."""
        print("Loading data files...")

        # Load entities
        with open(ENTITIES_FILE, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            self.entities = list(reader)

        # Create entity lookup map
        self.entity_map = {e['entity_id']: e for e in self.entities}
        print(f"  Loaded {len(self.entities)} entities")

        # Load relationships
        with open(RELATIONSHIPS_FILE, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            self.relationships = list(reader)
        print(f"  Loaded {len(self.relationships)} relationships")

        # Load archive records (for context)
        with open(ARCHIVE_FILE, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            self.archive_records = list(reader)
        print(f"  Loaded {len(self.archive_records)} archive records")

    def get_next_entity_id(self, entity_type: str) -> str:
        """Get the next available entity ID for a given type."""
        # Find max ID for this type
        prefix = entity_type[0].upper()  # P, O, C, W, E, L
        max_num = 0

        for entity in self.entities + self.new_entities:
            eid = entity['entity_id']
            if eid.startswith(prefix):
                try:
                    num = int(eid[1:])
                    max_num = max(max_num, num)
                except ValueError:
                    continue

        return f"{prefix}{max_num + 1:04d}"

    def find_entity_by_name(self, name: str, entity_type: str = None) -> str:
        """Find entity by name, optionally filtered by type."""
        name_lower = name.lower().strip()

        for entity in self.entities:
            entity_name_lower = entity['entity_name'].lower().strip()
            normalized_lower = entity.get('normalized_name', '').lower().strip()

            # Check if type matches (if specified)
            if entity_type and not entity['entity_id'].startswith(entity_type[0].upper()):
                continue

            # Check for exact or normalized match
            if entity_name_lower == name_lower or normalized_lower == name_lower:
                return entity['entity_id']

            # Check for aliases in entity name
            if name_lower in entity_name_lower or entity_name_lower in name_lower:
                return entity['entity_id']

        return None

    def create_entity(self, entity_name: str, entity_type: str,
                     role: str = "", affiliation: str = "",
                     prominence: int = 5, source_record: str = "") -> str:
        """Create a new entity and return its ID."""
        entity_id = self.get_next_entity_id(entity_type)

        new_entity = {
            'entity_id': entity_id,
            'entity_type': entity_type,
            'entity_name': entity_name,
            'normalized_name': entity_name.lower(),
            'role_or_description': role,
            'affiliation': affiliation,
            'prominence_score': str(prominence),
            'first_mention_record_id': source_record,
            'total_mentions': '1',
            'related_entities': '',
            'notes': f'Created during relationship repair on {datetime.now().strftime("%Y-%m-%d")}'
        }

        self.new_entities.append(new_entity)
        self.entity_map[entity_id] = new_entity
        print(f"  Created new entity: {entity_id} ({entity_name})")

        return entity_id

    def fix_relationship(self, relationship_id: str, new_target_id: str, reason: str):
        """Update a relationship with a new target entity ID."""
        for rel in self.relationships:
            if rel['relationship_id'] == relationship_id:
                old_target_id = rel['target_entity_id']
                rel['target_entity_id'] = new_target_id

                # Update target entity name if new entity exists
                if new_target_id in self.entity_map:
                    rel['target_entity_name'] = self.entity_map[new_target_id]['entity_name']

                self.fixes_applied.append((relationship_id, old_target_id, new_target_id, reason))
                print(f"  Fixed {relationship_id}: {old_target_id} → {new_target_id} ({reason})")
                return True

        print(f"  WARNING: Relationship {relationship_id} not found")
        return False

    def apply_fixes(self):
        """Apply all fixes for the 14 unfixable issues."""
        print("\nApplying fixes...")

        # 1. RECORD-00027_REL_006: New York University → O0049
        nyu_id = self.find_entity_by_name("NYU", "Organization")
        if not nyu_id:
            nyu_id = self.find_entity_by_name("New York University", "Organization")
        if not nyu_id:
            nyu_id = self.create_entity("New York University", "Organization",
                                       "University", "", 8, "RECORD-00027")
        self.fix_relationship("RECORD-00027_REL_006", nyu_id,
                            "Mapped organization name to proper entity ID")

        # 2-4. RECORD-00046_REL_006, 010, 012: O000 → Create "The Media" concept
        # These reference "the Media" as a general entity being criticized
        media_id = self.find_entity_by_name("The Media", "Concept")
        if not media_id:
            media_id = self.create_entity("The Media", "Concept",
                                         "General reference to news media as institution",
                                         "", 9, "RECORD-00046")
        self.fix_relationship("RECORD-00046_REL_006", media_id,
                            "Spiro Agnew criticizing 'the Media' - created concept entity")
        self.fix_relationship("RECORD-00046_REL_010", media_id,
                            "Steve Bannon quote 'The real opposition is the media'")
        self.fix_relationship("RECORD-00046_REL_012", media_id,
                            "Bob Corker mentioning 'the media'")

        # 5. RECORD-00097_REL_005: Unspecified → Create authors entity
        # Context: "Institutional isomorphism... (DiMaggio and Powell, 1983)"
        dimaggio_powell_id = self.find_entity_by_name("DiMaggio and Powell", "Person")
        if not dimaggio_powell_id:
            dimaggio_powell_id = self.create_entity("Paul DiMaggio and Walter Powell",
                                                    "Person",
                                                    "Sociologists", "", 7, "RECORD-00097")
        self.fix_relationship("RECORD-00097_REL_005", dimaggio_powell_id,
                            "Authors of institutional isomorphism theory")

        # 6. RECORD-00243_REL_002: O000 → Create "The Press Corps" organization
        # Context: Bush joking about scripted press questions
        press_corps_id = self.find_entity_by_name("The Press Corps", "Organization")
        if not press_corps_id:
            press_corps_id = self.create_entity("The Press Corps", "Organization",
                                               "General reference to journalists covering politics",
                                               "", 8, "RECORD-00243")
        self.fix_relationship("RECORD-00243_REL_002", press_corps_id,
                            "Bush criticizing the press corps")

        # 7. RECORD-00272_REL_003: Concept → Create proper concept entity
        # Context: Weinberger discusses blogging vs journalism distinction
        blogging_journalism_id = self.find_entity_by_name("Blogging vs Journalism", "Concept")
        if not blogging_journalism_id:
            blogging_journalism_id = self.create_entity("Blogging vs Journalism Distinction",
                                                       "Concept",
                                                       "The discontinuity between blogging and traditional journalism",
                                                       "", 7, "RECORD-00272")
        self.fix_relationship("RECORD-00272_REL_003", blogging_journalism_id,
                            "Created specific concept for blogging/journalism distinction")

        # 8. RECORD-00350_REL_004: Creative Commons Foundation → Create O-code
        cc_id = self.find_entity_by_name("Creative Commons", "Organization")
        if not cc_id:
            cc_id = self.create_entity("Creative Commons Foundation", "Organization",
                                      "Non-profit organization", "", 8, "RECORD-00350")
        self.fix_relationship("RECORD-00350_REL_004", cc_id,
                            "Mapped organization name to new entity ID")

        # 9. RECORD-00350_REL_005: Northeastern University → O1308 (should already exist)
        neu_id = self.find_entity_by_name("Northeastern University", "Organization")
        if not neu_id:
            neu_id = self.create_entity("Northeastern University", "Organization",
                                       "University", "", 7, "RECORD-00350")
        self.fix_relationship("RECORD-00350_REL_005", neu_id,
                            "Mapped organization name to proper entity ID")

        # 10-11. RECORD-00413_REL_014, 015: N/A → CJR Daily (O0426)
        cjr_id = self.find_entity_by_name("CJR Daily", "Organization")
        if not cjr_id:
            cjr_id = self.create_entity("CJR Daily", "Organization",
                                       "Journalism Review", "", 7, "RECORD-00413")
        self.fix_relationship("RECORD-00413_REL_014", cjr_id,
                            "Steve Lovelady affiliated with CJR Daily")
        self.fix_relationship("RECORD-00413_REL_015", cjr_id,
                            "Mike Hoyt affiliated with CJR Daily")

        # 12. RECORD-00414_REL_010: O000 → Create Routledge publisher
        # Context: "Journalism After September 11, edited by Stuart Allen and Barbie Zelizer, Routledge, 2002"
        routledge_id = self.find_entity_by_name("Routledge", "Organization")
        if not routledge_id:
            routledge_id = self.create_entity("Routledge", "Organization",
                                             "Academic Publisher", "", 7, "RECORD-00414")
        self.fix_relationship("RECORD-00414_REL_010", routledge_id,
                            "Book published by Routledge")

        # 13. RECORD-00547_REL_008: O000 → Create "The Press" organization
        # Context: Frank Rich criticizing colleagues
        the_press_id = self.find_entity_by_name("The Press", "Organization")
        if not the_press_id:
            the_press_id = self.create_entity("The Press", "Organization",
                                             "General reference to news media institution",
                                             "", 9, "RECORD-00547")
        self.fix_relationship("RECORD-00547_REL_008", the_press_id,
                            "Frank Rich criticizing 'the press'")

        # 14. RECORD-00610_REL_009: New York University → Use same as #1
        self.fix_relationship("RECORD-00610_REL_009", nyu_id,
                            "Mapped organization name to proper entity ID")

    def save_results(self):
        """Save updated entities and relationships with backups."""
        print("\nSaving results...")

        # Backup original files
        entities_backup = str(ENTITIES_FILE) + BACKUP_SUFFIX
        relationships_backup = str(RELATIONSHIPS_FILE) + BACKUP_SUFFIX

        os.system(f'cp "{ENTITIES_FILE}" "{entities_backup}"')
        os.system(f'cp "{RELATIONSHIPS_FILE}" "{relationships_backup}"')
        print(f"  Created backup: {entities_backup}")
        print(f"  Created backup: {relationships_backup}")

        # Save updated entities (append new ones)
        if self.new_entities:
            with open(ENTITIES_FILE, 'a', encoding='utf-8', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=self.entities[0].keys())
                writer.writerows(self.new_entities)
            print(f"  Added {len(self.new_entities)} new entities to {ENTITIES_FILE}")

        # Save updated relationships
        with open(RELATIONSHIPS_FILE, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=self.relationships[0].keys())
            writer.writeheader()
            writer.writerows(self.relationships)
        print(f"  Updated {RELATIONSHIPS_FILE}")

    def generate_report(self):
        """Generate a report of all fixes applied."""
        report_file = DATA_DIR / f"relationship_fixes_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

        with open(report_file, 'w', encoding='utf-8') as f:
            f.write("=" * 70 + "\n")
            f.write("ENTITY RELATIONSHIP FIX REPORT\n")
            f.write(f"Generated: {datetime.now().isoformat()}\n")
            f.write("=" * 70 + "\n\n")

            f.write("## SUMMARY\n\n")
            f.write(f"Total fixes applied:        {len(self.fixes_applied)}\n")
            f.write(f"New entities created:       {len(self.new_entities)}\n\n")

            f.write("## NEW ENTITIES CREATED\n\n")
            for entity in self.new_entities:
                f.write(f"  {entity['entity_id']}: {entity['entity_name']} ({entity['entity_type']})\n")
                f.write(f"    Role: {entity['role_or_description']}\n")
                f.write(f"    Source: {entity['first_mention_record_id']}\n\n")

            f.write("## RELATIONSHIP FIXES\n\n")
            for rel_id, old_id, new_id, reason in self.fixes_applied:
                f.write(f"  {rel_id}\n")
                f.write(f"    Before: target_entity_id = '{old_id}'\n")
                f.write(f"    After:  target_entity_id = '{new_id}'\n")
                f.write(f"    Reason: {reason}\n\n")

            f.write("=" * 70 + "\n")
            f.write("PROCESS COMPLETE\n")
            f.write("=" * 70 + "\n")

        print(f"\nReport saved to: {report_file}")

        # Print summary to console
        print("\n" + "=" * 70)
        print("FIX SUMMARY")
        print("=" * 70)
        print(f"Total fixes applied:        {len(self.fixes_applied)}")
        print(f"New entities created:       {len(self.new_entities)}")
        print("Backup files created:       2")
        print(f"Report file:                {report_file.name}")
        print("=" * 70)


def main():
    """Main execution function."""
    print("=" * 70)
    print("ENTITY RELATIONSHIP FIXER")
    print("Fixing 14 unfixable issues from validation report")
    print("=" * 70)

    fixer = EntityRelationshipFixer()

    try:
        fixer.load_data()
        fixer.apply_fixes()
        fixer.save_results()
        fixer.generate_report()

        print("\n✓ All fixes completed successfully!")

    except Exception as e:
        print(f"\n✗ Error occurred: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    exit(main())
