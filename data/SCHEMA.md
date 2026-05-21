# Jay Rosen Digital Archive - Data Schema

This document describes the data formats used in the Jay Rosen Digital Archive, following open web principles of transparency and interoperability.

## Overview

The archive uses JSON and CSV formats for data storage, with RSS and OPML for syndication. All formats are standard, documented, and machine-readable.

| Format | File | Purpose |
|--------|------|---------|
| JSON | `archive-data.json` | Full archive data |
| JSON | `archive-core.json` | Lightweight card data |
| JSON | `archive-details.json` | Full record details |
| JSON | `archive-entities.json` | Entity/relationship data |
| CSV | `archive_records-public.csv` | Source archive records |
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
| `summary` | string | | Description or excerpt |
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

### Era Values

| Era | Years | Description |
|-----|-------|-------------|
| Public Journalism (90s) | 1986-1999 | Public/civic journalism movement |
| Web & Blogging (00s) | 2000-2009 | Rise of blogs and online journalism |
| View from Nowhere (10s) | 2010-2019 | Critiques of false balance |
| Democracy in Crisis (20s) | 2020-present | Post-truth, platform power |

### Category Values

- Audience & Public Engagement
- Journalism Education
- Journalism Theory & Practice
- Politics & Democracy
- Press & Media Criticism
- Technology & Digital Media

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

- `mentions` - Record mentions entity
- `authored_by` - Record authored by person
- `discusses` - Record discusses concept
- `references` - Record references work

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
    <title>Jay Rosen Digital Archive</title>
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
    <title>Jay Rosen Digital Archive</title>
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
