---
name: zero-build-frontend
description: Develop React components for the Jay Rosen Internet Archive's zero-build architecture. Use when creating components, modifying frontend code, or troubleshooting import issues.
---

# Zero-Build Frontend Development

The Jay Rosen Internet Archive uses a **zero-build static deployment** architecture. This is NOT a typical React/Node project - there is no webpack, vite, or bundler. All dependencies load via CDN.

## When to Activate

- Creating or modifying React components in `/frontend/`
- Adding new standalone tools in `/features/`
- Troubleshooting import errors or module loading issues
- Setting up local development server
- Debugging "module not found" or CDN-related errors

## Critical Architecture Rules

### Import Pattern (MUST FOLLOW)

All imports use ESM from CDN with version query params:

```javascript
// CORRECT - Use esm.sh with explicit versions
import React, { useState, useEffect } from 'https://esm.sh/react@18.2.0?v=2.0.2';
import { html } from '../html.js?v=2.0.2';
import { Search, Filter } from 'https://esm.sh/lucide-react@0.263.1?v=2.0.2';

// WRONG - Never use bare imports
import React from 'react';  // WILL FAIL
import { useState } from 'react';  // WILL FAIL
```

### Version Query Parameter

Every import MUST include `?v=X.X.X` for cache busting:

```javascript
// Current version: check frontend/App.js for latest
import { Button } from './components/shared/Button.js?v=2.0.2';
```

When updating version:
1. Check current version in `frontend/App.js`
2. Update ALL imports in the file being modified
3. Update `frontend/App.js` if creating new components

### HTM for JSX Syntax

Use HTM (Hyperscript Tagged Markup) instead of JSX:

```javascript
import { html } from '../html.js?v=2.0.2';

// CORRECT - HTM syntax
const Component = () => {
  return html`
    <div className="p-4">
      <h1>Title</h1>
      <${Button} onClick=${handleClick}>Click</${Button}>
    </div>
  `;
};

// WRONG - JSX won't work without build step
const Component = () => {
  return <div className="p-4"><h1>Title</h1></div>;
};
```

### Component Reference in HTM

```javascript
// Referencing components in HTM
<${ComponentName} prop=${value} />

// Mapping arrays
${items.map(item => html`<${Card} key=${item.id} data=${item} />`)}

// Conditional rendering
${isLoading ? html`<${LoadingState} />` : html`<${Content} />`}
```

## File Structure Conventions

### Main Frontend (`/frontend/`)
```
frontend/
├── App.js              # Main app, routing, state
├── index.js            # React root mount
├── constants.js        # Data URLs, colors, eras
├── html.js             # HTM binding (don't modify)
├── components/
│   ├── shared/         # Reusable components
│   │   ├── Button.js   # 4 variants: primary, secondary, ghost, danger
│   │   ├── Card.js
│   │   ├── Modal.js
│   │   └── index.js    # Exports
│   └── [Feature].js    # Feature-specific components
└── services/
    └── archiveService.js  # Data fetching, caching
```

### Standalone Tools (`/features/`)
```
features/[tool-name]/
├── index.html          # Self-contained HTML
├── data.js             # Export object with content
├── script.js           # DOM manipulation
└── styles.css          # Tool-specific styles (optional)
```

## Local Development

```bash
# Start server (ALWAYS use this)
python3 -m http.server 8000

# Open browser to http://localhost:8000
```

Path detection in App.js:
```javascript
const IS_LOCAL = window.location.hostname === 'localhost'
  || window.location.hostname === '127.0.0.1';
```

## Common Patterns

### State Management
State lives in App.js, passed as props:
```javascript
const [records, setRecords] = useState([]);
const [selectedRecord, setSelectedRecord] = useState(null);
const [filters, setFilters] = useState({ era: null, category: null });
```

### Data Loading
```javascript
import { fetchArchiveData } from './services/archiveService.js?v=2.0.2';

useEffect(() => {
  fetchArchiveData().then(data => {
    setRecords(data.records);
    setEntities(data.entities);
  });
}, []);
```

### Shared Components Usage
```javascript
import { Button, Card, Modal, LoadingState } from './components/shared/index.js?v=2.0.2';

return html`
  <${Button} variant="primary" onClick=${handleClick}>Save</${Button}>
  <${Card} className="p-4">${content}</${Card}>
  <${Modal} isOpen=${showModal} onClose=${() => setShowModal(false)}>
    ${modalContent}
  </${Modal}>
`;
```

## Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Use bare imports (`import X from 'pkg'`) | Use CDN URLs with versions |
| Write JSX syntax | Use HTM tagged templates |
| Run `npm install` or `npm build` | Just start HTTP server |
| Create package.json dependencies | Add CDN imports |
| Use webpack/vite config | None needed |
| Forget version query params | Always include `?v=X.X.X` |

## Debugging Tips

**"Module not found" errors:**
- Check CDN URL is correct
- Verify version query param matches
- Test URL directly in browser

**Component not rendering:**
- Check HTM syntax (`<${Component}>` not `<Component>`)
- Verify export/import names match
- Check browser console for import errors

**Styles not applying:**
- Tailwind classes must be in `dist/tailwind.css`
- Custom styles go in `index.css` or `shared-styles.css`

## Integration

- **dissertation-tool-generator** - Uses this architecture for new tools
- **deployment-manager** - Handles path configuration for production
- **version-manager** - Automates version query param updates

---

## Skill Metadata
**Created**: 2025-12-25
**Author**: Claude Code
**Version**: 1.0.0
