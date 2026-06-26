# Archive Data Loading Optimization Plan

## Overview

This plan migrates the Jay Rosen Internet Archive from fetching data via Google Sheets CSV exports to serving a single pre-processed JSON file from the WordPress server. This eliminates Google Sheets latency, CORS overhead, and reduces network requests from 3 to 1.

**Expected Performance Improvement:**
- Current (Google Sheets): ~800-1500ms (3 requests, variable latency, CORS preflight)
- After (Static JSON): ~100-200ms (1 request, same origin, pre-processed)

---

## Architecture Changes

### Before
```
Browser → Google Sheets (test_runs.csv)     ─┐
Browser → Google Sheets (social_posts.csv)   ├→ PapaParse → Process → Render
Browser → Google Sheets (relationships.csv) ─┘
```

### After
```
Browser → WordPress (/data/archive-data.json) → Render
```

---

## Implementation Steps

### Phase 1: Create the Data Export Script

**File:** `data/export-archive-data.js`

This Node.js script will:
1. Fetch current data from Google Sheets
2. Process and normalize all records (same logic as archiveService.js)
3. Output a single `archive-data.json` file

```javascript
// Script structure (to be implemented)
// 1. Fetch all three CSVs from Google Sheets
// 2. Parse with PapaParse
// 3. Process records (cleanTags, formatDate, getEra, etc.)
// 4. Build relationships map
// 5. Merge and filter records
// 6. Output JSON with structure:
//    {
//      version: "1.0.0",
//      generated: "2025-12-01T00:00:00Z",
//      records: [...],
//      facets: { categories, eras, publications },
//      autocompleteIndex: [...]
//    }
```

### Phase 2: Create the JSON Data File

**File:** `data/archive-data.json`

Pre-processed data structure:
```json
{
  "version": "1.0.0",
  "generated": "2025-12-01T00:00:00Z",
  "records": [
    {
      "id": "article-123",
      "title": "The View from Nowhere",
      "author": "Jay Rosen",
      "date": "2010-11-10",
      "year": "2010",
      "era": "View from Nowhere (10s)",
      "pub": "PressThink",
      "url": "https://pressthink.org/...",
      "summary": "...",
      "quote": "...",
      "categories": ["Press Criticism", "Objectivity"],
      "concepts": ["View from Nowhere", "Trust"],
      "tags": ["journalism", "bias"],
      "verified": true,
      "type": "article",
      "relatedIds": ["article-456", "social-789"]
    }
  ],
  "facets": {
    "categories": ["Category A", "Category B"],
    "eras": ["Public Journalism (90s)", "Web & Blogging (00s)", "View from Nowhere (10s)", "Democracy in Crisis (20s)"],
    "publications": ["PressThink", "NYU", "Twitter"]
  },
  "autocompleteIndex": ["term1", "term2", "term3"]
}
```

### Phase 3: Update archiveService.js

**File:** `services/archiveService.js`

Changes required:
1. Remove PapaParse dependency (no longer needed)
2. Replace `fetchCSV()` with simple `fetch()` for JSON
3. Simplify `fetchArchiveData()` to load and return JSON directly
4. Update caching logic for JSON format
5. Keep `DISSERTATION_RECORD` injection logic

```javascript
// New simplified fetchArchiveData
export const fetchArchiveData = async () => {
  const cached = getCachedData(DATA_URL);
  if (cached) return cached;

  const response = await fetch(DATA_CONFIG.archive_json);
  const data = await response.json();

  // Inject dissertation record if not present
  if (!data.records.find(r => r.id === 'dissertation-1986')) {
    data.records.push({ ...DISSERTATION_RECORD, relatedIds: [] });
  }

  setCachedData(DATA_URL, data);
  return data;
};
```

### Phase 4: Update constants.js

**File:** `constants.js`

Replace Google Sheets URLs with local JSON path:
```javascript
export const DATA_CONFIG = {
  archive_json: '/wp-content/rosen-archive/data/archive-data.json',
  // Keep old URLs commented for reference/fallback
  // test_runs: `${SHEET_BASE}?gid=928818664&single=true&output=csv`,
  // social_posts: `${SHEET_BASE}?gid=0&single=true&output=csv`,
  // relationships: `${SHEET_BASE}?gid=0&single=true&output=csv`
};
```

### Phase 5: Remove PapaParse Dependency

**File:** `index.html`

Remove the PapaParse import from the importmap:
```html
<!-- Remove this line -->
<script type="importmap">
{
  "imports": {
    "papaparse": "https://esm.sh/papaparse@5.4.1"  // REMOVE
  }
}
</script>
```

---

## File Structure After Implementation

```
rosen-frontend/
├── data/
│   ├── IMPLEMENTATION_PLAN.md      # This document
│   ├── export-archive-data.js      # Export script (Node.js)
│   ├── archive-data.json           # Generated data file
│   └── README.md                   # Usage instructions
├── frontend/
│   ├── services/
│   │   └── archiveService.js       # Updated (simplified)
│   ├── constants.js                # Updated (new data URL)
│   └── ...
└── index.html                      # Updated (remove PapaParse)
```

---

## Deployment Steps

### Initial Deployment

1. Run the export script to generate `archive-data.json`
2. Upload `archive-data.json` to WordPress at `/wp-content/rosen-archive/data/`
3. Deploy updated `archiveService.js`, `constants.js`, and `index.html`
4. Test the archive loads correctly
5. Verify caching works as expected

### Updating Data

When archive data needs to be updated:

1. Update the Google Sheet (still the source of truth for editing)
2. Run `node data/export-archive-data.js`
3. Upload new `archive-data.json` to WordPress
4. Optionally increment `CACHE_VERSION` in `archiveService.js` to force cache refresh

---

## Rollback Plan

If issues arise, rollback is simple:

1. Revert `constants.js` to use Google Sheets URLs
2. Revert `archiveService.js` to use PapaParse
3. Restore PapaParse import in `index.html`

The Google Sheets remain unchanged and will continue to work.

---

## Testing Checklist

- [ ] Export script runs without errors
- [ ] Generated JSON is valid and contains expected record count
- [ ] Archive loads with new JSON data source
- [ ] All filters work (categories, eras, publications)
- [ ] Search/autocomplete works correctly
- [ ] Record modal displays all data correctly
- [ ] Timeline visualization works
- [ ] Explorer (network) visualization works
- [ ] Dissertation record appears in results
- [ ] Caching works (check localStorage)
- [ ] Cache invalidation works (increment version)
- [ ] No console errors
- [ ] Load time improved (measure with DevTools)

---

## Performance Monitoring

After deployment, monitor:

1. **Network tab**: Confirm single JSON request vs 3 CSV requests
2. **Timing**: Compare load times before/after
3. **Payload size**: JSON should be similar or smaller than 3 CSVs combined
4. **Cache hits**: Verify localStorage caching works

---

## Future Considerations

### Optional Enhancements

1. **Gzip compression**: Ensure WordPress serves `.json` with gzip (typically automatic)
2. **Cache headers**: Configure `Cache-Control: max-age=3600` on the JSON file
3. **Service Worker**: Add offline support with SW caching
4. **CDN**: If WordPress has CDN, JSON file will be edge-cached
5. **Incremental updates**: For very large archives, consider delta updates

### Maintaining Google Sheets Workflow

The Google Sheet remains the "source of truth" for content editing:
- Editors continue to update the spreadsheet
- Export script is run when changes need to be published
- This creates a clear "edit → review → publish" workflow

---

## Dependencies

### Export Script Requirements
- Node.js 18+
- npm packages: `papaparse`, `node-fetch` (or built-in fetch in Node 18+)

### Browser Requirements
- No new requirements (removing PapaParse actually reduces dependencies)

---

## Timeline Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Export script | ~1 hour |
| Phase 2: Generate JSON | ~10 minutes |
| Phase 3: Update archiveService.js | ~30 minutes |
| Phase 4: Update constants.js | ~5 minutes |
| Phase 5: Remove PapaParse | ~5 minutes |
| Testing | ~30 minutes |
| Deployment | ~15 minutes |
| **Total** | **~2.5 hours** |

---

## Notes

- The dissertation record (`DISSERTATION_RECORD`) is hardcoded and will continue to be injected
- The `hashString()` function for UI colors is retained (used by App.js)
- The `prefetchDataSources()` function can be simplified or removed
- Error handling should gracefully fall back if JSON fetch fails
