# -*- coding: utf-8 -*-
"""
Entity Registry

Manages entity ID assignment and deduplication using a normalized name lookup system.
Prevents duplicate entity IDs by checking against existing entities before assigning new IDs.
"""

import csv
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

from rosen_scraper.entity_normalization import (
    ENTITY_TYPE_PREFIXES,
    normalize_entity_name as _normalize_entity_name,
)


class EntityRegistry:
    """Manages entity ID assignments using normalized name lookups."""

    def __init__(self):
        """Initialize the registry."""
        # Normalized name + type -> entity_id mapping
        self.name_to_id = {}  # {(normalized_name, entity_type) -> entity_id}

        # Entity ID -> full entity data
        self.entities = {}  # {entity_id -> {name, type, role, affiliation, ...}}

        # ID counters by prefix
        self.id_counters = defaultdict(int)  # {prefix -> next_number}

    def normalize_entity_name(self, name: str, entity_type: str) -> str:
        """Normalize entity name for matching.

        Thin wrapper over the shared normalizer so the registry and the
        deduplicator can never drift apart.
        """
        return _normalize_entity_name(name, entity_type)

    def load_from_sheet(self, entities_data: List[List[str]], headers: List[str]):
        """
        Load existing entities from Google Sheets data.

        Args:
            entities_data: List of entity rows from sheet
            headers: List of column headers
        """
        try:
            # Find column indices
            id_col = headers.index("entity_id")
            type_col = headers.index("entity_type")
            name_col = headers.index("entity_name")
            role_col = headers.index("role_or_description") if "role_or_description" in headers else -1
            affiliation_col = headers.index("affiliation") if "affiliation" in headers else -1
        except ValueError as e:
            print(f"[REGISTRY] ERROR: Required column not found: {e}")
            return

        for row in entities_data:
            if len(row) <= max(id_col, type_col, name_col):
                continue

            entity_id = row[id_col]
            entity_type = row[type_col]
            entity_name = row[name_col]

            if not entity_id or not entity_type or not entity_name:
                continue

            # Normalize the name
            normalized = self.normalize_entity_name(entity_name, entity_type)

            # Store in lookup
            key = (normalized, entity_type)
            self.name_to_id[key] = entity_id

            # Store full entity data
            self.entities[entity_id] = {
                'entity_id': entity_id,
                'entity_type': entity_type,
                'entity_name': entity_name,
                'normalized_name': normalized,
                'role_or_description': row[role_col] if role_col >= 0 and len(row) > role_col else "",
                'affiliation': row[affiliation_col] if affiliation_col >= 0 and len(row) > affiliation_col else ""
            }

            # Update ID counter
            prefix = entity_id[0]  # P, O, C, etc.
            try:
                id_num = int(entity_id[1:])
                if id_num > self.id_counters[prefix]:
                    self.id_counters[prefix] = id_num
            except (ValueError, IndexError):
                pass

        print(f"[REGISTRY] Loaded {len(self.name_to_id)} entities from sheet")
        print(f"[REGISTRY] ID counters: {dict(self.id_counters)}")

    def load_from_csv(self, csv_path: Path) -> int:
        """
        Load existing entities from a CSV file.

        The CSV should have columns: entity_id, entity_type, entity_name,
        and optionally: normalized_name, role_or_description, affiliation, etc.

        Args:
            csv_path: Path to the CSV file

        Returns:
            Number of entities loaded
        """
        csv_path = Path(csv_path)
        if not csv_path.exists():
            print(f"[REGISTRY] WARNING: CSV file not found: {csv_path}")
            return 0

        loaded_count = 0

        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)

            for row in reader:
                entity_id = row.get('entity_id', '')
                entity_type = row.get('entity_type', '')
                entity_name = row.get('entity_name', '')

                if not entity_id or not entity_type or not entity_name:
                    continue

                # Normalize the name
                normalized = self.normalize_entity_name(entity_name, entity_type)

                # Store in lookup
                key = (normalized, entity_type)
                self.name_to_id[key] = entity_id

                # Store full entity data
                self.entities[entity_id] = {
                    'entity_id': entity_id,
                    'entity_type': entity_type,
                    'entity_name': entity_name,
                    'normalized_name': normalized,
                    'role_or_description': row.get('role_or_description', ''),
                    'affiliation': row.get('affiliation', ''),
                    'prominence_score': row.get('prominence_score', ''),
                    'first_mention_record_id': row.get('first_mention_record_id', ''),
                    'total_mentions': row.get('total_mentions', '1'),
                    'related_entities': row.get('related_entities', ''),
                    'notes': row.get('notes', '')
                }

                # Update ID counter
                prefix = entity_id[0]  # P, O, C, etc.
                try:
                    id_num = int(entity_id[1:])
                    if id_num > self.id_counters[prefix]:
                        self.id_counters[prefix] = id_num
                except (ValueError, IndexError):
                    pass

                loaded_count += 1

        print(f"[REGISTRY] Loaded {loaded_count} entities from CSV: {csv_path.name}")
        print(f"[REGISTRY] ID counters: {dict(self.id_counters)}")

        return loaded_count

    def get_or_create_entity_id(self, entity_name: str, entity_type: str) -> Tuple[str, bool]:
        """
        Get existing entity ID or create a new one.

        Args:
            entity_name: Name of the entity
            entity_type: Type of entity (Person, Organization, etc.)

        Returns:
            tuple: (entity_id, is_new)
                - entity_id: The ID (existing or newly created)
                - is_new: True if this is a new entity, False if existing
        """
        normalized = self.normalize_entity_name(entity_name, entity_type)
        key = (normalized, entity_type)

        # Check if entity already exists
        if key in self.name_to_id:
            return self.name_to_id[key], False

        # Create new entity ID
        prefix = ENTITY_TYPE_PREFIXES.get(entity_type, 'X')

        self.id_counters[prefix] += 1
        new_id = f"{prefix}{self.id_counters[prefix]:04d}"

        # Register the new entity
        self.name_to_id[key] = new_id
        self.entities[new_id] = {
            'entity_id': new_id,
            'entity_type': entity_type,
            'entity_name': entity_name,
            'normalized_name': normalized
        }

        return new_id, True

    def reassign_entity_ids(self, entities: List[Dict]) -> Tuple[List[Dict], int, int]:
        """
        Reassign entity IDs based on registry lookup.

        Takes entities extracted by AI (with temporary IDs like P001, O001)
        and replaces them with canonical IDs from the registry.

        Args:
            entities: List of entity dicts from AI extraction

        Returns:
            tuple: (updated_entities, existing_count, new_count)
        """
        # Track old_id -> new_id mapping for relationship updates
        id_mapping = {}
        existing_count = 0
        new_count = 0

        updated_entities = []

        for entity in entities:
            old_id = entity.get('entity_id', '')
            entity_name = entity.get('entity_name', '')
            entity_type = entity.get('entity_type', '')

            if not entity_name or not entity_type:
                continue

            # Get or create canonical ID
            canonical_id, is_new = self.get_or_create_entity_id(entity_name, entity_type)

            # Update entity with canonical ID
            entity['entity_id'] = canonical_id
            updated_entities.append(entity)

            # Track the mapping
            id_mapping[old_id] = canonical_id

            if is_new:
                new_count += 1
            else:
                existing_count += 1

        return updated_entities, id_mapping, existing_count, new_count

    def update_relationship_ids(self, relationships: List[Dict], id_mapping: Dict[str, str]) -> List[Dict]:
        """
        Update relationship IDs based on entity ID mapping.

        Args:
            relationships: List of relationship dicts
            id_mapping: Mapping of old_id -> canonical_id

        Returns:
            list: Updated relationships with canonical IDs
        """
        updated_relationships = []

        for rel in relationships:
            source_id = rel.get('source_entity_id', '')
            target_id = rel.get('target_entity_id', '')

            # Map to canonical IDs
            mapped_source = id_mapping.get(source_id, source_id)
            mapped_target = id_mapping.get(target_id, target_id)

            # Skip relationships with missing entity IDs
            if not mapped_source or not mapped_target:
                continue

            rel['source_entity_id'] = mapped_source
            rel['target_entity_id'] = mapped_target

            updated_relationships.append(rel)

        return updated_relationships

    def get_stats(self) -> Dict:
        """Get registry statistics."""
        type_counts = defaultdict(int)
        for entity_id in self.entities:
            prefix = entity_id[0]
            type_counts[prefix] += 1

        return {
            'total_entities': len(self.entities),
            'by_type': dict(type_counts),
            'id_counters': dict(self.id_counters)
        }
