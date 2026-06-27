# -*- coding: utf-8 -*-
"""
Entity Extractor Module

This module uses Google Gemini AI to extract named entities and relationships
from text content in Jay Rosen's Internet Archive. It identifies people,
organizations, works, concepts, events, and locations, along with their relationships.

The module follows the entity_extraction_schema.json specification for entity types
and relationship patterns.
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import google.generativeai as genai
from rosen_scraper.gemini_json import strip_gemini_fence
from rosen_scraper.rate_limiter import rate_limited_gemini_call

# Configuration
ENTITY_DEBUG_DIR = Path("logs/entity_extraction")
ENTITY_SCHEMA_FILE = Path(__file__).parent.parent.parent / "entity_extraction_schema_v3.json"


def load_entity_schema() -> Dict[str, Any]:
    """
    Load the entity extraction schema from JSON file.

    Returns:
        dict: The entity extraction schema configuration
    """
    try:
        with open(ENTITY_SCHEMA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"  [ENTITY] ERROR: Could not load entity schema: {e}")
        return {}


def _dump_entity_debug(payload: str, reason: str, record_id: str = "unknown") -> None:
    """
    Persist raw AI output to disk for inspection and debugging.

    Args:
        payload: The raw response from the AI
        reason: The reason for dumping (e.g., 'validation_failure', 'api_exception')
        record_id: The record ID being processed
    """
    try:
        ENTITY_DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
        safe_reason = reason.replace(" ", "_")
        target = ENTITY_DEBUG_DIR / f"{timestamp}_{record_id}_{safe_reason}.json"
        target.write_text(payload, encoding="utf-8")
        print(f"  [ENTITY] DEBUG: Saved extraction snapshot to {target}")
    except OSError as exc:
        print(f"  [ENTITY] WARNING: Unable to write debug dump ({exc})")


def _normalize_entity_list(entities_data: Any) -> List[Dict[str, Any]]:
    """
    Normalize entity data into a consistent list format.

    Args:
        entities_data: Raw entity data from AI (could be list, dict, or other)

    Returns:
        list: Normalized list of entity dictionaries
    """
    if not entities_data:
        return []

    if isinstance(entities_data, list):
        return [entity for entity in entities_data if isinstance(entity, dict)]

    if isinstance(entities_data, dict):
        # Check if it's a single entity or a wrapper
        if "entity_id" in entities_data:
            return [entities_data]
        # If it's a wrapper with 'entities' key
        if "entities" in entities_data:
            return _normalize_entity_list(entities_data["entities"])

    print(f"  [ENTITY] WARNING: Unexpected entity data format: {type(entities_data)}")
    return []


def _normalize_relationship_list(relationships_data: Any) -> List[Dict[str, Any]]:
    """
    Normalize relationship data into a consistent list format.

    Args:
        relationships_data: Raw relationship data from AI

    Returns:
        list: Normalized list of relationship dictionaries
    """
    if not relationships_data:
        return []

    if isinstance(relationships_data, list):
        return [rel for rel in relationships_data if isinstance(rel, dict)]

    if isinstance(relationships_data, dict):
        # Check if it's a single relationship
        if "source_entity_id" in relationships_data or "source_id" in relationships_data:
            return [relationships_data]
        # If it's a wrapper with 'relationships' key
        if "relationships" in relationships_data:
            return _normalize_relationship_list(relationships_data["relationships"])

    print(f"  [ENTITY] WARNING: Unexpected relationship data format: {type(relationships_data)}")
    return []


def _validate_entity_extraction(
    entities: List[Dict[str, Any]],
    relationships: List[Dict[str, Any]],
    schema: Dict[str, Any]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[str]]:
    """
    Validate extracted entities and relationships against the schema.

    Args:
        entities: List of extracted entities
        relationships: List of extracted relationships
        schema: The entity extraction schema

    Returns:
        tuple: (validated_entities, validated_relationships, validation_issues)
    """
    issues = []
    valid_entities = []
    valid_relationships = []

    entity_types = schema.get("entity_types", {})
    relationship_types = schema.get("relationship_types", {})

    # Validate entities
    for entity in entities:
        entity_type = entity.get("entity_type")
        entity_name = entity.get("entity_name")
        entity_id = entity.get("entity_id")

        if not entity_type:
            issues.append(f"Entity missing type: {entity}")
            continue

        if entity_type not in entity_types:
            issues.append(f"Invalid entity type '{entity_type}' for entity: {entity_name}")
            continue

        if not entity_name:
            issues.append(f"Entity missing name: {entity}")
            continue

        if not entity_id:
            issues.append(f"Entity missing ID: {entity_name}")
            continue

        valid_entities.append(entity)

    # Validate relationships
    for relationship in relationships:
        rel_type = relationship.get("relationship_type")
        source_id = relationship.get("source_entity_id") or relationship.get("source_id")
        target_id = relationship.get("target_entity_id") or relationship.get("target_id")

        if not rel_type:
            issues.append(f"Relationship missing type: {relationship}")
            continue

        if rel_type not in relationship_types:
            issues.append(f"Invalid relationship type '{rel_type}'")
            continue

        if not source_id or not target_id:
            issues.append(f"Relationship missing source or target ID: {relationship}")
            continue

        # Note: We don't enforce that IDs exist in valid_entities because
        # the entities might be from previous extractions

        # Normalize field names
        if "source_id" in relationship and "source_entity_id" not in relationship:
            relationship["source_entity_id"] = relationship.pop("source_id")
        if "target_id" in relationship and "target_entity_id" not in relationship:
            relationship["target_entity_id"] = relationship.pop("target_id")

        valid_relationships.append(relationship)

    return valid_entities, valid_relationships, issues

@rate_limited_gemini_call
def _call_gemini_for_entity_extraction(model, prompt):
    """
    Make a rate-limited call to Gemini API for entity extraction.
    
    This function is decorated with rate limiting to prevent API throttling.
    
    Args:
        model: Gemini model instance
        prompt: The prompt to send
        
    Returns:
        The API response object
    """
    response = model.generate_content(prompt)
    return response


def extract_entities_and_relationships(
    text_content: str,
    record_id: str,
    schema: Optional[Dict[str, Any]] = None,
    record_title: Optional[str] = None,
    record_author: Optional[str] = None,
    record_publication: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Extract named entities and relationships from text using Google Gemini AI.

    This function sends the text content to Gemini with detailed instructions
    based on the entity extraction schema. It returns structured data containing
    entities (people, organizations, works, concepts, events, locations) and
    their relationships.

    Args:
        text_content: The raw text to analyze
        record_id: The ID of the record being processed (for tracking/debugging)
        schema: Optional entity extraction schema (loaded automatically if not provided)
        record_title: The title of the record being analyzed (for context awareness)
        record_author: The author of the record (to prevent self-referential entities)
        record_publication: The publication source (to prevent self-referential entities)

    Returns:
        dict: A dictionary containing:
            - entities: List of extracted entities
            - relationships: List of extracted relationships
            - record_id: The source record ID
            - extraction_date: Timestamp of extraction
        Returns None if extraction fails
    """
    # Load schema if not provided
    if schema is None:
        schema = load_entity_schema()
        if not schema:
            print("  [ENTITY] ERROR: Could not load entity extraction schema")
            return None

    # Get API key
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("  [ENTITY] ERROR: GEMINI_API_KEY not found in environment")
        return None

    # Configure Gemini
    genai.configure(api_key=api_key)
    # gemini-2.0-flash was retired by Google; 2.5-flash is the current default.
    model = genai.GenerativeModel('gemini-2.5-flash')

    # Extract schema components
    entity_types = schema.get("entity_types", {})
    relationship_types = schema.get("relationship_types", {})
    guidelines = schema.get("extraction_guidelines", {})

    # Build entity types description
    entity_types_desc = "\n".join([
        f"    - **{etype}** ({info['prefix']}): {info['description']}\n      Examples: {', '.join(info['examples'])}"
        for etype, info in entity_types.items()
    ])

    # Build relationship types description
    rel_types_desc = "\n".join([
        f"    - **{rtype}**: {info['description']}"
        for rtype, info in relationship_types.items()
    ])

    # Build record context section
    record_context = f"""
**RECORD CONTEXT (The article you are analyzing):**
- Record ID: {record_id}
- Title: {record_title or 'N/A'}
- Author: {record_author or 'N/A'}
- Publication: {record_publication or 'N/A'}

**CRITICAL RULES:**
1. DO NOT create a Work entity for THIS record (ID: {record_id}). It is already in the archive.
2. DO NOT create "Founded By" or "Authored By" relationships for THIS record. Authorship is already captured in metadata.
3. ONLY extract OTHER works that are REFERENCED or CITED within the text.
4. Use "Authored By" when someone WROTE a work. Use "Founded" ONLY for organizations/publications (NOT individual articles).
"""

    # Construct the AI prompt
    prompt = f"""
**INSTRUCTIONS:**
You are a specialized entity extraction AI for Jay Rosen's Internet Archive. Your task is to analyze journalism and media criticism texts to extract:
1. Named entities (people, organizations, works, concepts, events, locations)
2. Relationships between these entities

Focus on entities relevant to journalism, media criticism, and political coverage.

{record_context}

**ENTITY TYPES TO EXTRACT:**
{entity_types_desc}

**RELATIONSHIP TYPES:**
{rel_types_desc}

**EXTRACTION GUIDELINES:**
- {guidelines.get('prominence_threshold', 'Extract substantively discussed entities')}
- {guidelines.get('context_required', 'Include disambiguating context')}
- {guidelines.get('relationship_evidence', 'Base relationships on explicit evidence')}
- {guidelines.get('entity_normalization', 'Standardize entity names')}
- {guidelines.get('record_awareness', 'Remember: You are analyzing an existing archive record. Do not create entities for the record itself.')}

**FOCUS AREAS:**
{', '.join(guidelines.get('focus_areas', []))}

**TEXT TO ANALYZE:**
---
{text_content[:15000]}
---

**REQUIRED JSON OUTPUT FORMAT:**
{{
  "entities": [
    {{
      "entity_id": "P001",
      "entity_type": "Person",
      "entity_name": "Full name of person",
      "role": "Their role or title",
      "affiliation": "Their organization/affiliation",
      "prominence_score": 8
    }},
    {{
      "entity_id": "O001",
      "entity_type": "Organization",
      "entity_name": "Full organization name",
      "org_type": "Type of organization",
      "prominence_score": 7
    }},
    {{
      "entity_id": "C001",
      "entity_type": "Concept",
      "entity_name": "Name of concept/theory",
      "originator": "Who created/coined it",
      "prominence_score": 9
    }}
    // ... more entities as needed
  ],
  "relationships": [
    {{
      "source_entity_id": "P001",
      "relationship_type": "Criticizes",
      "target_entity_id": "O001",
      "context": "Brief quote or context showing this relationship",
      "confidence_score": 0.9
    }}
    // ... more relationships as needed
  ]
}}

**IMPORTANT:**
- Use proper prefixes for entity_id: P (Person), O (Organization), W (Work), C (Concept), E (Event), L (Location)
- Prominence score: 1-10 (10 = highly central to the text, 1 = mentioned briefly)
- Confidence score: 0.0-1.0 (1.0 = explicitly stated, 0.5 = strongly implied)
- Extract only entities substantively discussed in the text
- Return valid JSON only, no additional commentary
"""

    try:
        print(f"  [ENTITY] Extracting entities from record {record_id}...")
        response = _call_gemini_for_entity_extraction(model, prompt)

        # Clean up the response
        cleaned_response = strip_gemini_fence(response.text)

        # Parse JSON
        extraction_data = json.loads(cleaned_response)

        # Normalize and validate
        entities = _normalize_entity_list(extraction_data.get("entities", []))
        relationships = _normalize_relationship_list(extraction_data.get("relationships", []))

        validated_entities, validated_relationships, issues = _validate_entity_extraction(
            entities, relationships, schema
        )

        if issues:
            print(f"  [ENTITY] Validation issues found ({len(issues)} issues):")
            for issue in issues[:5]:  # Show first 5 issues
                print(f"    - {issue}")
            _dump_entity_debug(cleaned_response, "validation_issues", record_id)

        # Check if we got meaningful results
        if not validated_entities:
            print(f"  [ENTITY] WARNING: No valid entities extracted from record {record_id}")
            _dump_entity_debug(cleaned_response, "no_entities", record_id)
            return None

        result = {
            "entities": validated_entities,
            "relationships": validated_relationships,
            "record_id": record_id,
            "extraction_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "validation_issues": issues
        }

        print(f"  [ENTITY] Successfully extracted {len(validated_entities)} entities and {len(validated_relationships)} relationships")
        return result

    except json.JSONDecodeError as e:
        print(f"  [ENTITY] ERROR: Failed to parse AI response as JSON: {e}")
        raw_response = response.text if 'response' in locals() else 'No response'
        print(f"  [ENTITY] Raw response preview: {raw_response[:500]}")
        _dump_entity_debug(raw_response, "json_parse_error", record_id)
        return None

    except Exception as e:
        print(f"  [ENTITY] ERROR: Entity extraction failed: {e}")
        raw_response = response.text if 'response' in locals() else 'No response'
        if raw_response != 'No response':
            _dump_entity_debug(raw_response, "extraction_error", record_id)
        return None


def format_entities_for_sheet(
    entities: List[Dict[str, Any]],
    record_id: str,
    existing_entity_ids: set
) -> List[List[str]]:
    """
    Format extracted entities for writing to Google Sheets.

    Args:
        entities: List of entity dictionaries
        record_id: The source record ID
        existing_entity_ids: Set of entity IDs that already exist in the sheet

    Returns:
        list: List of rows ready for appending to Google Sheets
    """
    rows = []

    for entity in entities:
        entity_id = entity.get("entity_id", "")
        entity_type = entity.get("entity_type", "")
        entity_name = entity.get("entity_name", "")

        # Determine normalized name (could be enhanced with entity resolution)
        normalized_name = entity_name

        # Get type-specific attributes
        role_or_desc = entity.get("role") or entity.get("org_type") or entity.get("work_type") or entity.get("event_type") or entity.get("location_type") or ""
        affiliation = entity.get("affiliation", "")
        prominence = entity.get("prominence_score", 5)

        # Check if entity already exists
        first_mention = record_id if entity_id not in existing_entity_ids else ""
        total_mentions = 1 if entity_id not in existing_entity_ids else ""

        # Format row according to schema
        row = [
            entity_id,
            entity_type,
            entity_name,
            normalized_name,
            str(role_or_desc),
            str(affiliation),
            str(prominence),
            first_mention,
            str(total_mentions),
            "",  # related_entities (to be populated by cross-reference analysis)
            ""   # notes
        ]

        rows.append(row)

    return rows


def format_relationships_for_sheet(
    relationships: List[Dict[str, Any]],
    record_id: str,
    entity_lookup: Dict[str, str]
) -> List[List[str]]:
    """
    Format extracted relationships for writing to Google Sheets.

    Args:
        relationships: List of relationship dictionaries
        record_id: The source record ID
        entity_lookup: Mapping of entity_id to entity_name for resolving names

    Returns:
        list: List of rows ready for appending to Google Sheets
    """
    rows = []

    for idx, relationship in enumerate(relationships):
        source_id = relationship.get("source_entity_id", "")
        target_id = relationship.get("target_entity_id", "")
        rel_type = relationship.get("relationship_type", "")
        context = relationship.get("context", "")
        confidence = relationship.get("confidence_score", 0.8)

        # Generate relationship ID
        rel_id = f"{record_id}_REL_{idx+1:03d}"

        # Get entity names from lookup (or use IDs as fallback)
        source_name = entity_lookup.get(source_id, source_id)
        target_name = entity_lookup.get(target_id, target_id)

        # Format row according to schema
        row = [
            rel_id,
            record_id,
            source_id,
            source_name,
            rel_type,
            target_id,
            target_name,
            context[:200],  # Limit context to 200 chars
            str(confidence),
            datetime.now().strftime("%Y-%m-%d")
        ]

        rows.append(row)

    return rows


if __name__ == "__main__":
    # Test the entity extractor with sample text
    print("Testing entity extraction...")

    sample_text = """
    Jay Rosen, a journalism professor at NYU, has been a leading critic of
    mainstream political coverage. In his influential blog PressThink, he introduced
    concepts like "The View from Nowhere" and "The Church of the Savvy" to describe
    problematic patterns in political journalism. His work builds on the tradition
    of public journalism and has influenced reporters at The New York Times and
    The Washington Post. Margaret Sullivan, former public editor of the Times,
    has cited Rosen's work extensively in her own media criticism.
    """

    result = extract_entities_and_relationships(sample_text, "TEST-00001")

    if result:
        print(f"\nExtracted {len(result['entities'])} entities:")
        for entity in result['entities']:
            print(f"  - {entity['entity_type']}: {entity['entity_name']}")

        print(f"\nExtracted {len(result['relationships'])} relationships:")
        for rel in result['relationships']:
            print(f"  - {rel['source_entity_id']} {rel['relationship_type']} {rel['target_entity_id']}")
    else:
        print("\nEntity extraction failed")
