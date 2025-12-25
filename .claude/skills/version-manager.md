---
name: version-manager
description: Manage version query parameters for cache busting across frontend imports. Use when updating component versions or debugging stale cache issues.
---

# Frontend Version Management

The zero-build architecture uses URL query parameters (`?v=X.X.X`) for cache busting. This skill manages version consistency across 26+ import statements.

## When to Activate

- Updating frontend component versions
- Debugging stale cache issues
- Releasing new frontend features
- Fixing version mismatch errors
- Preparing for deployment

## Current Version Detection

```bash
# Find current version
grep -o "?v=[0-9.]*" /home/user/rosen-frontend/frontend/App.js | head -1
# Output: ?v=2.0.2

# Count version references
grep -c "?v=" /home/user/rosen-frontend/frontend/App.js
# Output: ~15-20
```

## Version Location Map

### Primary Files (Update These First)

| File | Import Count | Purpose |
|------|--------------|---------|
| `frontend/App.js` | ~15 | Main app, sets the standard |
| `frontend/index.js` | ~3 | Entry point |
| `frontend/components/Sidebar.js` | ~5 | Search and filters |
| `frontend/components/Explorer.js` | ~4 | Network visualization |
| `frontend/components/MindMap.js` | ~3 | Dissertation tree |
| `frontend/components/RecordModal.js` | ~4 | Detail view |

### Import Pattern

```javascript
// Standard pattern - version at end of local imports
import { html } from '../html.js?v=2.0.2';
import { Button, Card } from './shared/index.js?v=2.0.2';
import { fetchArchiveData } from './services/archiveService.js?v=2.0.2';

// CDN imports also get versions
import React, { useState } from 'https://esm.sh/react@18.2.0?v=2.0.2';
import { Search } from 'https://esm.sh/lucide-react@0.263.1?v=2.0.2';
```

## Version Update Workflow

### Step 1: Determine New Version

Semantic versioning:
- **MAJOR** (X.0.0): Breaking changes, architecture updates
- **MINOR** (0.X.0): New features, new components
- **PATCH** (0.0.X): Bug fixes, small updates

```bash
# Current: 2.0.2
# Bug fix: 2.0.3
# New feature: 2.1.0
# Major rewrite: 3.0.0
```

### Step 2: Update All Files

```bash
cd /home/user/rosen-frontend/frontend

# DRY RUN - See what will change
grep -r "?v=2.0.2" --include="*.js" .

# Update all version strings (example: 2.0.2 → 2.0.3)
find . -name "*.js" -exec sed -i 's/?v=2.0.2/?v=2.0.3/g' {} \;

# Verify changes
grep -r "?v=2.0.3" --include="*.js" . | wc -l
```

### Step 3: Update CHANGELOG

```markdown
## [2.0.3] - YYYY-MM-DD

### Fixed
- [Description of fix]

### Changed
- [Description of change]
```

### Step 4: Verify No Mixed Versions

```bash
# Find all unique versions in use
grep -oh "?v=[0-9.]*" frontend/*.js frontend/**/*.js | sort | uniq -c
#   26 ?v=2.0.3  <-- All should be same version
```

## Automated Version Check Script

```bash
#!/bin/bash
# check-versions.sh

echo "=== Version Check ==="

cd /home/user/rosen-frontend/frontend

# Find all versions
versions=$(grep -roh "?v=[0-9.]*" --include="*.js" . | sort | uniq -c | sort -rn)

echo "$versions"

# Check for mismatches
unique_count=$(echo "$versions" | wc -l)

if [ "$unique_count" -gt 1 ]; then
    echo ""
    echo "WARNING: Multiple versions detected!"
    echo "Files with mismatched versions:"
    grep -rn "?v=" --include="*.js" . | grep -v "$(grep -roh '?v=[0-9.]*' . | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')"
else
    echo ""
    echo "OK: All versions consistent"
fi
```

## Version Mismatch Debugging

### Symptoms
- Component not updating after code change
- "Module not found" errors intermittently
- Different behavior on refresh vs. hard refresh
- Inconsistent UI state

### Diagnosis

```bash
# Check for version mismatches
cd /home/user/rosen-frontend/frontend

# List all version strings with file locations
grep -rn "?v=" --include="*.js" . | sort -t'=' -k2

# Find files with old versions
grep -rl "?v=2.0.1" --include="*.js" .
```

### Fix

```bash
# Update specific file
sed -i 's/?v=2.0.1/?v=2.0.3/g' ./components/Sidebar.js

# Or update all files
find . -name "*.js" -exec sed -i 's/?v=2.0.1/?v=2.0.3/g' {} \;
```

## Browser Cache Clearing

### Development (Force Refresh)
- **Chrome/Edge:** Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- **Firefox:** Ctrl+F5
- **Safari:** Cmd+Option+R

### Development (Clear Cache)
1. Open DevTools (F12)
2. Right-click Refresh button
3. Select "Empty Cache and Hard Reload"

### Production Users
Version query params should handle this automatically. If issues persist:
1. Update version strings
2. Deploy
3. Users get new version automatically

## Version History Reference

| Version | Date | Changes |
|---------|------|---------|
| 2.0.2 | Dec 2024 | Dissertation launch |
| 2.0.1 | Dec 2024 | Bug fixes |
| 2.0.0 | Dec 2024 | Phase 1 launch implementation |
| 1.x.x | Nov 2024 | Pre-launch development |

## Adding New Components

When creating a new component:

```javascript
// 1. Use current version in new file
import React, { useState } from 'https://esm.sh/react@18.2.0?v=2.0.3';
import { html } from '../html.js?v=2.0.3';

// 2. Export the component
export const NewComponent = () => { ... };

// 3. Import in parent with version
import { NewComponent } from './NewComponent.js?v=2.0.3';
```

## CDN Dependency Versions

These are separate from app version but should be tracked:

| Package | CDN URL | Version |
|---------|---------|---------|
| React | esm.sh/react | 18.2.0 |
| ReactDOM | esm.sh/react-dom | 18.2.0 |
| Lucide React | esm.sh/lucide-react | 0.263.1 |
| PapaParse | esm.sh/papaparse | 5.4.1 |
| HTM | esm.sh/htm | 3.1.1 |

To update CDN versions, change both the URL version AND the query param:
```javascript
// Old
import React from 'https://esm.sh/react@18.2.0?v=2.0.2';

// New (updating React)
import React from 'https://esm.sh/react@18.3.0?v=2.0.3';
```

## Integration

- **zero-build-frontend** - Architecture context
- **deployment-manager** - Version updates before deployment
- **dissertation-tool-generator** - New tools use current version

---

## Skill Metadata
**Created**: 2025-12-25
**Author**: Claude Code
**Version**: 1.0.0
