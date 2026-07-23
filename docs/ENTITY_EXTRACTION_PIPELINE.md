# Entity extraction pipeline for Jay Rosen's Internet Archive

This document explains the process of extracting entities (people, organizations, concepts, etc.) and relationships from Jay Rosen's social media posts for the digital archive.

---

## What we're doing (plain language)

Jay Rosen's Internet Archive contains ~60,000 social media posts from Twitter/X and Bluesky. To make this content searchable and interconnected, we need to identify:

1. **Who** is mentioned (people like journalists, politicians, media figures)
2. **What organizations** are discussed (news outlets, political parties, tech companies)
3. **What concepts** are explored (journalism concepts like "both sides coverage", "truth sandwich", etc.)
4. **What relationships** exist between these entities

This creates a knowledge graph that powers features like:
- Searching for all posts mentioning a specific person
- Finding connections between concepts and the people who discuss them
- Building network visualizations of Jay Rosen's intellectual world

---

## The problem we're solving

**Before this pipeline:**
- 97.9% of social posts (58,663 records) had **zero entity extraction**
- Only 1,311 article records had entities extracted (via Google Sheets)
- Two disconnected pipelines existed that never merged results

**After this pipeline:**
- All social posts will have extracted entities
- Entities deduplicated against existing 5,160 entities
- Single unified dataset for the archive

---

## Datasets involved

### Input files

| File | Location | Description |
|------|----------|-------------|
| `rosen_social_posts.csv` | `data/social_import/` | 29,187 social posts (Twitter + Bluesky) |
| `rosen_extracted_entities.csv` | `data/social_import/` | 5,160 existing entities from articles |
| `rosen_extracted_relationships.csv` | `data/social_import/` | Existing entity relationships |

### Output files

| File | Location | Description |
|------|----------|-------------|
| `extraction.db` | `data/social_import/` | SQLite database tracking progress |
| `batch_NNN_posts.md` | `data/social_import/` | Posts prepared for each batch |
| `batch_NNN_results.json` | `data/social_import/` | Extracted entities per batch |
| `current_batch.json` | `data/social_import/` | Post IDs for current batch |

### Filtered dataset

Not all 29,187 posts are processed:
- **23,416 posts** pass the content filter (7+ words, 20+ chars)
- Removes retweets, very short posts, and content-less links

---

## Entity types extracted

| Type | ID Prefix | Examples |
|------|-----------|----------|
| Person | P#### | Ken Burns, Anthony Fauci, Margaret Sullivan |
| Organization | O#### | New York Times, CNN, Republican Party |
| Concept | C#### | Truth Sandwich, Both Sides Coverage, Stakes-Based Coverage |
| Location | L#### | Bucks County, Australia |
| Event | E#### | January 6 Capitol Riot, Pennsylvania Primary 2022 |
| Work | W#### | Mueller Report |

---

## Relationship types

- **Mentions** - Entity A mentions Entity B
- **Criticizes** - Entity A critiques Entity B
- **Supports** - Entity A endorses Entity B
- **Affiliated With** - Entity A works for/belongs to Entity B
- **Related To** - General connection
- **Covers** - Journalist/outlet covers topic/event
- **Uses** - Entity employs a concept/method
- **Created** - Entity authored/produced something
- **Involved In** - Entity participated in event

---

## Scripts and tools

### Main processing script

**File:** `backend/scripts/unified_entity_processor.py`

**Commands:**

```bash
# Check current progress
PYTHONPATH=src python3 scripts/unified_entity_processor.py \
  --status --data-dir ../data/social_import

# Prepare next batch of 50 posts
PYTHONPATH=src python3 scripts/unified_entity_processor.py \
  --prepare-batch --batch-size 50 --tier 1 --data-dir ../data/social_import

# Export posts for Claude extraction
PYTHONPATH=src python3 scripts/unified_entity_processor.py \
  --export-for-claude --output ../data/social_import/batch_NNN_posts.md \
  --data-dir ../data/social_import

# Process extracted results back into database
PYTHONPATH=src python3 scripts/unified_entity_processor.py \
  --process-results ../data/social_import/batch_NNN_results.json \
  --data-dir ../data/social_import
```

### Supporting modules

| Module | Purpose |
|--------|---------|
| `extraction_db.py` | SQLite database for tracking processed posts |
| `csv_data_service.py` | Reading/writing CSV data files |
| `entity_registry.py` | Entity deduplication and ID assignment |

---

## Processing workflow (step by step)

### 1. Prepare batch
```bash
--prepare-batch --batch-size 50 --tier 1
```
- Loads all social posts from CSV
- Filters out already-processed posts (via SQLite)
- Applies tier filter (Tier 1 = high engagement posts first)
- Saves 50 post IDs to `current_batch.json`

### 2. Export for Claude
```bash
--export-for-claude --output batch_NNN_posts.md
```
- Reads posts from `current_batch.json`
- Formats each post with ID, date, engagement metrics, and content
- Outputs markdown file ready for Claude to read

### 3. Claude extracts entities
Claude reads the posts and produces JSON:
```json
{
  "post_id": "TWTR-12345",
  "entities": [
    {"entity_type": "Person", "entity_name": "Margaret Sullivan", "role": "Media Critic"}
  ],
  "relationships": [
    {"source": "Margaret Sullivan", "type": "Criticizes", "target": "Both Sides Coverage"}
  ]
}
```

### 4. Process results
```bash
--process-results batch_NNN_results.json
```
- Loads results JSON
- For each entity: checks if it exists in registry (deduplication)
- Assigns new IDs for truly new entities
- Saves to SQLite database
- Marks posts as processed

### 5. Repeat
Continue with next batch until all 23,416 posts are processed.

---

## Tiered processing strategy

Not all posts are equally valuable. We process in priority order:

| Tier | Criteria | Posts | Priority |
|------|----------|-------|----------|
| 1 | High engagement (likes≥5 OR reposts≥2) | ~13,255 | First |
| 2 | Recent (2023+) | ~15,000 | Second |
| 3 | All remaining | ~9,000 | Last |

This ensures the most impactful content is processed first.

---

## Deduplication process

The EntityRegistry maintains a normalized name index:

1. Entity name is normalized (lowercase, stripped)
2. Checked against existing 5,160 entities
3. If match found → reuse existing ID (e.g., P1234)
4. If no match → assign new ID (e.g., P5161)

This prevents duplicates like "New York Times" and "The New York Times" getting separate IDs.

---

## Progress tracking

SQLite database (`extraction.db`) stores:

```sql
-- Track which posts are processed
CREATE TABLE processed_records (
    record_id TEXT PRIMARY KEY,
    status TEXT,
    processed_at TEXT,
    entity_count INTEGER,
    relationship_count INTEGER
);

-- Store extracted entities
CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    entity_type TEXT,
    name TEXT,
    ...
);

-- Store relationships
CREATE TABLE relationships (
    id INTEGER PRIMARY KEY,
    source_entity TEXT,
    relationship_type TEXT,
    target_entity TEXT,
    ...
);
```

**Why SQLite?**
- ACID transactions ensure no data loss on crash
- Resume capability: can stop and restart anytime
- Query progress without parsing files

---

## Current progress (as of January 31, 2026)

| Metric | Value |
|--------|-------|
| Posts processed | 1,350 |
| Posts remaining | 22,066 |
| Progress | 5.8% |
| New entities | 425 |
| Relationships | 492 |
| Batches completed | 27 |

### Entity breakdown
- Person: 148
- Organization: 117
- Concept: 90
- Location: 41
- Event: 19
- Work: 10

---

## Why use Claude instead of Gemini API?

**Original plan:** Use Gemini 2.0 Flash API
- Estimated cost: ~$120 for full dataset
- Rate limits: 5 parallel workers with 2s delays

**Current approach:** Use Claude via Ralph Loop
- **Zero API cost**
- Higher quality extraction (Claude understands journalism context)
- Interactive refinement of extraction approach
- Can adjust prompts mid-run based on results

---

## How to resume processing

```bash
# Navigate to backend
cd /home/jamditis/projects/rosen-frontend/backend

# Check status
PYTHONPATH=src python3 scripts/unified_entity_processor.py \
  --status --data-dir ../data/social_import

# Start Ralph Loop for automated iteration
/ralph-loop

# Each iteration: prepare → export → extract → process → repeat
```

---

## Quality observations

After processing 27 batches, the extraction captures key themes from Jay Rosen's work:

**Frequently extracted concepts:**
- Both Sides Coverage
- Truth Sandwich
- Stakes-Based Coverage
- Truthful Not Neutral
- False Equivalence
- View From Nowhere

**Notable people identified:**
- Media critics: Margaret Sullivan, Dahlia Lithwick, Carl Bernstein
- Journalists: Chris Hayes, Jonathan Lemire, Christiane Amanpour
- Media executives: Joe Kahn, Dean Baquet, Jeff Bezos, Will Lewis

**Deduplication rate:** ~50-55% of extracted entities match existing IDs, indicating good overlap with article entities.

---

## Next steps

1. Continue Ralph Loop iterations until all 23,416 posts processed
2. Export final merged entity/relationship CSVs
3. Validate schema compliance
4. Merge with main archive data
5. Update frontend to query expanded entity database

---

## Files reference

```
rosen-frontend/
├── backend/
│   ├── scripts/
│   │   └── unified_entity_processor.py   # Main CLI
│   └── src/rosen_scraper/
│       ├── extraction_db.py              # SQLite layer
│       ├── csv_data_service.py           # CSV I/O
│       └── entity_registry.py            # Deduplication
├── data/
│   └── social_import/                    # Working directory
│       ├── rosen_social_posts.csv        # Input posts
│       ├── rosen_extracted_entities.csv  # Existing entities
│       ├── extraction.db                 # Progress database
│       ├── current_batch.json            # Current batch IDs
│       └── batch_*_results.json          # Extraction results
└── docs/
    └── ENTITY_EXTRACTION_PIPELINE.md     # This file
```
