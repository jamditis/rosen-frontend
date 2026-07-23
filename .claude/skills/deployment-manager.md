---
name: deployment-manager
description: Manage path configuration and deployment workflow for local vs production environments. Use when preparing for deployment or fixing path issues.
---

# Deployment & Path Management

Jay Rosen's Internet Archive deploys to WordPress via FTP with absolute paths. This skill manages the transition between local development and production paths.

## When to Activate

- Preparing files for production deployment
- Fixing broken paths after deployment
- Setting up local development environment
- Debugging "file not found" errors in production
- Updating navigation links across tools

## Environment Detection

### Current Detection Pattern (App.js)

```javascript
const IS_LOCAL = window.location.hostname === 'localhost'
  || window.location.hostname === '127.0.0.1';
```

### Production URL Structure

```
https://pressthink.org/j/rosen-archive/
├── index.html                          # Main archive
├── favicon.ico
├── shared-styles.css
├── dissertation/                       # Dissertation landing
│   └── index.html
├── features/                           # Standalone tools
│   ├── glossary/
│   ├── faq/
│   ├── comparison-tool/
│   └── [etc.]
├── frontend/                           # React app
│   └── [components, services]
├── data/                               # JSON data files
│   └── [archive-*.json]
└── wp-content/rosen-archive/          # Legacy path (some references)
```

## Path Configuration Locations

### 1. Main App (frontend/constants.js)

```javascript
// Production paths
export const DATA_URLS = {
    core: '/j/rosen-archive/data/archive-core.json',
    details: '/j/rosen-archive/data/archive-details.json',
    entities: '/j/rosen-archive/data/archive-entities.json',
    fallback: '/j/rosen-archive/data/archive-data.json'
};

// Local development (detected automatically in archiveService.js)
// Uses: './data/archive-core.json' etc.
```

### 2. Archive Service (frontend/services/archiveService.js)

```javascript
const IS_LOCAL = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1';

const getDataUrl = (filename) => {
    return IS_LOCAL
        ? `./data/${filename}`
        : `/j/rosen-archive/data/${filename}`;
};
```

### 3. Dissertation Tools (features/*/index.html)

All navigation links must use absolute production paths:

```html
<!-- Header navigation -->
<a href="/j/rosen-archive/dissertation/">Back to Dissertation</a>

<!-- Footer links -->
<a href="/j/rosen-archive/">Return to Archive</a>

<!-- Asset references -->
<link rel="icon" href="/j/rosen-archive/favicon.ico">
<link rel="stylesheet" href="/j/rosen-archive/shared-styles.css">
```

### 4. Dissertation Landing (labs/dissertation-launch/landing-page/)

```javascript
// Tool links
const tools = [
    { link: '/j/rosen-archive/features/faq/', ... },
    { link: '/j/rosen-archive/features/glossary/', ... },
    { link: '/j/rosen-archive/dissertation/reader/', ... }
];

// PDF links
const pdfPath = '/j/rosen-archive/dissertation/reader/THE_IMPOSSIBLE_PRESS_NYU_ROSEN-JAY-1986.pdf';
```

## Path Update Workflow

### Finding All Path References

```bash
# Find hardcoded paths that may need updating
cd /home/user/rosen-frontend

# Search for production paths
grep -r "/j/rosen-archive" --include="*.html" --include="*.js" | grep -v node_modules

# Search for wp-content paths (legacy)
grep -r "/wp-content/rosen-archive" --include="*.html" --include="*.js" | grep -v node_modules

# Search for localhost references
grep -r "localhost" --include="*.html" --include="*.js" | grep -v node_modules
```

### Bulk Path Replacement

```bash
# Replace old path with new path (DRY RUN)
grep -rl "/wp-content/rosen-archive" --include="*.html" --include="*.js" .

# Execute replacement
find . -name "*.html" -o -name "*.js" | xargs sed -i 's|/wp-content/rosen-archive|/j/rosen-archive|g'
```

### Per-File Path Checklist

```markdown
## Path Audit - [filename]

### Required Paths
- [ ] favicon.ico → /j/rosen-archive/favicon.ico
- [ ] shared-styles.css → /j/rosen-archive/shared-styles.css
- [ ] Navigation to archive → /j/rosen-archive/
- [ ] Navigation to dissertation → /j/rosen-archive/dissertation/

### Data References
- [ ] JSON data files use archiveService.js helper
- [ ] No hardcoded ./data/ paths in production code

### Asset References
- [ ] Images use /j/rosen-archive/ prefix
- [ ] PDFs use /j/rosen-archive/dissertation/reader/ prefix
```

## Local Development Setup

### Start Development Server

```bash
cd /home/user/rosen-frontend

# Start HTTP server on port 8000
python3 -m http.server 8000

# If port conflict, kill existing process
lsof -ti:8000 | xargs kill -9
python3 -m http.server 8000
```

### Access URLs

| Resource | Local URL |
|----------|-----------|
| Main Archive | http://localhost:8000 |
| Dissertation Landing | http://localhost:8000/labs/dissertation-launch/landing-page/ |
| Dissertation Reader | http://localhost:8000/features/dissertation-reader/ |
| FAQ Tool | http://localhost:8000/features/faq/ |
| Glossary | http://localhost:8000/features/glossary/ |

### Path Behavior in Development

In local development, paths work differently:
- Relative paths (`./data/`) work
- Absolute paths (`/j/rosen-archive/`) will 404
- The `IS_LOCAL` check converts paths automatically

## Pre-Deployment Checklist

```markdown
## Deployment Readiness Checklist

### File Validation
- [ ] All HTML files have valid syntax (run frontend-validation.yml locally)
- [ ] All JS files have valid syntax
- [ ] No console.log debugging statements
- [ ] No localhost references in production code

### Path Validation
- [ ] All navigation uses /j/rosen-archive/ prefix
- [ ] All assets (CSS, images) use absolute paths
- [ ] favicon.ico path is correct
- [ ] shared-styles.css path is correct

### Data Validation
- [ ] archive-validation skill passes
- [ ] JSON files are current (regenerated recently)
- [ ] No stale cached data issues

### Functionality Testing
- [ ] Main archive loads and displays records
- [ ] Search/filter works
- [ ] Dissertation tools load
- [ ] Navigation between pages works
- [ ] Mobile responsive design works

### Files to Deploy
- [ ] index.html
- [ ] favicon.ico
- [ ] shared-styles.css
- [ ] frontend/ (entire directory)
- [ ] features/ (entire directory)
- [ ] labs/dissertation-launch/ (if needed)
- [ ] data/*.json files
```

## Deployment Commands

### FTP Upload Structure

```
Upload to: pressthink.org/j/rosen-archive/

Required directories:
├── frontend/
├── features/
├── data/
└── labs/dissertation-launch/ (optional)

Required files:
├── index.html
├── favicon.ico
└── shared-styles.css
```

### Post-Deployment Verification

```bash
# Test critical URLs
curl -I https://pressthink.org/j/rosen-archive/
curl -I https://pressthink.org/j/rosen-archive/data/archive-core.json
curl -I https://pressthink.org/j/rosen-archive/features/faq/
curl -I https://pressthink.org/j/rosen-archive/dissertation/
```

## Common Issues

### Issue: 404 on Production

**Symptoms:** Page works locally, 404 in production

**Cause:** Missing `/j/rosen-archive/` prefix

**Fix:**
```bash
# Find the problematic link
grep -r "href=\"/" features/ | grep -v "/j/rosen-archive"
```

### Issue: CSS Not Loading

**Symptoms:** Unstyled page in production

**Cause:** shared-styles.css path wrong

**Fix:**
```html
<!-- Change from -->
<link rel="stylesheet" href="../../shared-styles.css">

<!-- To -->
<link rel="stylesheet" href="/j/rosen-archive/shared-styles.css">
```

### Issue: Data Not Loading

**Symptoms:** Empty archive, no records displayed

**Cause:** archiveService.js not detecting environment correctly

**Fix:** Check `IS_LOCAL` detection in archiveService.js

### Issue: Favicon Not Showing

**Symptoms:** Generic browser icon

**Fix:**
```html
<link rel="icon" type="image/x-icon" href="/j/rosen-archive/favicon.ico">
```

## Integration

- **zero-build-frontend** - Architecture context for deployment
- **archive-validation** - Run before deployment
- **dissertation-tool-generator** - Ensures new tools have correct paths

---

## Skill Metadata
**Created**: 2025-12-25
**Author**: Claude Code
**Version**: 1.0.0
