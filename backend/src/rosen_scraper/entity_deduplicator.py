# -*- coding: utf-8 -*-
"""
Entity Deduplicator

This script resolves duplicate entities in the extracted_entities sheet by:
1. Normalizing entity names to find duplicates
2. Assigning canonical entity IDs
3. Tracking mentions across all records
4. Updating the sheet with deduplicated data
"""

import os
from collections import defaultdict
from typing import Dict, List

import gspread
from dotenv import load_dotenv

from .entity_normalization import (
    ENTITY_TYPE_PREFIXES,
    normalize_entity_name as _normalize_entity_name,
)

load_dotenv()


class EntityDeduplicator:
    """Deduplicates entities and assigns canonical IDs."""

    def __init__(self, spreadsheet_name: str = None):
        """Initialize the deduplicator."""
        self.spreadsheet_name = spreadsheet_name or os.environ.get("SPREADSHEET_NAME")
        self.gc = None
        self.spreadsheet = None
        self.entities_sheet = None
        self.relationships_sheet = None

        # Canonical entity registry
        self.canonical_entities = {}  # normalized_name -> canonical_entity_data
        self.id_mapping = {}  # old_id -> canonical_id

    def connect_to_sheets(self):
        """Connect to Google Sheets."""
        try:
            credentials_path = os.environ.get(
                "GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json"
            )

            print("[DEDUP] Connecting to Google Sheets...")
            self.gc = gspread.service_account(filename=credentials_path)
            self.spreadsheet = self.gc.open(self.spreadsheet_name)
            self.entities_sheet = self.spreadsheet.worksheet("extracted_entities")
            self.relationships_sheet = self.spreadsheet.worksheet(
                "extracted_relationships"
            )
            print("[DEDUP] Successfully connected")
            return True
        except Exception as e:
            print(f"[DEDUP] ERROR: Failed to connect: {e}")
            return False

    def normalize_entity_name(self, name: str, entity_type: str) -> str:
        """Normalize entity name for matching.

        Thin wrapper over the shared normalizer so the deduplicator and the
        registry can never drift apart.
        """
        return _normalize_entity_name(name, entity_type)

    def load_entities(self) -> List[Dict]:
        """Load all entities from the sheet."""
        print("[DEDUP] Loading entities from sheet...")
        all_values = self.entities_sheet.get_all_values()

        if len(all_values) < 2:
            print("[DEDUP] No entities found")
            return []

        rows = all_values[1:]

        entities = []
        for row_idx, row in enumerate(rows):
            if not row[0]:  # Skip empty entity_id
                continue

            entity = {
                "row_number": row_idx + 2,  # +2 for header and 0-indexing
                "entity_id": row[0],
                "entity_type": row[1] if len(row) > 1 else "",
                "entity_name": row[2] if len(row) > 2 else "",
                "normalized_name": row[3] if len(row) > 3 else "",
                "role_or_description": row[4] if len(row) > 4 else "",
                "affiliation": row[5] if len(row) > 5 else "",
                "prominence_score": row[6] if len(row) > 6 else "",
                "first_mention_record_id": row[7] if len(row) > 7 else "",
                "total_mentions": row[8] if len(row) > 8 else "",
                "related_entities": row[9] if len(row) > 9 else "",
                "notes": row[10] if len(row) > 10 else "",
            }
            entities.append(entity)

        print(f"[DEDUP] Loaded {len(entities)} entity rows")
        return entities

    def build_canonical_registry(self, entities: List[Dict]) -> Dict:
        """
        Build canonical entity registry.

        Groups entities by normalized name and type, then assigns canonical IDs.
        """
        print("[DEDUP] Building canonical entity registry...")

        # Group entities by normalized name + type
        entity_groups = defaultdict(list)

        for entity in entities:
            entity_type = entity["entity_type"]
            entity_name = entity["entity_name"]

            if not entity_name or not entity_type:
                continue

            normalized = self.normalize_entity_name(entity_name, entity_type)
            key = (normalized, entity_type)
            entity_groups[key].append(entity)

        print(
            f"[DEDUP] Found {len(entity_groups)} unique entities (after normalization)"
        )

        # Create canonical registry
        canonical_registry = {}
        entity_type_counters = defaultdict(int)  # Track IDs per type

        for (normalized_name, entity_type), group in entity_groups.items():
            # Determine canonical ID
            prefix = ENTITY_TYPE_PREFIXES.get(entity_type, "X")

            entity_type_counters[prefix] += 1
            canonical_id = f"{prefix}{entity_type_counters[prefix]:04d}"

            # Choose best entity name (most common or longest)
            name_counts = defaultdict(int)
            for entity in group:
                name_counts[entity["entity_name"]] += 1

            # Pick most frequent name, or longest if tie
            canonical_name = max(
                name_counts.keys(), key=lambda n: (name_counts[n], len(n))
            )

            # Collect all record IDs where this entity appears
            record_ids = set()
            for entity in group:
                first_mention_record_id = entity.get("first_mention_record_id")
                if first_mention_record_id:
                    record_ids.add(first_mention_record_id)

            # Get earliest mention
            first_mention = min(
                [
                    e.get("first_mention_record_id", "")
                    for e in group
                    if e.get("first_mention_record_id")
                ],
                default="",
            )

            # Aggregate prominence (take max)
            prominence_scores = [
                int(e.get("prominence_score", ""))
                for e in group
                if e.get("prominence_score", "").isdigit()
            ]
            max_prominence = max(prominence_scores) if prominence_scores else 5

            # Aggregate role_or_description (most common non-empty)
            role_counts = defaultdict(int)
            for entity in group:
                if entity.get("role_or_description"):
                    role_counts[entity["role_or_description"]] += 1
            canonical_role = (
                max(role_counts.keys(), key=role_counts.get) if role_counts else ""
            )

            # Aggregate affiliation (most common non-empty)
            affiliation_counts = defaultdict(int)
            for entity in group:
                if entity.get("affiliation"):
                    affiliation_counts[entity["affiliation"]] += 1
            canonical_affiliation = (
                max(affiliation_counts.keys(), key=affiliation_counts.get)
                if affiliation_counts
                else ""
            )

            # Store canonical entity
            canonical_registry[canonical_id] = {
                "canonical_id": canonical_id,
                "entity_type": entity_type,
                "canonical_name": canonical_name,
                "normalized_name": normalized_name,
                "role_or_description": canonical_role,
                "affiliation": canonical_affiliation,
                "total_mentions": len(group),
                "mentioned_in_records": len(record_ids),
                "first_mention": first_mention,
                "prominence_score": max_prominence,
                "original_ids": [e["entity_id"] for e in group],
                "name_variations": sorted(set(e["entity_name"] for e in group)),
            }

            # Build ID mapping (old_id -> canonical_id)
            for entity in group:
                self.id_mapping[entity["entity_id"]] = canonical_id

        print(f"[DEDUP] Created {len(canonical_registry)} canonical entities")
        print(f"[DEDUP] ID mapping has {len(self.id_mapping)} entries")

        return canonical_registry

    def replace_extracted_entities_sheet(self, canonical_registry: Dict):
        """Replace the extracted_entities sheet with deduplicated data."""
        print("[DEDUP] Replacing extracted_entities sheet with deduplicated data...")

        # Prepare deduplicated rows matching the original schema
        rows = []
        for canonical_id in sorted(canonical_registry.keys()):
            entity = canonical_registry[canonical_id]

            # Match the original schema format
            row = [
                entity["canonical_id"],  # entity_id
                entity["entity_type"],  # entity_type
                entity["canonical_name"],  # entity_name
                entity["normalized_name"],  # normalized_name
                entity.get(
                    "role_or_description", ""
                ),  # role_or_description (most common)
                entity.get("affiliation", ""),  # affiliation (most common)
                str(entity["prominence_score"]),  # prominence_score
                entity["first_mention"],  # first_mention_record_id
                str(entity["total_mentions"]),  # total_mentions
                "",  # related_entities (skip)
                f"Canonical entity (from {len(entity['original_ids'])} mentions: {'; '.join(entity['name_variations'][:3])})",  # notes
            ]
            rows.append(row)

        # Clear all data except headers
        print("[DEDUP] Clearing old entity data...")
        # Get current row count
        current_row_count = len(self.entities_sheet.get_all_values())
        if current_row_count > 1:
            # Delete all rows after header
            self.entities_sheet.delete_rows(2, current_row_count)

        # Write deduplicated data
        print(f"[DEDUP] Writing {len(rows)} deduplicated entities...")
        if rows:
            for i in range(0, len(rows), 100):
                batch = rows[i : i + 100]
                self.entities_sheet.append_rows(batch)
                print(f"[DEDUP] Wrote {len(batch)} rows...")

        print(
            f"[DEDUP] Successfully replaced extracted_entities with {len(rows)} canonical entities"
        )
        return self.entities_sheet

    def create_deduplicated_sheet(self, canonical_registry: Dict):
        """Create new sheet with deduplicated entities."""
        print("[DEDUP] Creating deduplicated entities sheet...")

        # Check if sheet exists, delete it
        try:
            old_sheet = self.spreadsheet.worksheet("entities_deduplicated")
            self.spreadsheet.del_worksheet(old_sheet)
            print("[DEDUP] Deleted old deduplicated sheet")
        except gspread.WorksheetNotFound:
            pass

        # Create new sheet
        headers = [
            "entity_id",
            "entity_type",
            "entity_name",
            "normalized_name",
            "total_mentions",
            "mentioned_in_records",
            "first_mention_record_id",
            "prominence_score",
            "name_variations",
            "original_ids",
            "notes",
        ]

        dedup_sheet = self.spreadsheet.add_worksheet(
            title="entities_deduplicated",
            rows=len(canonical_registry) + 1,
            cols=len(headers),
        )

        # Write headers
        dedup_sheet.append_row(headers)

        # Prepare rows
        rows = []
        for canonical_id in sorted(canonical_registry.keys()):
            entity = canonical_registry[canonical_id]

            row = [
                entity["canonical_id"],
                entity["entity_type"],
                entity["canonical_name"],
                entity["normalized_name"],
                str(entity["total_mentions"]),
                str(entity["mentioned_in_records"]),
                entity["first_mention"],
                str(entity["prominence_score"]),
                "; ".join(entity["name_variations"][:5]),  # First 5 variations
                "; ".join(entity["original_ids"][:10]),  # First 10 original IDs
                f"Deduplicated from {len(entity['original_ids'])} original mentions",
            ]
            rows.append(row)

        # Batch write
        if rows:
            for i in range(0, len(rows), 100):
                batch = rows[i : i + 100]
                dedup_sheet.append_rows(batch)
                print(f"[DEDUP] Wrote {len(batch)} rows...")

        print(f"[DEDUP] Created deduplicated sheet with {len(rows)} entities")
        return dedup_sheet

    def update_relationships(self):
        """Update relationships sheet with canonical entity IDs."""
        print("[DEDUP] Updating relationships with canonical IDs...")

        # Load relationships
        all_values = self.relationships_sheet.get_all_values()
        if len(all_values) < 2:
            print("[DEDUP] No relationships to update")
            return

        headers = all_values[0]
        rows = all_values[1:]

        # Find column indices
        try:
            source_id_col = headers.index("source_entity_id")
            target_id_col = headers.index("target_entity_id")
        except ValueError:
            print("[DEDUP] ERROR: Required columns not found in relationships sheet")
            return

        # Update rows
        updates = []
        updated_count = 0

        for row_idx, row in enumerate(rows):
            if len(row) <= max(source_id_col, target_id_col):
                continue

            source_id = row[source_id_col]
            target_id = row[target_id_col]

            # Map to canonical IDs
            new_source_id = self.id_mapping.get(source_id, source_id)
            new_target_id = self.id_mapping.get(target_id, target_id)

            if new_source_id != source_id or new_target_id != target_id:
                # Update this row
                row_number = row_idx + 2  # +2 for header and 0-indexing

                updates.append(
                    {
                        "range": f"{gspread.utils.rowcol_to_a1(row_number, source_id_col + 1)}",
                        "values": [[new_source_id]],
                    }
                )
                updates.append(
                    {
                        "range": f"{gspread.utils.rowcol_to_a1(row_number, target_id_col + 1)}",
                        "values": [[new_target_id]],
                    }
                )
                updated_count += 1

        # Batch update
        if updates:
            print(f"[DEDUP] Applying {len(updates)} updates to relationships...")
            for i in range(0, len(updates), 100):
                batch = updates[i : i + 100]
                self.relationships_sheet.batch_update(batch)
                print(f"[DEDUP] Updated {min(i+100, len(updates))}/{len(updates)}...")

        print(f"[DEDUP] Updated {updated_count} relationship rows with canonical IDs")

    def generate_report(self, canonical_registry: Dict):
        """Generate deduplication report."""
        print("\n" + "=" * 80)
        print("ENTITY DEDUPLICATION REPORT")
        print("=" * 80)

        # Overall stats
        total_canonical = len(canonical_registry)
        total_original = sum(e["total_mentions"] for e in canonical_registry.values())
        reduction = (
            ((total_original - total_canonical) / total_original * 100)
            if total_original > 0
            else 0
        )

        print(f"Original entity rows: {total_original}")
        print(f"Canonical entities: {total_canonical}")
        print(f"Reduction: {reduction:.1f}%")

        # By type
        print("\nBy Entity Type:")
        type_stats = defaultdict(lambda: {"count": 0, "original": 0})
        for entity in canonical_registry.values():
            etype = entity["entity_type"]
            type_stats[etype]["count"] += 1
            type_stats[etype]["original"] += entity["total_mentions"]

        for etype in sorted(type_stats.keys()):
            stats = type_stats[etype]
            print(
                f"  {etype}: {stats['count']} canonical (from {stats['original']} original)"
            )

        # Top entities by mentions
        print("\nTop 10 Most Mentioned Entities:")
        top_entities = sorted(
            canonical_registry.values(), key=lambda e: e["total_mentions"], reverse=True
        )[:10]

        for entity in top_entities:
            print(
                f"  {entity['canonical_id']} - {entity['canonical_name']} "
                f"({entity['entity_type']}): {entity['total_mentions']} mentions"
            )

        # Name variations
        print("\nEntities with Most Name Variations:")
        top_variations = sorted(
            canonical_registry.values(),
            key=lambda e: len(e["name_variations"]),
            reverse=True,
        )[:10]

        for entity in top_variations:
            if len(entity["name_variations"]) > 1:
                print(
                    f"  {entity['canonical_name']}: {len(entity['name_variations'])} variations"
                )
                print(f"    {', '.join(entity['name_variations'][:5])}")

        print("=" * 80 + "\n")

    def run(self, update_relationships: bool = True, replace_original: bool = False):
        """Run the complete deduplication process.

        Args:
            update_relationships: Whether to update relationships with canonical IDs
            replace_original: If True, replace extracted_entities sheet; if False, create new sheet
        """
        print("\n" + "=" * 80)
        print("STARTING ENTITY DEDUPLICATION")
        print("=" * 80 + "\n")

        # Connect
        if not self.connect_to_sheets():
            return

        # Load entities
        entities = self.load_entities()
        if not entities:
            return

        # Build canonical registry
        canonical_registry = self.build_canonical_registry(entities)

        # Replace or create sheet
        if replace_original:
            self.replace_extracted_entities_sheet(canonical_registry)
        else:
            self.create_deduplicated_sheet(canonical_registry)

        # Update relationships if requested
        if update_relationships:
            self.update_relationships()

        # Generate report
        self.generate_report(canonical_registry)

        print("[DEDUP] Deduplication complete!")
        print("\nResults:")
        if replace_original:
            print(
                "  - Original 'extracted_entities' sheet replaced with clean canonical data"
            )
        else:
            print(
                "  - New sheet 'entities_deduplicated' created with canonical entities"
            )
            print("  - Original 'extracted_entities' sheet preserved for reference")
        if update_relationships:
            print("  - Relationships updated with canonical entity IDs")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Deduplicate extracted entities")
    parser.add_argument(
        "--skip-relationships",
        action="store_true",
        help="Skip updating relationships sheet",
    )
    parser.add_argument(
        "--spreadsheet",
        type=str,
        default=None,
        help="Google Sheet name (default: from environment)",
    )
    parser.add_argument(
        "--replace-original",
        action="store_true",
        help="Replace the original extracted_entities sheet instead of creating a new one",
    )

    args = parser.parse_args()

    deduplicator = EntityDeduplicator(spreadsheet_name=args.spreadsheet)
    deduplicator.run(
        update_relationships=not args.skip_relationships,
        replace_original=args.replace_original,
    )


if __name__ == "__main__":
    main()
