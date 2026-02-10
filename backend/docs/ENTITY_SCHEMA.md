# Entity Extraction Schema Documentation

## Overview

The entity extraction system uses Google Gemini AI to automatically identify and categorize named entities (people, organizations, works, concepts, events, locations) and their relationships from text content in the Jay Rosen Internet Archive.

**Version:** 2.1  
**Schema File:** `backend/entity_extraction_schema.json`  
**Primary Modules:**
- `entity_extractor.py` - AI-powered entity and relationship extraction
- `entity_deduplicator.py` - Entity normalization and deduplication
- `entity_registry.py` - Entity ID assignment and lookup
- `relationship_augmentation.py` - Targeted relationship extraction

---

## Entity Types

The system recognizes six primary entity types, each with a unique ID prefix:

### 1. Person (`P`)

**Description:** Individual people mentioned in the text (journalists, politicians, media figures, academics)

**ID Format:** `P0001`, `P0002`, etc.

**Properties:**
- `entity_id` (string): Unique identifier with `P` prefix
- `entity_type` (string): `"Person"`
- `entity_name` (string): Full name of the person
- `normalized_name` (string): Lowercased, deduplicated form
- `role` (string): Their role or title (e.g., "Journalism professor", "Media critic") - *stored as `role_or_description` in sheets*
- `affiliation` (string): Their organization/institution (e.g., "New York University")
- `prominence_score` (int 1-10): How central this person is to the text

**Examples:**
- Jay Rosen (journalism professor at NYU)
- Margaret Sullivan (media critic, former public editor)
- Brian Stelter (CNN media correspondent)
- George W. Bush (U.S. President)

---

### 2. Organization (`O`)

**Description:** Media organizations, news outlets, institutions, corporations, government bodies

**ID Format:** `O0001`, `O0002`, etc.

**Properties:**
- `entity_id` (string): Unique identifier with `O` prefix
- `entity_type` (string): `"Organization"`
- `entity_name` (string): Full organization name
- `normalized_name` (string): Lowercased, deduplicated form (handles abbreviations)
- `org_type` (string): Type classification (e.g., "News outlet", "Academic institution", "Media company") - *stored as `role_or_description` in sheets*
- `prominence_score` (int 1-10): How central this organization is to the text

**Examples:**
- The New York Times (major newspaper)
- CNN (cable news network)
- New York University (academic institution)
- The Washington Post (news organization)

**Normalization:** Common abbreviations are standardized:
- `NYT` → `new york times`
- `WaPo` → `washington post`
- `NPR` → `national public radio`

---

### 3. Work (`W`)

**Description:** Published works, articles, books, reports, studies, blog posts, broadcasts

**ID Format:** `W0001`, `W0002`, etc.

**Properties:**
- `entity_id` (string): Unique identifier with `W` prefix
- `entity_type` (string): `"Work"`
- `entity_name` (string): Title of the work
- `normalized_name` (string): Lowercased, deduplicated form
- `work_type` (string): Classification (e.g., "Blog post", "Book", "Article", "Study") - *stored as `role_or_description` in sheets*
- `author` (string): Creator of the work
- `publication_year` (string): Year published (when available)
- `prominence_score` (int 1-10): How central this work is to the text

**Examples:**
- "Why Political Coverage Is Broken" (blog post)
- "The Elements of Journalism" (book)
- "Truth Sandwich" (article/concept)

---

### 4. Concept (`C`)

**Description:** Journalism theories, media criticism frameworks, intellectual concepts

**ID Format:** `C0001`, `C0002`, etc.

**Properties:**
- `entity_id` (string): Unique identifier with `C` prefix
- `entity_type` (string): `"Concept"`
- `entity_name` (string): Name of the concept/theory
- `normalized_name` (string): Lowercased, deduplicated form
- `originator` (string): Person who created/coined the concept
- `related_concepts` (string): Related theories or frameworks
- `prominence_score` (int 1-10): How central this concept is to the text

**Examples:**
- "View from Nowhere" (Jay Rosen's media criticism concept)
- "Church of the Savvy" (media criticism framework)
- "Public Journalism" (journalism movement)
- "The Citizens' Agenda" (journalism approach)

---

### 5. Event (`E`)

**Description:** Significant events, conferences, elections, media crises, historical moments

**ID Format:** `E0001`, `E0002`, etc.

**Properties:**
- `entity_id` (string): Unique identifier with `E` prefix
- `entity_type` (string): `"Event"`
- `entity_name` (string): Name of the event
- `normalized_name` (string): Lowercased, deduplicated form
- `event_type` (string): Event classification - *stored as `role_or_description` in sheets*
- `event_date` (string): When the event occurred
- `location` (string): Where the event took place
- `significance` (string): Why the event matters
- `prominence_score` (int 1-10): How central this event is to the text

**Examples:**
- 2016 Presidential Election
- Iraq War Coverage (media event/period)
- Watergate Scandal

---

### 6. Location (`L`)

**Description:** Geographic locations relevant to media/journalism context

**ID Format:** `L0001`, `L0002`, etc.

**Properties:**
- `entity_id` (string): Unique identifier with `L` prefix
- `entity_type` (string): `"Location"`
- `entity_name` (string): Name of the location
- `normalized_name` (string): Lowercased, deduplicated form
- `location_type` (string): Classification (e.g., "City", "Country", "Region") - *stored as `role_or_description` in sheets*
- `relevance` (string): Why this location matters in context
- `prominence_score` (int 1-10): How central this location is to the text

**Examples:**
- Washington D.C. (seat of U.S. government, media hub)
- New York City (media industry center)
- United States (national context)

---

## Relationship Types

The system extracts 15 types of relationships between entities. Each relationship has defined valid source and target entity types.

### 1. Mentions

**Description:** Entity A mentions entity B in passing or substantively

**Valid Patterns:**
- Person/Organization/Work → Person/Organization/Work/Event/Location

**Example:** Jay Rosen mentions The New York Times in his blog post

---

### 2. Criticizes

**Description:** Entity A criticizes or negatively evaluates entity B

**Valid Patterns:**
- Person/Organization/Work → Person/Organization/Work/Concept/Event

**Example:** Jay Rosen criticizes the Washington press corps

---

### 3. Cites

**Description:** Entity A cites or references entity B as source material

**Valid Patterns:**
- Person/Work → Work/Person/Organization

**Example:** Article cites Margaret Sullivan's media criticism

---

### 4. Discusses

**Description:** Entity A discusses or analyzes concept/event B in depth

**Valid Patterns:**
- Person/Work/Organization → Concept/Event/Work

**Example:** Blog post discusses "The Church of the Savvy" concept

---

### 5. Expands On

**Description:** Entity A expands, elaborates, or builds upon concept/work B

**Valid Patterns:**
- Person/Work → Concept/Work

**Example:** Jay Rosen expands on public journalism theory

---

### 6. Affiliated With

**Description:** Entity A is affiliated, employed by, or associated with entity B

**Valid Patterns:**
- Person → Organization

**Example:** Jay Rosen affiliated with New York University

---

### 7. Published In

**Description:** Work A was published in/by organization B

**Valid Patterns:**
- Work → Organization

**Example:** Article published in The New York Times

---

### 8. Originated By

**Description:** Concept A was originated or coined by person B

**Valid Patterns:**
- Concept → Person

**Example:** "View from Nowhere" originated by Jay Rosen

---

### 9. Occurred At

**Description:** Event A occurred at location B

**Valid Patterns:**
- Event → Location

**Example:** 2016 Election occurred at United States

---

### 10. Supports

**Description:** Entity A supports, advocates for, or defends entity B

**Valid Patterns:**
- Person/Organization/Work → Person/Organization/Concept/Event

**Example:** Journalist supports public journalism movement

---

### 11. Owns

**Description:** Organization A owns or controls organization B (media ownership, corporate structure)

**Valid Patterns:**
- Organization/Person → Organization

**Example:** Jeff Bezos owns The Washington Post

---

### 12. Owned By

**Description:** Organization A is owned or controlled by organization/person B (reverse of Owns)

**Valid Patterns:**
- Organization → Organization/Person

**Example:** The Washington Post owned by Jeff Bezos

---

### 13. Founded By

**Description:** Organization or work A was founded, created, or established by person/organization B

**Valid Patterns:**
- Organization/Work → Person/Organization

**Example:** PressThink founded by Jay Rosen

---

### 14. Pioneered

**Description:** Person A pioneered, invented, or was first to develop concept/work/practice B

**Valid Patterns:**
- Person → Concept/Work/Organization

**Example:** Jay Rosen pioneered "View from Nowhere" concept

---

### 15. Inspired By

**Description:** Work or concept A was inspired by, influenced by, or built upon work/concept/person B

**Valid Patterns:**
- Work/Concept → Work/Concept/Person

**Example:** Modern media criticism inspired by Jay Rosen's work

---

## Scoring Systems

### Prominence Score (1-10)

**Purpose:** Indicates how central an entity is to the text being analyzed

**Scale:**
- **10:** Highly central to the text; main subject or focus
- **8-9:** Major topic; discussed substantively with detail
- **6-7:** Significant mention; discussed in meaningful context
- **4-5:** Moderate mention; mentioned with some context
- **2-3:** Brief mention; passing reference
- **1:** Minimal mention; barely referenced

**Usage in Code:**
```python
prominence = entity.get("prominence_score", 5)  # Default to 5 if not specified
```

**Quality Thresholds:**
- High-prominence entities (≥7) are prioritized for relationship extraction
- Entities with prominence <4 may be filtered in some contexts

---

### Confidence Score (0.0-1.0)

**Purpose:** Indicates how confident the AI is about a relationship's validity

**Scale:**
- **1.0:** Explicitly stated in the text; direct quote
- **0.8-0.9:** Very clear; strongly implied with clear evidence
- **0.6-0.7:** Clear implication; reasonable inference from context
- **0.4-0.5:** Moderate confidence; suggested but not explicit
- **0.2-0.3:** Weak confidence; uncertain inference
- **0.0-0.1:** Very uncertain; speculative

**Usage in Code:**
```python
confidence = relationship.get("confidence_score", 0.8)  # Default to 0.8 if not specified

# Quality filtering
MIN_CONFIDENCE_SCORE = 0.5  # Filter relationships below this threshold
```

**Quality Thresholds:**
- Relationships with confidence ≥0.7 are considered high-quality
- Relationships with confidence <0.5 may be filtered in augmentation tasks

---

## Entity Deduplication

The entity deduplication system (`entity_deduplicator.py`) resolves duplicate entities by normalizing names and assigning canonical IDs.

### Normalization Process

**Steps:**
1. Convert to lowercase
2. Remove leading articles (`the`, `a`, `an`)
3. Remove punctuation (keeping spaces)
4. Collapse multiple spaces
5. Apply organization-specific abbreviation mapping

**Example Transformations:**
```
"The New York Times" → "new york times"
"NYT" → "new york times"  (via abbreviation mapping)
"  The  Washington   Post  " → "washington post"
"CNN" → "cable news network"
```

**Abbreviation Mappings (Organizations):**
```python
{
    'nyt': 'new york times',
    'wapo': 'washington post',
    'nyu': 'new york university',
    'npr': 'national public radio',
    'pbs': 'public broadcasting service',
    'cnn': 'cable news network',
    'bbc': 'british broadcasting corporation',
    'ap': 'associated press',
    'wsj': 'wall street journal'
}
```

### Canonical Entity Selection

When duplicates are found, the system:
1. **Picks canonical name:** Most frequently used name, or longest name if tied
2. **Aggregates prominence:** Maximum prominence score across all mentions
3. **Aggregates role/affiliation:** Most common non-empty values
4. **Counts mentions:** Tracks total mentions and unique records
5. **Preserves variations:** Stores all name variations for reference

### ID Mapping

The deduplicator creates a mapping from old (temporary) IDs to canonical IDs:

```python
self.id_mapping = {
    "P001": "P0042",  # Temporary AI ID → Canonical registry ID
    "P002": "P0042",  # Another mention of same person
    "O001": "O0015",  # Organization mapping
    # ...
}
```

This mapping is used to update relationships with canonical IDs.

### Deduplication Workflow

```python
# 1. Load entities from sheet
entities = deduplicator.load_entities()

# 2. Build canonical registry
canonical_registry = deduplicator.build_canonical_registry(entities)

# 3. Replace extracted_entities sheet with canonical data
deduplicator.replace_extracted_entities_sheet(canonical_registry)

# 4. Update relationships with canonical IDs
deduplicator.update_relationships()

# 5. Generate report
deduplicator.generate_report(canonical_registry)
```

**Output:**
- Original `extracted_entities` sheet is replaced with deduplicated data
- Relationships are updated to reference canonical entity IDs
- Report shows reduction in duplicate entries (typically 20-40% reduction)

---

## Entity Registry

The entity registry (`entity_registry.py`) manages entity ID assignment and prevents duplicate IDs during extraction.

### Purpose

- **Prevent duplicate entity IDs:** Check if entity already exists before creating new ID
- **Ensure ID consistency:** Maintain monotonically increasing ID counters per type
- **Enable cross-record entity tracking:** Same entity gets same ID across multiple articles

### Registry Structure

```python
class EntityRegistry:
    # Normalized name + type → entity_id mapping
    name_to_id = {}  # {(normalized_name, entity_type) -> entity_id}
    
    # Entity ID → full entity data
    entities = {}  # {entity_id -> {name, type, role, affiliation, ...}}
    
    # ID counters by prefix
    id_counters = {}  # {prefix -> next_number}
```

### Loading Existing Entities

```python
registry = EntityRegistry()
registry.load_from_sheet(entities_data, headers)

# Registry now contains all existing entities from Google Sheets
# ID counters are set to current maximum + 1
```

### ID Assignment

```python
# Get or create entity ID
entity_id, is_new = registry.get_or_create_entity_id("Jay Rosen", "Person")

# Returns:
# - ("P0042", False) if entity already exists
# - ("P0128", True) if new entity created
```

**ID Assignment Logic:**
1. Normalize entity name using same logic as deduplicator
2. Check if `(normalized_name, entity_type)` exists in registry
3. If exists: Return existing ID
4. If new: Increment counter, assign new ID with proper prefix

### Relationship ID Updates

```python
# Extract entities with temporary IDs from AI
entities = extract_entities_and_relationships(text, record_id)

# Reassign to canonical IDs
updated_entities, id_mapping, existing_count, new_count = registry.reassign_entity_ids(entities)

# Update relationships to use canonical IDs
updated_relationships = registry.update_relationship_ids(relationships, id_mapping)
```

**ID Mapping Example:**
```python
id_mapping = {
    "P001": "P0042",  # AI assigned temporary ID → Registry canonical ID
    "O001": "O0015",
    "C001": "C0007"
}
```

---

## Extraction Guidelines

### Prominence Threshold

**Extract entities that are substantively discussed, not just mentioned in passing**

- Focus on entities with clear context and detail
- Avoid extracting every name mentioned once
- Prioritize entities central to the article's argument

### Context Required

**Include enough context to disambiguate entities**

Good:
- "Jay Rosen, NYU journalism professor"
- "The New York Times newspaper"
- "Margaret Sullivan, former public editor"

Poor:
- "Jay" (ambiguous)
- "Times" (could be any Times publication)
- "Sullivan" (which Sullivan?)

### Relationship Evidence

**Relationships should be explicitly stated or strongly implied in the text**

Explicit (confidence 0.9-1.0):
> "Jay Rosen, who teaches at NYU..."
→ `Affiliated With` relationship

Strongly Implied (confidence 0.7-0.8):
> "Rosen's blog PressThink argues..."
→ `Discusses` or `Authored` relationship

Weak/Speculative (confidence <0.5):
> "This idea may be related to Rosen's work"
→ Too uncertain, skip or mark low confidence

### Entity Normalization

**Standardize entity names for consistency**

- Use full official names: "The New York Times" not "NYT"
- Use common forms: "George W. Bush" not "G.W. Bush"
- Preserve proper capitalization in entity_name (normalized_name is lowercased)
- Expand abbreviations when possible

### Focus Areas

Prioritize entities related to:
- Journalism criticism and theory
- Media industry analysis
- Political journalism
- Digital media evolution
- Press accountability
- Audience engagement

---

## Data Schema (Google Sheets)

### Property Mapping: Extraction vs Storage

**Important:** The AI extraction uses type-specific property names, but these are consolidated when stored in Google Sheets:

**Extraction Properties** → **Sheet Column**
- `role` (Person) → `role_or_description`
- `org_type` (Organization) → `role_or_description`
- `work_type` (Work) → `role_or_description`
- `event_type` (Event) → `role_or_description`
- `location_type` (Location) → `role_or_description`

This consolidation allows all entity types to use the same sheet schema while preserving type-specific information.

### Entities Sheet (`extracted_entities`)

**Columns:**
1. `entity_id` (string): Unique identifier (e.g., `P0001`)
2. `entity_type` (string): Type category (`Person`, `Organization`, etc.)
3. `entity_name` (string): Display name of the entity
4. `normalized_name` (string): Lowercased, deduplicated form
5. `role_or_description` (string): Role, title, or classification
6. `affiliation` (string): Associated organization/institution
7. `prominence_score` (string): 1-10 scale as text
8. `first_mention_record_id` (string): ID of record where first mentioned
9. `total_mentions` (string): Count of mentions across all records
10. `related_entities` (string): Comma-separated list of related entity IDs
11. `notes` (string): Additional information, deduplication notes

### Relationships Sheet (`extracted_relationships`)

**Columns:**
1. `relationship_id` (string): Format `RECORD-00XXX_REL_001`
2. `source_record_id` (string): ID of article where relationship was found
3. `source_entity_id` (string): ID of source entity (e.g., `P0001`)
4. `source_entity_name` (string): Name of source entity (for readability)
5. `relationship_type` (string): Type of relationship (e.g., `Criticizes`)
6. `target_entity_id` (string): ID of target entity (e.g., `O0015`)
7. `target_entity_name` (string): Name of target entity (for readability)
8. `context_snippet` (string): Quote or context from text (max 200 chars)
9. `confidence_score` (string): 0.0-1.0 confidence level as text
10. `extracted_date` (string): Date of extraction (YYYY-MM-DD)

---

## Example Extraction

### Sample Text

```
Jay Rosen, a journalism professor at NYU, criticizes the Washington press corps 
for embracing what he calls 'The Church of the Savvy.' In his influential blog 
post 'Why Political Coverage Is Broken,' Rosen expands on this concept and cites 
Margaret Sullivan's work on media accountability.
```

### Extracted Entities

```json
[
  {
    "entity_id": "P0001",
    "entity_type": "Person",
    "entity_name": "Jay Rosen",
    "role": "Journalism professor",
    "affiliation": "New York University",
    "prominence_score": 10
  },
  {
    "entity_id": "O0001",
    "entity_type": "Organization",
    "entity_name": "New York University",
    "org_type": "Academic Institution",
    "prominence_score": 5
  },
  {
    "entity_id": "O0002",
    "entity_type": "Organization",
    "entity_name": "Washington press corps",
    "org_type": "Media Group",
    "prominence_score": 7
  },
  {
    "entity_id": "C0001",
    "entity_type": "Concept",
    "entity_name": "The Church of the Savvy",
    "originator": "Jay Rosen",
    "prominence_score": 9
  },
  {
    "entity_id": "W0001",
    "entity_type": "Work",
    "entity_name": "Why Political Coverage Is Broken",
    "work_type": "Blog Post",
    "author": "Jay Rosen",
    "prominence_score": 8
  },
  {
    "entity_id": "P0002",
    "entity_type": "Person",
    "entity_name": "Margaret Sullivan",
    "role": "Media Critic",
    "prominence_score": 6
  }
]
```

### Extracted Relationships

```json
[
  {
    "source_entity_id": "P0001",
    "relationship_type": "Affiliated With",
    "target_entity_id": "O0001",
    "context": "journalism professor at NYU",
    "confidence_score": 1.0
  },
  {
    "source_entity_id": "P0001",
    "relationship_type": "Criticizes",
    "target_entity_id": "O0002",
    "context": "criticizes the Washington press corps",
    "confidence_score": 1.0
  },
  {
    "source_entity_id": "C0001",
    "relationship_type": "Originated By",
    "target_entity_id": "P0001",
    "context": "what he calls 'The Church of the Savvy'",
    "confidence_score": 1.0
  },
  {
    "source_entity_id": "P0001",
    "relationship_type": "Expands On",
    "target_entity_id": "C0001",
    "context": "Rosen expands on this concept",
    "confidence_score": 1.0
  },
  {
    "source_entity_id": "W0001",
    "relationship_type": "Cites",
    "target_entity_id": "P0002",
    "context": "cites Margaret Sullivan's work",
    "confidence_score": 0.9
  }
]
```

---

## Usage Examples

### Basic Entity Extraction

```python
from rosen_scraper.entity_extractor import extract_entities_and_relationships

# Extract entities and relationships from text
result = extract_entities_and_relationships(
    text_content="Your article text here...",
    record_id="RECORD-00123"
)

if result:
    print(f"Extracted {len(result['entities'])} entities")
    print(f"Extracted {len(result['relationships'])} relationships")
    
    # Access entities
    for entity in result['entities']:
        print(f"- {entity['entity_type']}: {entity['entity_name']} (prominence: {entity['prominence_score']})")
    
    # Access relationships
    for rel in result['relationships']:
        print(f"- {rel['source_entity_id']} {rel['relationship_type']} {rel['target_entity_id']}")
```

### Entity Deduplication

```python
from rosen_scraper.entity_deduplicator import EntityDeduplicator

# Initialize deduplicator
deduplicator = EntityDeduplicator(spreadsheet_name="📎Rosen Archive URL List")

# Run deduplication process
deduplicator.run(
    update_relationships=True,  # Update relationships with canonical IDs
    replace_original=True       # Replace extracted_entities sheet
)

# Report shows:
# - Original entity count
# - Canonical entity count
# - Reduction percentage
# - Top entities by mentions
# - Entities with most name variations
```

### Entity Registry

```python
from rosen_scraper.entity_registry import EntityRegistry

# Initialize and load existing entities
registry = EntityRegistry()
registry.load_from_sheet(entities_data, headers)

# Get or create entity IDs
jay_id, is_new = registry.get_or_create_entity_id("Jay Rosen", "Person")
# Returns ("P0042", False) if exists, or ("P0128", True) if new

nyt_id, is_new = registry.get_or_create_entity_id("The New York Times", "Organization")
# Returns ("O0015", False) if exists, or ("O0089", True) if new

# Check registry stats
stats = registry.get_stats()
print(f"Total entities: {stats['total_entities']}")
print(f"By type: {stats['by_type']}")
print(f"ID counters: {stats['id_counters']}")
```

### Relationship Augmentation

```python
from rosen_scraper.relationship_augmentation import RelationshipAugmenter

# Initialize augmenter
augmenter = RelationshipAugmenter()

# Process records to extract new relationship types
# (Pioneered, Inspired By, Founded By, Owns, Owned By)
augmenter.process_records(limit=100)  # Process first 100 records

# Stats show:
# - Records scanned
# - High-value records processed
# - New relationships added
# - Low-quality relationships skipped
```

---

## Debugging and Troubleshooting

### Debug Logs

Entity extraction failures are logged to `logs/entity_extraction/`:

```
logs/entity_extraction/
├── 20231201_143022_RECORD-00123_validation_issues.json
├── 20231201_143045_RECORD-00124_no_entities.json
└── 20231201_143102_RECORD-00125_json_parse_error.json
```

**Filename format:** `{timestamp}_{record_id}_{reason}.json`

**Reasons:**
- `validation_issues` - Entities/relationships failed schema validation
- `no_entities` - No valid entities extracted from text
- `json_parse_error` - AI response was not valid JSON
- `extraction_error` - General extraction failure

### Common Issues

**Issue: No entities extracted**
- Text may be too short or lack substantive content
- Check debug log for AI response
- May need to adjust prominence threshold

**Issue: Duplicate entities with different IDs**
- Run entity deduplicator to normalize and reassign IDs
- Check if normalization rules need adjustment

**Issue: Relationships reference non-existent entity IDs**
- Ensure entity registry is loaded before relationship extraction
- Check that relationships are updated after deduplication

**Issue: Low confidence scores**
- Review relationship context in debug logs
- May indicate weak or speculative connections
- Consider filtering relationships with confidence <0.5

---

## Future Enhancements

Potential improvements to the entity extraction system:

1. **Entity Resolution:** More sophisticated matching against external knowledge bases (Wikidata, DBpedia)
2. **Temporal Tracking:** Track how entities and relationships evolve over time
3. **Network Analysis:** Compute centrality measures for entities based on relationship graph
4. **Entity Linking:** Link extracted entities to URLs, social media profiles, etc.
5. **Relationship Inference:** Infer implicit relationships from entity co-occurrence patterns
6. **Quality Scoring:** ML-based quality scores for entity/relationship predictions
7. **Active Learning:** Human-in-the-loop validation to improve extraction accuracy

---

## Related Documentation

- `entity_extraction_schema.json` - Full schema specification with examples
- `backend/schema.json` - Main data schema for archive records
- `docs/SCHEMA_IMPROVEMENTS.md` - Schema evolution and improvements
- `backend/src/rosen_scraper/entity_extractor.py` - Implementation details
- `backend/src/rosen_scraper/entity_deduplicator.py` - Deduplication logic
- `backend/src/rosen_scraper/entity_registry.py` - Registry implementation

---

## Version History

**2.1** (Current)
- Added 5 new relationship types (Owns, Owned By, Founded By, Pioneered, Inspired By)
- Enhanced quality filtering with prominence and confidence thresholds
- Improved entity normalization for organizations

**2.0**
- Migrated to Google Gemini AI from previous extraction method
- Added prominence and confidence scoring
- Implemented entity registry for ID management
- Added comprehensive deduplication system

**1.0**
- Initial entity extraction system
- Basic entity types and relationships
- Manual entity tracking
