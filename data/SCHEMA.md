# Jay Rosen's Internet Archive - Data Schema

This document describes the data formats used in Jay Rosen's Internet Archive, following open web principles of transparency and interoperability.

## Overview

The archive uses JSON and CSV formats for data storage, with RSS and OPML for syndication. All formats are standard, documented, and machine-readable.

| Format | File | Purpose |
|--------|------|---------|
| JSON | `archive-data.json` | Full archive data |
| JSON | `archive-core.json` | Lightweight card data |
| JSON | `archive-details.json` | Full record details |
| JSON | `archive-entities.json` | Entity/relationship data |
| CSV | `archive_records-public.csv` | Source archive records |
| CSV | `authored-excerpts.csv` | Optional human-authored summary overrides, keyed by `record_id` (#309) |
| CSV | `extracted_entities.csv` | Extracted entities |
| CSV | `extracted_relationships.csv` | Entity relationships |
| RSS 2.0 | `feeds/*.xml` | Syndication feeds |
| OPML 2.0 | `feeds/*.opml` | Outline/subscription lists |

---

## Archive Record Schema

Each record in the archive represents a piece of Jay Rosen's work.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique identifier. Prefix marks the source: `RECORD-`, `THREAD-`, `BSKY-`, `TWTR-`, `TUMBLR-`, `CLIP-`, `dissertation-` (e.g., `RECORD-00001`, `TWTR-15437`) |
| `title` | string | ✓ | Title of the work |
| `author` | string | ✓ | Author name (usually "Jay Rosen") |
| `date` | string | ✓ | Publication date (ISO 8601: `YYYY-MM-DD`) |
| `year` | string | | Year extracted from date |
| `era` | string | | Time period classification |
| `pub` | string | | Original publication/platform |
| `url` | string | ✓ | URL to original content |
| `summary` | string | | Description or excerpt. A human-authored excerpt in `authored-excerpts.csv` for this record's id overrides it (#309) |
| `quote` | string | | Notable pull quote |
| `categories` | array | | Thematic categories |
| `concepts` | array | | Key concepts mentioned |
| `tags` | array | | Associated tags/people |
| `verified` | boolean | | Data quality verified |
| `type` | string | | Record type: `article`, `social`, `Dissertation` |
| `relatedIds` | array | | IDs of related records/entities |
| `thread_data` | object | | Thread structure (for THREAD-* records) |

### Example Record

```json
{
  "id": "RECORD-00042",
  "title": "The View from Nowhere: Questions and Answers",
  "author": "Jay Rosen",
  "date": "2010-11-10",
  "year": "2010",
  "era": "View from Nowhere (10s)",
  "pub": "PressThink",
  "url": "https://pressthink.org/2010/11/the-view-from-nowhere-questions-and-answers/",
  "summary": "Rosen explains his concept of 'the view from nowhere' in journalism...",
  "quote": "The view from nowhere is a bid for trust that advertises the viewlessness of the news producer.",
  "categories": ["Press & Media Criticism", "Journalism Theory & Practice"],
  "concepts": ["View from Nowhere", "Objectivity", "Trust"],
  "tags": ["objectivity debate", "journalism ethics"],
  "verified": true,
  "type": "article",
  "relatedIds": ["P0001", "C0042"]
}
```

### Era Values (canonical 8)

| Era | Years | Description |
|-----|-------|-------------|
| Public Journalism (90s) | 1986-1999 | Public/civic journalism movement |
| Blogging Launch & Digital Disruption (2000-2004) | 2000-2004 | Early blogosphere; PressThink founding (2003) |
| Peak Blogging & Citizen Journalism (2005-2009) | 2005-2009 | Networked press, citizen journalism, NewAssignment.net |
| Social Media & Financial Crisis (2010-2015) | 2010-2015 | Twitter dominance, news industry contraction, audience atomization |
| View from Nowhere (10s) | 2010-2019 | Critiques of false balance and journalistic neutrality |
| Trump Era & Democratic Crisis (2016-2020) | 2016-2020 | Press under direct political attack, emergency-mode coverage |
| Democracy in Crisis (20s) | 2020-present | Post-truth, platform power, election denialism |
| Platform Transition & Future Models (2021-Present) | 2021-present | Twitter exodus, Bluesky/Mastodon, subscription / membership models |

The four "decade-bucket" eras (Public Journalism (90s), View from Nowhere (10s), Democracy in Crisis (20s), and the implicit-bucket coverage from the more granular eras) overlap with the four event-grouped eras (Blogging Launch, Peak Blogging, Trump Era, Platform Transition). Records can use whichever taxonomy best fits their content; both sets are canonical. Records covering the 2000s use the granular two-era split (2000-2004 vs 2005-2009) rather than a single 'Web & Blogging' bucket — drift-fix PR landed this normalization (task #11).

### Category Values

- Audience & Public Engagement
- Journalism Education
- Journalism Theory & Practice
- Politics & Democracy
- Press & Media Criticism
- Technology & Digital Media

### PressThink URL canonicalization

PressThink records may have both an original Movable Type URL and a modern
WordPress URL. Use the reader-facing modern URL when it exists, but do not
rewrite working archive URLs without evidence that the modern page resolves.

- For 2009-or-later PressThink posts, prefer `https://pressthink.org/<year>/<month>/<slug>/` after verifying the URL returns HTTP 200.
- For 2003-2008 PressThink posts, keep `http://archive.pressthink.org/<year>/<month>/<day>/<slug>.html` unless a modern URL is verified.
- When a modern URL replaces an archive URL, preserve the archive URL in `notes` as historical provenance.
- When backfilling missing URLs, try the modern form first and fall back to `archive.pressthink.org` only when the modern page does not resolve.

---

## Entity Schema

Entities represent people, organizations, concepts, and other named items extracted from archive records.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique entity ID. First letter marks the type (e.g., `P0001` person, `C0042` concept, `O0734` organization) |
| `type` | string | Entity type |
| `name` | string | Display name |
| `normalizedName` | string | Normalized form for matching |
| `role` | string | Role or description |
| `affiliation` | string | Associated organization |
| `prominence` | number | Prominence score (0-100) |
| `firstMentionRecordId` | string | First record mentioning entity |
| `totalMentions` | number | Total mention count |

### Entity Types

- `Person` - Individual people
- `Organization` - Companies, institutions, media outlets
- `Concept` - Abstract ideas and theories
- `Work` - Books, articles, publications
- `Event` - Historical events
- `Location` - Places

### Example Entity

```json
{
  "id": "P0001",
  "type": "Person",
  "name": "Jay Rosen",
  "normalizedName": "jay rosen",
  "role": "Professor of Journalism",
  "affiliation": "New York University",
  "prominence": 100,
  "firstMentionRecordId": "dissertation-1986",
  "totalMentions": 1427
}
```

---

## Relationship Schema

Relationships connect records to entities.

### CSV Columns

| Column | Description |
|--------|-------------|
| `relationship_id` | Unique relationship identifier |
| `source_record_id` | Record the relationship was extracted from |
| `source_entity_id` | Source entity ID |
| `source_entity_name` | Source entity display name |
| `relationship_type` | Type of relationship |
| `target_entity_id` | Target entity ID |
| `target_entity_name` | Target entity display name |
| `context_snippet` | Context/excerpt |
| `confidence_score` | Extraction confidence (0-1) |
| `extracted_date` | Date the relationship was extracted |

### Relationship Types

Fifteen relationship types are in active use. The counts below are a snapshot of `extracted_relationships.csv` as of 2026-05-24 — they will drift as the archive grows. Treat the *list* of types as the contract; treat the counts as illustrative. Re-derive with `cut -d, -f3 data/extracted_relationships.csv | sort | uniq -c | sort -rn` when an exact figure matters.

| Type | Count | Meaning |
|------|------:|---------|
| `Affiliated With` | 1,413 | Entity has a stable association with another (person↔organization, organization↔organization) |
| `Discusses` | 1,330 | Record discusses the entity as a topic |
| `Mentions` | 913 | Record mentions the entity in passing |
| `Criticizes` | 398 | Record makes a critical assessment of the entity |
| `Published In` | 252 | Record was published in the named outlet |
| `Originated By` | 128 | Concept or term originated with the entity |
| `Occurred At` | 79 | Event took place at a location |
| `Supports` | 47 | Record argues in favor of the entity / its position |
| `Cites` | 46 | Record formally cites the entity |
| `Expands On` | 37 | Record builds on a prior idea by the entity |
| `Founded By` | 9 | Organization was founded by the named person |
| `Pioneered` | 5 | Entity pioneered a movement / method |
| `Owns` | 3 | Entity owns the target |
| `Owned By` | 3 | Inverse of `Owns` |
| `Inspired By` | 3 | Entity was inspired by the target |

Notes:
- Types are Title Case in the data — they are display strings, not enum identifiers.
- The long tail (`Owns`, `Owned By`, `Inspired By`, `Pioneered`) is small enough that future cleanup may consolidate them. Don't introduce new types without a corresponding update here.
- All relationship rows pass referential integrity (every source/target entity ID exists in `extracted_entities.csv`).
- `Influenced` is defined below for issue #344 (downstream impact) but is not yet populated, and it is not yet in the machine-enforced extraction schema (`backend/entity_extraction_schema_v3.json`) or the writer allowlists (`entity_csv_writer.py`, `batch_entity_extraction.py`), which skip any relationship type they do not recognize. Its count stays zero until #344's backfill adds it to those allowlists and runs; until then this is a documented forward declaration of the type, not a writable one. Wiring it into the schema and allowlists is tracked separately.

### Impact / influence (defined for #344, backfill pending)

`Influenced` captures downstream impact: a source entity had an effect the target can be traced to, what the source's work led to, shaped, or set in motion. It is the forward, outbound counterpart to the inbound types already in use (`Inspired By`, `Expands On`, `Cites`): those name a source that draws on its target, with the influence flowing target to source, while `Influenced` names a source whose work the target follows from, the influence flowing source to target. Storage is the same source-to-target row in both cases; what inverts is the direction of influence the type asserts, not the column layout, so a backfill writes `Influenced` rows in the normal entity-to-entity shape with the source entity as the influencer. Both `source_entity_id` and `target_entity_id` must resolve in `extracted_entities.csv` (referential integrity), so the influencer is an entity. A record as the influencer (an article whose own appearance shaped later work) is not expressible in this row shape: `source_record_id` only names the record a relationship was extracted from, not a source endpoint. Representing that would need records first modeled as `Work` entities or a separate record-to-entity edge shape, and is out of scope for #344 until one of those is defined.

| Type | Count | Meaning |
|------|------:|---------|
| `Influenced` | 0 | Source entity had a downstream effect the target can be traced to (what the source's work led to) |

This type is the schema contract for the impact dimension Joe named on the 2026-05-27 launch call. A separate backfill pass populates it where the downstream effect is evident in the records (issue #344, acceptance criterion 2), and the frontend surface is deferred to the same issue (criterion 3). Until the backfill runs its count is zero, so a consumer of the open feed should expect no `Influenced` rows yet. Citation-specific impact (the inverse of `Cites`) is representable as `Influenced` for now; whether it warrants a distinct `Cited By` type is left to the backfill pass, which will see the real distribution.

---

## Thread Data Schema

For THREAD-* records, the `thread_data` field contains the thread structure.

```json
{
  "thread_data": {
    "platform": "bluesky",
    "root_post_id": "3lrbmko44y22x",
    "post_count": 12,
    "posts": [
      {
        "id": "SOCIAL-12345",
        "depth": 0,
        "content": "Thread content...",
        "created_at": "2025-10-15T14:30:00Z",
        "reply_to": null
      },
      {
        "id": "SOCIAL-12346",
        "depth": 1,
        "content": "Reply content...",
        "created_at": "2025-10-15T14:31:00Z",
        "reply_to": "SOCIAL-12345"
      }
    ]
  }
}
```

---

## RSS Feed Format

Feeds follow [RSS 2.0 specification](https://www.rssboard.org/rss-specification).

### Available Feeds

| Feed | URL | Description |
|------|-----|-------------|
| Main | `data/feeds/rss.xml` | 100 most recent items |
| Articles | `data/feeds/articles.xml` | Articles only |
| By Category | `data/feeds/categories/*.xml` | Per-category feeds |
| By Era | `data/feeds/eras/*.xml` | Per-era feeds |

### Feed Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Jay Rosen's Internet Archive</title>
    <link>https://pressthink.org/j/rosen-archive</link>
    <description>Archive description</description>
    <atom:link href="..." rel="self" type="application/rss+xml"/>
    <item>
      <title>Article Title</title>
      <link>https://example.com/article</link>
      <pubDate>Mon, 15 Dec 2025 00:00:00 GMT</pubDate>
      <description>Article summary</description>
      <category>Press &amp; Media Criticism</category>
    </item>
  </channel>
</rss>
```

---

## OPML Format

OPML files follow [OPML 2.0 specification](http://opml.org/spec2.opml).

### Available Files

| File | Purpose |
|------|---------|
| `feeds/archive.opml` | Full archive structure by era/category |
| `feeds/subscriptions.opml` | RSS subscription list |

### Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Jay Rosen's Internet Archive</title>
    <dateCreated>RFC 822 date</dateCreated>
  </head>
  <body>
    <outline text="By Era">
      <outline text="Era Name" type="category">
        <outline text="Article" type="link" url="..."/>
      </outline>
    </outline>
  </body>
</opml>
```

---

## Data Access

### Direct Download

- Full JSON: `data/archive-data.json` (25 MB)
- Core data: `data/archive-core.json` (8 MB)
- Details: `data/archive-details.json` (11 MB)
- Entities: `data/archive-entities.json` (1.2 MB)

### API-like Access

The archive is static files served via HTTP. No authentication required.

```javascript
// Fetch archive data
const response = await fetch('./data/archive-data.json');
const data = await response.json();

// Access records
data.records.forEach(record => {
  console.log(record.title, record.date);
});

// Access entities
data.entities.filter(e => e.type === 'Person');

// Access facets
data.facets.categories; // Available categories
data.facets.eras;       // Available eras
```

---

## License

Archive data is provided for research and educational use. Original content remains under its original copyright. Metadata and derived data (entities, relationships) are available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

---

## Contact

- Archive curator: Joe Amditis
- Subject: Jay Rosen, Professor of Journalism (retired), NYU
- Repository: [github.com/jamditis/rosen-frontend](https://github.com/jamditis/rosen-frontend)
