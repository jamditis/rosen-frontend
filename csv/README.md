# Archive Data Export

This directory contains tools for exporting archive data from CSV files to static JSON for improved load performance.

## Purpose

The archive originally fetched data from Google Sheets at runtime, which caused:
- Variable latency (800-1500ms)
- CORS preflight overhead
- Dependency on Google's availability
- 3 separate network requests

This export system generates a single pre-processed JSON file that loads in ~100-200ms.

## Files

| File | Purpose |
|------|---------|
| `IMPLEMENTATION_PLAN.md` | Detailed migration plan and architecture |
| `export-archive-data.js` | Node.js script to generate JSON |
| `archive-data.json` | Generated data file (~25MB, ~30k records, ~5k entities) |
| `archive_records-public.csv` | Main archive records (articles, essays) |
| `social_posts.csv` | Social media posts (Bluesky, Twitter) |
| `extracted_relationships.csv` | Entity relationships between records |
| `extracted_entities.csv` | Named entities (people, orgs, concepts, etc.) |

## Quick Start

```bash
# From the repository root:

# Install dependencies
npm install

# Generate the JSON data file
npm run export-data

# Upload archive-data.json to WordPress
# Path: /wp-content/rosen-archive/csv/archive-data.json
```

## Workflow

1. **Export CSV from Google Sheets**: Download the latest CSV files from Google Sheets
2. **Replace CSV files**: Place updated CSV files in this directory
3. **Export to JSON**: Run `npm run export-data` to generate JSON
4. **Deploy**: Upload JSON file to WordPress via FTP

## Data Sources

The export script reads from four CSV files:

- **archive_records-public.csv**: Main articles, essays, and publications
- **social_posts.csv**: Social media posts from Bluesky and Twitter
- **extracted_relationships.csv**: Entity relationships for network visualization
- **extracted_entities.csv**: Named entities (Person, Organization, Concept, Event, Location, Work)

## Output Structure

The generated `archive-data.json` contains:

```json
{
  "version": "1.1.0",
  "generated": "2025-12-01T...",
  "records": [...],      // Array of processed records (~30k)
  "entities": [...],     // Array of named entities (~5k)
  "facets": {
    "categories": [...], // Unique categories for filtering
    "eras": [...],       // Time period classifications
    "publications": [...], // Publication sources
    "entityTypes": [...]   // Entity types (Person, Organization, etc.)
  },
  "autocompleteIndex": [...] // Search terms for autocomplete (~35k)
}
```

## See Also

- `IMPLEMENTATION_PLAN.md` for full technical details
- `../services/archiveService.js` for data loading logic
- `../constants.js` for data source URLs
