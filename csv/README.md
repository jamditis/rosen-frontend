# Archive Data Export

This directory contains tools for exporting archive data from Google Sheets to static JSON for improved load performance.

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
| `export-archive-data.js` | Node.js script to generate JSON (to be created) |
| `archive-data.json` | Generated data file (to be created) |

## Quick Start

```bash
# Install dependencies
npm install papaparse

# Generate the JSON data file
node export-archive-data.js

# Upload archive-data.json to WordPress
# Path: /wp-content/rosen-archive/data/archive-data.json
```

## Workflow

1. **Edit**: Update content in Google Sheets (source of truth)
2. **Export**: Run `node export-archive-data.js` to generate JSON
3. **Deploy**: Upload JSON file to WordPress via FTP

## See Also

- `IMPLEMENTATION_PLAN.md` for full technical details
- `../services/archiveService.js` for current data loading logic
- `../constants.js` for data source URLs
