# Production readiness implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship Jay Rosen's Internet Archive with 100% data completeness, full entity coverage, and cross-browser testing by end of week Feb 23, 2026.

**Architecture:** Five parallel workstreams organized around entity extraction as the critical path. Batch API processing (Anthropic/OpenAI/Gemini) replaces the manual Ralph Loop for entity extraction and metadata gap-filling. Data fixes and UI work happen in parallel. Testing and deployment happen after data is finalized.

**Tech stack:** Python (backend pipeline), Node.js (data export, tests), Anthropic/OpenAI/Gemini Batch APIs, SQLite (extraction.db), React/HTM (frontend)

---

## Task 1: Push pending commits and set baseline

**Files:**
- None modified

**Step 1: Push 2 pending commits to origin/main**

```bash
cd /c/Users/amdit/OneDrive/Desktop/Crimes/playground/rosen-frontend
git push origin main
```

Expected: 2 commits pushed successfully.

**Step 2: Run full test suite to establish baseline**

```bash
npm test
```

Expected: All 8 test files pass. Record any existing failures.

**Step 3: Check entity extraction status**

```bash
cd backend
PYTHONPATH=src python scripts/unified_entity_processor.py --status --data-dir ../data/social_import
```

Expected: ~9,850/23,416 posts processed (42.1%). Record exact numbers.

**Step 4: Commit baseline status**

No code changes — just verify starting state.

---

## Task 2: Build automated batch entity extraction script

**Files:**
- Create: `backend/scripts/batch_entity_extraction.py`
- Read: `backend/scripts/unified_entity_processor.py` (reference for DB schema, entity format)
- Read: `backend/src/rosen_scraper/extraction_db.py` (DB interface)
- Read: `backend/src/rosen_scraper/entity_registry.py` (dedup logic)
- Read: `backend/docs/ENTITY_SCHEMA.md` (full schema reference)

This is the most critical task. Build a script that:
1. Reads unprocessed social posts from CSV (filtering same as `unified_entity_processor.py`)
2. Formats them into batch requests for the Anthropic Batch API (or Gemini/OpenAI as fallback)
3. Submits the batch
4. Polls for completion
5. Parses results and saves to `extraction.db` using the existing `ExtractionDB` class
6. Handles resume (skip already-processed posts)

### Schema reference: entity extraction

The batch API must request entities and relationships matching the existing schema exactly.

**Entity types** (6 types, each with a prefix for IDs):

| Type | ID prefix | Key fields |
|------|-----------|------------|
| Person | `P` | entity_name, role (→ stored as `role_or_description`), affiliation, prominence_score (1-10) |
| Organization | `O` | entity_name, org_type (→ `role_or_description`), prominence_score |
| Work | `W` | entity_name, work_type (→ `role_or_description`), author, publication_year, prominence_score |
| Concept | `C` | entity_name, originator, related_concepts, prominence_score |
| Event | `E` | entity_name, event_type (→ `role_or_description`), event_date, location, significance, prominence_score |
| Location | `L` | entity_name, location_type (→ `role_or_description`), relevance, prominence_score |

**Relationship types** (15 types): Mentions, Criticizes, Cites, Discusses, Expands On, Affiliated With, Published In, Originated By, Occurred At, Supports, Owns, Owned By, Founded By, Pioneered, Inspired By

**Relationship fields:**
- `source_entity_id`, `target_entity_id` (temporary IDs from AI, remapped by EntityRegistry)
- `relationship_type` (must be one of the 15 types above)
- `context_snippet` (max 200 chars, quote from source text)
- `confidence_score` (0.0-1.0)

**DB schema (`extraction.db` tables):**

```sql
-- entities table
entity_id TEXT NOT NULL UNIQUE,
entity_type TEXT NOT NULL,        -- Person, Organization, Concept, Work, Event, Location
entity_name TEXT NOT NULL,
normalized_name TEXT,
role_or_description TEXT,
affiliation TEXT,
prominence_score INTEGER,
first_mention_record_id TEXT,
total_mentions INTEGER DEFAULT 1,
related_entities TEXT,
notes TEXT,
created_at TEXT NOT NULL

-- relationships table
relationship_id TEXT,
source_entity_id TEXT NOT NULL,
target_entity_id TEXT NOT NULL,
relationship_type TEXT NOT NULL,   -- One of the 15 types
description TEXT,
evidence TEXT,
source_record_id TEXT,
strength TEXT,
temporal_context TEXT,
notes TEXT,
created_at TEXT NOT NULL

-- processed_records table
record_id TEXT PRIMARY KEY,
status TEXT NOT NULL DEFAULT 'completed',
processed_at TEXT NOT NULL,
entity_count INTEGER DEFAULT 0,
relationship_count INTEGER DEFAULT 0,
error_msg TEXT
```

**Post filtering** (from `unified_entity_processor.py`):
- Minimum 7 words, 20 characters
- Three priority tiers: tier 1 (likes >= 5 OR reposts >= 2), tier 2 (2023+), tier 3 (all remaining)
- Skip posts already in `processed_records` table

**Step 1: Write test for batch request formatting**

Create `backend/tests/test_batch_extraction.py`:

```python
"""Tests for batch entity extraction script."""
import json
import pytest
from pathlib import Path


def test_format_post_for_extraction():
    """Test that a social post is formatted correctly for API extraction."""
    from scripts.batch_entity_extraction import format_post_for_extraction

    post = {
        "post_id": "TEST-001",
        "content": "Jay Rosen argues that the view from nowhere is journalism's biggest problem.",
        "platform": "Twitter",
        "date": "2024-01-15",
        "likes": "42",
        "reposts": "10"
    }

    result = format_post_for_extraction(post)

    # Anthropic Batch API format
    assert result["custom_id"] == "TEST-001"
    assert result["params"]["model"] is not None
    assert "messages" in result["params"]
    # System prompt should reference entity types and relationship types
    system_or_messages = json.dumps(result["params"])
    assert "Person" in system_or_messages
    assert "Concept" in system_or_messages
    assert "relationship" in system_or_messages.lower()


def test_parse_extraction_response():
    """Test parsing of API response into entities and relationships."""
    from scripts.batch_entity_extraction import parse_extraction_response

    # Response should match ENTITY_SCHEMA.md format
    response = {
        "entities": [
            {
                "entity_id": "P001",
                "entity_type": "Person",
                "entity_name": "Jay Rosen",
                "role": "Journalism professor",
                "affiliation": "New York University",
                "prominence_score": 10
            },
            {
                "entity_id": "C001",
                "entity_type": "Concept",
                "entity_name": "View from Nowhere",
                "originator": "Jay Rosen",
                "prominence_score": 9
            }
        ],
        "relationships": [
            {
                "source_entity_id": "P001",
                "target_entity_id": "C001",
                "relationship_type": "Pioneered",
                "context_snippet": "Rosen argues that the view from nowhere is journalism's biggest problem",
                "confidence_score": 0.95
            }
        ]
    }

    entities, relationships = parse_extraction_response(response, "TEST-001")

    assert len(entities) == 2
    assert len(relationships) == 1
    assert entities[0]["entity_name"] == "Jay Rosen"
    assert entities[0]["entity_type"] == "Person"
    assert relationships[0]["source_entity_id"] == "P001"
    assert relationships[0]["relationship_type"] == "Pioneered"
    assert relationships[0]["source_record_id"] == "TEST-001"


def test_parse_extraction_response_validates_types():
    """Test that invalid entity types and relationship types are rejected."""
    from scripts.batch_entity_extraction import parse_extraction_response

    response = {
        "entities": [
            {"entity_id": "X001", "entity_type": "InvalidType", "entity_name": "Test", "prominence_score": 5}
        ],
        "relationships": [
            {
                "source_entity_id": "P001",
                "target_entity_id": "C001",
                "relationship_type": "InvalidRelType",
                "confidence_score": 0.9
            }
        ]
    }

    entities, relationships = parse_extraction_response(response, "TEST-002")

    assert len(entities) == 0  # Invalid type rejected
    assert len(relationships) == 0  # Invalid relationship type rejected
```

**Step 2: Run test to verify it fails**

```bash
cd backend
python -m pytest tests/test_batch_extraction.py -v
```

Expected: ImportError — module doesn't exist yet.

**Step 3: Implement `batch_entity_extraction.py`**

Key design decisions:
- Use Anthropic Batch API as primary (50% cost discount, 24hr completion window)
- Same extraction prompt style as `unified_entity_processor.py` uses for Ralph Loop
- Same DB schema — write to `extraction.db` via `ExtractionDB`
- Same dedup logic — use `EntityRegistry` for name matching
- Batch size: 1,000 posts per batch submission (Anthropic allows up to 10,000)
- Resume: query `ExtractionDB.get_processed_ids()` to skip already-done posts
- Validate all entity types against the 6 valid types (Person, Organization, Concept, Work, Event, Location)
- Validate all relationship types against the 15 valid types
- Map type-specific fields (role, org_type, work_type, etc.) to `role_or_description` for DB storage

The extraction prompt must instruct the model to return JSON matching this format:
```json
{
  "entities": [
    {
      "entity_id": "P001",
      "entity_type": "Person",
      "entity_name": "Jay Rosen",
      "role": "Journalism professor",
      "affiliation": "New York University",
      "prominence_score": 10
    }
  ],
  "relationships": [
    {
      "source_entity_id": "P001",
      "target_entity_id": "C001",
      "relationship_type": "Pioneered",
      "context_snippet": "direct quote or close paraphrase from text",
      "confidence_score": 0.95
    }
  ]
}
```

The script should support:
```bash
# Submit a batch of unprocessed posts
python scripts/batch_entity_extraction.py --submit --batch-size 1000 --provider anthropic

# Check batch status
python scripts/batch_entity_extraction.py --status --batch-id <id>

# Process completed batch results
python scripts/batch_entity_extraction.py --process --batch-id <id>

# Full auto: submit, poll, process (runs until all posts done)
python scripts/batch_entity_extraction.py --auto --provider anthropic
```

**Step 4: Run tests to verify they pass**

```bash
cd backend
python -m pytest tests/test_batch_extraction.py -v
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add backend/scripts/batch_entity_extraction.py backend/tests/test_batch_extraction.py
git commit -m "feat: add automated batch entity extraction via Anthropic/Gemini/OpenAI Batch APIs"
```

---

## Task 3: Submit first entity extraction batch

**Files:**
- Run: `backend/scripts/batch_entity_extraction.py`
- Read: `backend/.env` (API keys)

**Step 1: Verify API key is configured**

Check `.env` for `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`, `OPENAI_API_KEY`).

**Step 2: Submit first batch**

```bash
cd backend
PYTHONPATH=src python scripts/batch_entity_extraction.py --submit --batch-size 1000 --provider anthropic
```

Expected: Batch submitted, batch ID printed. Record the batch ID.

**Step 3: Verify submission**

```bash
PYTHONPATH=src python scripts/batch_entity_extraction.py --status --batch-id <id>
```

Expected: Status shows "in_progress" or "validating".

**Step 4: No commit needed — this is an operational step**

Note: After this, continue to tasks 4-8 while batch processes. Return to check batch status periodically and submit more batches as needed.

---

## Task 4: Build metadata gap-filling script

**Files:**
- Create: `backend/scripts/batch_metadata_filler.py`
- Read: `backend/src/rosen_scraper/categorizer.py` (reference for categories/concepts taxonomy)
- Modify: `data/archive_records-public.csv` (output)

Build a script that uses batch APIs to fill:
- 76 records missing categories
- 335 records missing key_concepts

**Step 1: Write test for metadata extraction**

Create `backend/tests/test_metadata_filler.py`:

```python
"""Tests for batch metadata gap-filling."""
import csv
from pathlib import Path


def test_find_records_missing_categories():
    """Test that we correctly identify records missing categories."""
    from scripts.batch_metadata_filler import find_records_missing_field

    # Read actual CSV
    csv_path = Path(__file__).parent.parent.parent / "data" / "archive_records-public.csv"
    missing = find_records_missing_field(csv_path, "categories", exclude_social=True)

    # Should find approximately 76 records (as documented)
    assert len(missing) > 50, f"Expected ~76 missing categories, found {len(missing)}"
    assert len(missing) < 150, f"Expected ~76 missing categories, found {len(missing)}"


def test_find_records_missing_concepts():
    """Test that we correctly identify records missing key_concepts."""
    from scripts.batch_metadata_filler import find_records_missing_field

    csv_path = Path(__file__).parent.parent.parent / "data" / "archive_records-public.csv"
    missing = find_records_missing_field(csv_path, "key_concepts", exclude_social=True)

    # Should find approximately 335 records
    assert len(missing) > 250, f"Expected ~335 missing concepts, found {len(missing)}"
    assert len(missing) < 500, f"Expected ~335 missing concepts, found {len(missing)}"
```

**Step 2: Run test to verify it fails**

```bash
cd backend
python -m pytest tests/test_metadata_filler.py -v
```

**Step 3: Implement `batch_metadata_filler.py`**

The script should:
1. Read `archive_records-public.csv` and find records with empty `categories` or `key_concepts`
2. For each record, format a batch request with title + URL + summary + excerpt
3. Submit via batch API (Anthropic/Gemini/OpenAI)
4. Parse results into valid categories and concepts from the taxonomy
5. Update the CSV in place
6. Generate a spot-check report (random 10-15% sample for review)

### Schema reference: record metadata taxonomy (from `backend/schema.json`)

**Valid thematic categories** (stored in CSV `thematic_categories` field as pipe-separated):
1. Press & Media Criticism
2. Journalism Theory & Practice
3. Journalism Education
4. Politics & Democracy
5. Technology & Digital Media
6. Audience & Public Engagement

Each record should have 1-3 categories. The batch prompt should include the category descriptions from schema.json to guide classification.

**Valid key concepts** (stored in CSV `key_concepts` field as pipe-separated):
- View from Nowhere
- Church of the Savvy
- The People Formerly Known as the Audience
- Parity Product
- Verification in reverse
- He said/she said journalism
- Audience atomization overcome
- The Production of Innocence
- Horse-race journalism
- False balance
- The Citizens' Agenda
- Not the odds but the stakes
- Mindcasting

Each record should have 0-2 concepts — only if they are explicitly discussed in the content. Don't force concepts onto records that don't discuss them.

**Valid eras** (stored in CSV `era` field):
- Early Career & Public Journalism (1990-1999)
- Blogging Launch & Digital Disruption (2000-2004)
- Peak Blogging & Citizen Journalism (2005-2009)
- Social Media & Financial Crisis (2010-2015)
- Trump Era & Democratic Crisis (2016-2020)
- Platform Transition & Future Models (2021-Present)

**Valid scopes** (stored in CSV `scope` field):
- Theoretical, Commentary/Critique, Historical Analysis, Case Study, Pedagogical, Personal Reflection

**CSV field format:** The `thematic_categories` and `key_concepts` fields use pipe (`|`) separation in the CSV, e.g., `Press & Media Criticism|Journalism Theory & Practice`

```bash
# Find and report gaps
python scripts/batch_metadata_filler.py --scan

# Submit batch for categories
python scripts/batch_metadata_filler.py --fill categories --provider anthropic

# Submit batch for concepts
python scripts/batch_metadata_filler.py --fill key_concepts --provider anthropic

# Process results and update CSV
python scripts/batch_metadata_filler.py --apply --batch-id <id>

# Generate spot-check report
python scripts/batch_metadata_filler.py --spot-check --sample-pct 15
```

**Step 4: Run tests**

```bash
cd backend
python -m pytest tests/test_metadata_filler.py -v
```

**Step 5: Commit**

```bash
git add backend/scripts/batch_metadata_filler.py backend/tests/test_metadata_filler.py
git commit -m "feat: add batch metadata gap-filling via AI batch APIs"
```

---

## Task 5: Fix known data quality issues

**Files:**
- Modify: `data/archive_records-public.csv`
- Modify: `frontend/constants.js` (featured work #6)
- Modify: `data/extracted_relationships.csv` (remove 36 duplicates)

**Step 1: Write test for featured work #6**

Add to `tests/data-integrity.test.js` or create a focused test:

```javascript
test('featured work #6 should link to correct record', async () => {
  // Import constants to check FEATURED_WORKS
  // Work #6 (index 5) should reference RECORD-00616
  const constants = await import('../frontend/constants.js');
  const work6 = constants.FEATURED_WORKS[5];
  assert.ok(work6.link, 'Featured work #6 should have a link');
  assert.ok(!work6.link.includes('berks.psu.edu'), 'Featured work #6 should not use broken PSU URL');
});
```

**Step 2: Fix featured work #6 URL in `frontend/constants.js`**

Find the FEATURED_WORKS entry at index 5 (id: 'feat-6'). The current `link` is `https://berks.psu.edu/sites/berks/files/campus/rosen.pdf` which returns 404. Replace with the archive URL for RECORD-00616 or find the correct live URL for "Public Journalism: A Case for Public Scholarship."

**Step 3: Fix RECORD-00068 in CSV**

Open `data/archive_records-public.csv`, find RECORD-00068. Fix:
- Title: Should match the actual content (not "Running Records for Classroom Teachers")
- URL: Should point to correct content
- Era: Fill in the missing era field

**Step 4: Remove 36 duplicate relationships**

```bash
cd data
python -c "
import csv
from collections import Counter

with open('extracted_relationships.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# Find duplicates by (source_id, target_id, relationship_type)
seen = set()
unique = []
dupes = 0
for row in rows:
    key = (row.get('source_entity_id',''), row.get('target_entity_id',''), row.get('relationship_type',''))
    if key not in seen:
        seen.add(key)
        unique.append(row)
    else:
        dupes += 1

print(f'Removed {dupes} duplicate relationships ({len(rows)} -> {len(unique)})')

with open('extracted_relationships.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(unique)
"
```

**Step 5: Regenerate JSON and run tests**

```bash
node data/export-archive-data.js
npm test
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add data/archive_records-public.csv frontend/constants.js data/extracted_relationships.csv
git commit -m "fix: resolve known data quality issues (featured work #6, RECORD-00068, duplicate relationships)"
```

---

## Task 6: Process entity extraction batches and submit more

**Files:**
- Run: `backend/scripts/batch_entity_extraction.py`
- Modify: `data/social_import/extraction.db` (updated by script)

This is an ongoing operational task. Repeat until 100% complete:

**Step 1: Check batch status**

```bash
cd backend
PYTHONPATH=src python scripts/batch_entity_extraction.py --status --batch-id <latest-id>
```

**Step 2: If complete, process results**

```bash
PYTHONPATH=src python scripts/batch_entity_extraction.py --process --batch-id <id>
```

**Step 3: Check overall progress**

```bash
PYTHONPATH=src python scripts/unified_entity_processor.py --status --data-dir ../data/social_import
```

**Step 4: Submit next batch**

```bash
PYTHONPATH=src python scripts/batch_entity_extraction.py --submit --batch-size 1000 --provider anthropic
```

**Step 5: If one provider is slow, split across providers**

Submit different batches to different providers to parallelize:
```bash
# Anthropic batch
PYTHONPATH=src python scripts/batch_entity_extraction.py --submit --batch-size 1000 --provider anthropic

# Gemini batch (different posts)
PYTHONPATH=src python scripts/batch_entity_extraction.py --submit --batch-size 1000 --provider gemini
```

Repeat steps 1-5 until all 23,416 posts are processed.

---

## Task 7: Submit and process metadata gap-filling batches

**Files:**
- Run: `backend/scripts/batch_metadata_filler.py`
- Modify: `data/archive_records-public.csv`

**Step 1: Scan for gaps**

```bash
cd backend
PYTHONPATH=src python scripts/batch_metadata_filler.py --scan
```

Expected: ~76 missing categories, ~335 missing concepts.

**Step 2: Submit categories batch**

```bash
PYTHONPATH=src python scripts/batch_metadata_filler.py --fill categories --provider anthropic
```

**Step 3: Submit concepts batch**

```bash
PYTHONPATH=src python scripts/batch_metadata_filler.py --fill key_concepts --provider anthropic
```

**Step 4: Process results when batches complete**

```bash
PYTHONPATH=src python scripts/batch_metadata_filler.py --apply --batch-id <categories-id>
PYTHONPATH=src python scripts/batch_metadata_filler.py --apply --batch-id <concepts-id>
```

**Step 5: Generate spot-check report**

```bash
PYTHONPATH=src python scripts/batch_metadata_filler.py --spot-check --sample-pct 15
```

Review the report. Fix any obvious misclassifications.

**Step 6: Regenerate JSON and test**

```bash
cd ..
node data/export-archive-data.js
npm test
```

**Step 7: Commit**

```bash
git add data/archive_records-public.csv
git commit -m "feat: fill missing categories and key_concepts via batch AI processing"
```

---

## Task 8: Audit and resolve 24 duplicate URL groups

**Files:**
- Modify: `data/archive_records-public.csv`

**Step 1: Generate duplicate URL report**

```bash
cd data
python -c "
import csv
from collections import defaultdict

with open('archive_records-public.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# Group non-social records by URL
url_groups = defaultdict(list)
for row in rows:
    if row.get('type') != 'social' and row.get('url'):
        url_groups[row['url']].append(row['id'])

dupes = {url: ids for url, ids in url_groups.items() if len(ids) > 1}
print(f'Found {len(dupes)} duplicate URL groups ({sum(len(v) for v in dupes.values())} total records)')
for url, ids in sorted(dupes.items()):
    print(f'  {url}')
    for id in ids:
        print(f'    {id}')
"
```

**Step 2: For each group, decide: merge, delete, or keep both**

Review each duplicate URL group. For each:
- If true duplicate: keep the more complete record, delete the other
- If different editions/versions: keep both, differentiate titles
- If data entry error: fix the wrong URL

**Step 3: Apply fixes to CSV**

Edit `data/archive_records-public.csv` to resolve each group.

**Step 4: Regenerate and test**

```bash
node data/export-archive-data.js
npm test
```

**Step 5: Commit**

```bash
git add data/archive_records-public.csv
git commit -m "fix: resolve 24 duplicate URL groups in archive records"
```

---

## Task 9: Run entity deduplication

**Files:**
- Run: `data/social_import/cleanup_extraction_db.py`
- Modify: `data/social_import/extraction.db`
- Modify: `data/extracted_entities.csv`
- Modify: `data/extracted_relationships.csv`

**Prerequisite:** Entity extraction (task 6) should be at 75%+ before starting this.

**Step 1: Run cleanup script on extraction DB**

```bash
cd data/social_import
python cleanup_extraction_db.py
```

This normalizes names, deduplicates entities, and normalizes relationship types.

**Step 2: Check dedup results**

```bash
python -c "
import sqlite3
conn = sqlite3.connect('extraction.db')
entities = conn.execute('SELECT COUNT(*) FROM entities').fetchone()[0]
relationships = conn.execute('SELECT COUNT(*) FROM relationships').fetchone()[0]
print(f'After dedup: {entities} entities, {relationships} relationships')

# Check for remaining duplicates
dupes = conn.execute('''
    SELECT normalized_name, entity_type, COUNT(*) as c
    FROM entities
    GROUP BY normalized_name, entity_type
    HAVING c > 1
''').fetchall()
print(f'Remaining duplicate groups: {len(dupes)}')
conn.close()
"
```

Expected: Duplicate count should drop from 135 groups to near zero.

**Step 3: Export entities and relationships from DB to CSVs**

Write a script or use existing export to generate:
- `data/extracted_entities.csv`
- `data/extracted_relationships.csv`

These should merge the social import entities with the existing archive entities.

**Step 4: Regenerate JSON and test**

```bash
cd ../..
node data/export-archive-data.js
npm test
```

**Step 5: Commit**

```bash
git add data/extracted_entities.csv data/extracted_relationships.csv data/social_import/extraction.db
git commit -m "feat: deduplicate entities and rebuild relationship graph"
```

---

## Task 10: Verify 229 unverified records

**Files:**
- Modify: `data/archive_records-public.csv`

**Step 1: Identify unverified records**

```bash
cd data
python -c "
import csv
with open('archive_records-public.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    unverified = [r for r in reader if r.get('verified','').upper() != 'TRUE' and r.get('type') != 'social']
print(f'Unverified records: {len(unverified)}')
for r in unverified[:20]:
    print(f'  {r[\"id\"]}: {r.get(\"title\",\"\")} ({r.get(\"type\",\"\")})')
"
```

**Step 2: Batch verify via URL checking**

For each unverified record with a URL, check if the URL is live and content matches.
Use a batch approach — can be scripted with `requests` or use firecrawl for JavaScript-heavy sites.

**Step 3: Mark verified records in CSV**

Set `verified=TRUE` for records confirmed to be correct.

**Step 4: Regenerate and test**

```bash
node data/export-archive-data.js
npm test
```

**Step 5: Commit**

```bash
git add data/archive_records-public.csv
git commit -m "fix: verify 229 previously unverified archive records"
```

---

## Task 11: Add "21 things" branding to dissertation landing page

**Files:**
- Modify: `dissertation/index.html`
- Read: `docs/21-STRUCTURE-PROPOSAL.md` (framing text reference)

**Step 1: Read the current landing page structure**

Read `dissertation/index.html` and identify:
- The "Coming Soon" section (to replace)
- Where to add "21" narrative framing

**Step 2: Replace "Coming Soon" section with "21 things" branding**

Add framing text like:
> *21 key ideas. 21 essential quotations. 21 featured works. 21 milestones. The Impossible Press was written in 1986. This archive traces how one dissertation became a life's work.*

Keep it light — a short section with the framing text and links to the relevant tools (glossary, excerpts, timeline, comparison, context).

**Step 3: Add "21" callouts to individual tool pages**

For each tool that has 21 items, add a subtle heading or intro line noting the count:
- `dissertation/glossary/index.html` — "29 terms" (exceeds 21, note this)
- `dissertation/excerpts/index.html` — "21 annotated passages"
- `dissertation/comparison/index.html` — "21 then-and-now comparisons"
- `dissertation/context/index.html` — "21 pieces of context from 1986"

**Step 4: Test locally**

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/dissertation/` and verify branding looks right.

**Step 5: Commit**

```bash
git add dissertation/
git commit -m "feat: add '21 things' branding to dissertation landing page"
```

---

## Task 12: Final data export and regeneration

**Files:**
- Run: `data/export-archive-data.js`
- Verify: `data/archive-core.json`, `data/archive-details.json`, `data/archive-entities.json`, `data/archive-data.json`

**Prerequisite:** All data tasks (2-10) complete. Entity extraction at 100%.

**Step 1: Final entity export from extraction DB**

Make sure all social import entities are merged into the main CSVs.

**Step 2: Regenerate all JSON**

```bash
node data/export-archive-data.js
```

**Step 3: Verify file sizes**

```bash
ls -la data/archive-*.json
```

Expected approximate sizes:
- `archive-core.json`: ~11 MB
- `archive-details.json`: ~12 MB
- `archive-entities.json`: ~1.1 MB (will be larger with full entity extraction)
- `archive-data.json`: ~26 MB

**Step 4: Run full test suite**

```bash
npm test
```

Expected: All 8 test files pass with zero failures.

**Step 5: Commit**

```bash
git add data/archive-*.json
git commit -m "feat: regenerate all JSON with complete entity extraction and metadata"
```

---

## Task 13: Cross-browser and mobile testing

**Files:**
- None modified (testing only)

**Step 1: Start local server**

```bash
python3 -m http.server 8000
```

**Step 2: Chrome desktop testing**

Test each route:
- `http://localhost:8000` — Archive main view. Search, filter by era/category, click records.
- `http://localhost:8000#folders` — Folder view. Browse categories.
- `http://localhost:8000#explorer` — Entity network. Verify nodes render, click interactions work.
- `http://localhost:8000#entities` — Entity browser. Search entities, verify counts.
- `http://localhost:8000#dissertation` — Mind map. Click nodes, expand/collapse.
- `http://localhost:8000#about` — About page. Verify content.
- `http://localhost:8000#analytics` — Analytics dashboard. Verify charts render.
- `http://localhost:8000?record=RECORD-00001` — Deep link. Verify modal opens.

**Step 3: Firefox testing**

Repeat step 2 in Firefox. Focus on:
- CSS rendering differences
- Canvas/WebGL (Explorer)
- ES module import compatibility

**Step 4: Safari testing (if available)**

Same routes. Focus on:
- Import map support
- CSS backdrop-filter

**Step 5: Edge testing**

Same routes. Should match Chrome behavior (same engine).

**Step 6: Mobile testing**

On phone or browser dev tools responsive mode:
- Test at 375px width (iPhone SE)
- Test at 768px width (iPad)
- Verify sidebar collapses
- Verify modals are scrollable
- Verify touch targets are large enough

**Step 7: Document any bugs found**

Create issues or fix in-place for anything broken.

---

## Task 14: Link and CDN verification

**Files:**
- None modified (verification only)

**Step 1: Verify CDN dependencies load**

Check that all CDN imports in `index.html` resolve:
- React 18 from esm.sh
- HTM from esm.sh
- Tailwind CSS
- PapaParse
- Lucide React
- sql.js

**Step 2: Verify external links**

Check all external URLs referenced in the archive (featured works, record URLs, dissertation PDFs).

Use a script or manual spot-check of 78 external URLs.

**Step 3: Verify Git LFS files**

```bash
git lfs ls-files
```

Confirm dissertation PDFs are tracked and accessible.

---

## Task 15: Production deployment

**Files:**
- Modify: `index.html` (version bump)
- Modify: All `.js` files with `?v=` imports (version bump)

**Prerequisite:** All previous tasks complete. All tests passing.

**Step 1: Bump version strings**

Update `?v=3.2.0` to `?v=3.3.0` (or whatever the next version is) across all imports. Use the `/check-versions` skill to find all version references.

**Step 2: Verify production paths**

Confirm all paths use `/j/rosen-archive/` prefix for production. Check `App.js` auto-detection logic.

**Step 3: Run final test suite**

```bash
npm test
```

**Step 4: FTP upload**

Upload to `pressthink.org/j/rosen-archive/`:
- `index.html`
- `frontend/`
- `dissertation/`
- `features/`
- `data/` (JSON files only — not CSVs, not extraction.db)
- `shared-styles.css`
- `favicon.ico`

**Step 5: Post-deploy verification**

Open `https://pressthink.org/j/rosen-archive/` and smoke test:
- Page loads without console errors
- Data loads (check network tab)
- Search works
- Entity Explorer renders
- Dissertation tools open
- Deep links work

**Step 6: Commit version bump**

```bash
git add -A
git commit -m "chore: bump version to 3.3.0 for production deployment"
git push origin main
```

---

## Task dependency graph

```
Task 1 (baseline) ─┬─→ Task 2 (build batch extraction) → Task 3 (submit batches) → Task 6 (process batches, ongoing)
                    ├─→ Task 4 (build metadata filler) → Task 7 (submit metadata batches)
                    ├─→ Task 5 (fix known issues)
                    └─→ Task 8 (duplicate URLs)

Task 6 (extraction 75%+) → Task 9 (entity dedup)

Task 7 (metadata done) ─┬─→ Task 10 (verify records)
Task 9 (dedup done) ─────┤
                          └─→ Task 12 (final data export)

Task 5 + Task 11 ("21 things") can run anytime

Task 12 (final export) → Task 13 (cross-browser testing) → Task 14 (link verification) → Task 15 (deploy)
```

## Execution schedule

| Day | Tasks | Notes |
|-----|-------|-------|
| Day 1 (Sat Feb 14) | 1, 2, 3, 4, 5 | Build tools, fix known issues, start extraction |
| Day 2 (Sun Feb 15) | 6, 7, 8 | Submit more batches, fix duplicates, metadata |
| Day 3 (Mon Feb 16) | 6, 7, 10 | Process results, verify records |
| Day 4 (Tue Feb 17) | 6, 9 | Extraction continuing, start dedup |
| Day 5 (Wed Feb 18) | 6, 9, 11 | Extraction continuing, dedup, "21 things" UI |
| Day 6 (Thu Feb 19) | 6, 12 | Extraction finishing, final export |
| Day 7 (Fri Feb 20) | 12, 13 | Final export, testing |
| Day 8 (Sat Feb 21) | 13, 14 | Testing, link verification |
| Day 9 (Sun Feb 22) | 15 | Deploy |
