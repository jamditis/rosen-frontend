# Data curator

## Role

You manage the archive's records, data quality, and taxonomy. Your primary workspace is the CSV source files and the JSON export pipeline. You don't need to write Python or React code — your tools are a text editor (or spreadsheet app), the export script, and the test suite.

This role is well-suited for someone maintaining the archive long-term, adding new records as Jay Rosen publishes, and keeping data clean.

## Responsibilities

- **Adding new records:** Append rows to `data/archive_records-public.csv` following the established column schema. See `ADDING-RECORDS.md` for a step-by-step guide.

- **Data quality:** Ensure records have correct dates, working URLs, accurate categories, and proper formatting. Run `npm run test:data` to catch problems.

- **Taxonomy management:** The archive uses 6 thematic categories, 13 key concepts, 6 eras, and 6 entity types. These are defined in `backend/schema.json` and must stay consistent with `frontend/constants.js`.

- **Entity curation:** Review extracted entities in `data/extracted_entities.csv` for duplicates, misspellings, and miscategorizations. Entity relationships live in `data/extracted_relationships.csv`.

- **Social media posts:** Manage `data/social_posts.csv` (~29,100 Twitter/X and Bluesky posts). Many have generic titles that need improvement.

- **JSON regeneration:** After any CSV change, run `node data/export-archive-data.js` to produce updated JSON files.

- **Verification:** 138 TUMBLR records are unverified (`verified=FALSE`) and excluded from the public export. Review these for accuracy before marking verified.

## Key files

```
data/
  archive_records-public.csv             # Main archive records (940 records, source of truth)
  social_posts.csv                       # Social media posts (~29,100 records)
  extracted_entities.csv                 # Named entities (~5,061)
  extracted_relationships.csv            # Entity-to-record relationships (~5,084)
  export-archive-data.js                 # JSON generator script
  archive-core.json                      # Generated: lightweight records for cards
  archive-details.json                   # Generated: full summaries, quotes, concepts
  archive-entities.json                  # Generated: entity graph for Explorer
  archive-data.json                      # Generated: full combined data (fallback)
  README.md                              # Data dictionary

backend/schema.json                      # Taxonomy definitions (categories, eras, concepts)
frontend/constants.js                    # Frontend taxonomy references
ADDING-RECORDS.md                        # Step-by-step record addition guide
```

## CSV schema (archive_records-public.csv)

The most important columns:

| Column | Description | Example |
|--------|-------------|---------|
| `id` | Unique record ID | `RECORD-00803` |
| `title` | Record title | `The View from Nowhere` |
| `url` | Link to original content | `https://pressthink.org/2010/11/...` |
| `author` | Author name | `Jay Rosen` |
| `publication_date` | ISO date | `2010-11-10` |
| `original_publication` | Source publication | `PressThink` |
| `content_type` | Type classification | `Article`, `Essay`, `Interview`, `Lecture` |
| `thematic_categories` | Comma-separated categories | `Press & Media Criticism, Politics & Democracy` |
| `era` | Time period | `Platform Transition & Future Models (2021-Present)` |
| `verified` | Review status | `TRUE` or `FALSE` |
| `summary` | AI-generated or manual summary | Free text |

## Thematic categories (use exact spelling)

- Press & Media Criticism
- Journalism Theory & Practice
- Journalism Education
- Politics & Democracy
- Technology & Digital Media
- Audience & Public Engagement

## Key concepts (13 canonical)

1. View from Nowhere
2. Church of the Savvy
3. The People Formerly Known as the Audience
4. Parity Product
5. Verification in reverse
6. He said/she said journalism
7. Audience atomization overcome
8. The Production of Innocence
9. Horse-race journalism
10. False balance
11. The Citizens' Agenda
12. Not the odds but the stakes
13. Mindcasting

## Adding records workflow

```bash
# 1. Edit CSV
#    Open data/archive_records-public.csv in a text editor or spreadsheet
#    Add new rows at the bottom

# 2. Regenerate JSON
npm install          # first time only
node data/export-archive-data.js

# 3. Run data tests
npm run test:data

# 4. Deploy (upload JSON files via FTP)
#    Upload: archive-core.json, archive-data.json, archive-details.json
```

## Data quality checks

Run these after any CSV change:

```bash
npm run test:data          # Data integrity + CSV quality tests
npm test                   # Full test suite
```

The tests check:
- All JSON files have valid schema
- Record counts match across split files
- No duplicate record IDs
- Dates are valid ISO format
- Required fields are present
- Entity relationships reference existing records and entities
- Cross-file consistency (core, details, entities, full data)

## Known data issues

- ~29,000 social media records have generic titles ("Tweet by Jay Rosen", "Post by Jay Rosen"). Fixing this would need content-based title generation.
- 138 TUMBLR records are all `verified=FALSE` and excluded from the public export.
- 6 records have no recoverable URL: RECORD-00663, 00667, 00673, 00693, 00694, 00700.
- Thread records have placeholder titles ("[Bluesky Thread]").
- `archive.pressthink.org` subdomain has a TLS certificate issue. Records with that subdomain use `http://` URLs correctly.

## Principles

- **CSV is the source of truth.** JSON files are generated artifacts. Always edit the CSV, never the JSON directly.
- **Schema consistency.** Categories, eras, and entity types must match between `backend/schema.json`, `frontend/constants.js`, and the CSV data.
- **Run tests after changes.** `npm run test:data` catches broken references, bad dates, and schema violations.
- **Sentence case.** All text in the archive uses sentence case.
- **Verified means reviewed.** Only set `verified=TRUE` on records where the URL, title, date, author, and categories have been checked by a human.

## Example tasks

- "Add the 5 new PressThink posts from March 2026 to the archive. Here are the URLs: [...]"
- "Run a quality check on all records from 2024. Flag any with broken URLs or missing categories."
- "Review the 138 unverified TUMBLR records. For each, check whether the URL is still live and the content matches the title."
- "The entity 'Columbia Journalism School' appears as both 'Columbia J-School' and 'CJS' in the entities CSV. Merge these into one canonical entry."
