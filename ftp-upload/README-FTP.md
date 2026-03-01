# FTP upload — Jay Rosen archive v3.3.0

Upload all files in this folder to `/wp-content/rosen-archive/` on pressthink.org.

## FTP path

```
pressthink.org → /wp-content/rosen-archive/
```

## What's in here

| Path | Purpose |
|------|---------|
| `index.html` | Main archive page |
| `favicon.ico`, `shared-styles.css`, `version.json`, `metadata.json` | Site assets |
| `frontend/` | React app (components, services, CSS) |
| `data/archive-core.json` | Record cards (11 MB) — loads on page load |
| `data/archive-details.json` | Full summaries (12 MB) — loads on demand |
| `data/archive-data.json` | Full combined fallback (27 MB) |
| `data/archive-entities.json` | Entity graph (1.1 MB) |
| `data/feeds/` | RSS/OPML feeds |
| `dissertation/` | Dissertation tools (reader, foreword, network-effect) |
| `dissertation-launch/` | Dissertation landing page |
| `features/` | Status report and shared feature assets |
| `tools/` | Data explorer and visualization tools |
| `ADDING-RECORDS.md` | Instructions for adding new records |

## What to upload after adding new records

If you've added records to the CSV and regenerated JSON (see ADDING-RECORDS.md), only upload these:

- `data/archive-core.json`
- `data/archive-data.json`
- `data/archive-details.json`

The other files only change when the site code changes.

## FTP credentials

Ask Joe Amditis (jamditis@gmail.com).
