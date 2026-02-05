---
name: archive-code-review
description: Review code changes for the Jay Rosen Internet Archive with domain-specific criteria. Use when reviewing PRs or significant code changes.
---

# Archive-Specific Code Review

Review code changes with awareness of the Jay Rosen Internet Archive's unique architecture, patterns, and requirements.

## When to Activate

- Reviewing pull requests
- Self-reviewing before commit
- Auditing existing code
- Ensuring consistency with established patterns

## Review Dimensions

### 1. Architecture Compliance

**Zero-Build Requirements:**
- [ ] No bare imports (must use CDN URLs)
- [ ] All local imports have `?v=X.X.X` query params
- [ ] Uses HTM syntax, not JSX
- [ ] No webpack/vite/bundler configuration added
- [ ] No `package.json` dependencies for frontend

**Correct:**
```javascript
import React from 'https://esm.sh/react@18.2.0?v=2.0.2';
import { html } from '../html.js?v=2.0.2';
```

**Incorrect:**
```javascript
import React from 'react';
import { html } from '../html.js';  // Missing version
```

### 2. Path Consistency

**Production Paths:**
- [ ] Navigation links use `/j/rosen-archive/` prefix
- [ ] Asset references use absolute paths
- [ ] No hardcoded `localhost` in production code
- [ ] favicon.ico path: `/j/rosen-archive/favicon.ico`
- [ ] shared-styles.css path: `/j/rosen-archive/shared-styles.css`

**Data Paths:**
- [ ] Uses `archiveService.js` for data loading
- [ ] No direct `./data/` references in components
- [ ] Respects `IS_LOCAL` detection

### 3. Component Patterns

**State Management:**
- [ ] State lifted to appropriate parent
- [ ] No unnecessary state duplication
- [ ] Props passed down, not sideways

**Shared Components:**
- [ ] Uses `Button`, `Card`, `Modal` from `shared/`
- [ ] Consistent variant usage (primary, secondary, ghost, danger)
- [ ] No reimplementation of shared patterns

**HTM Syntax:**
- [ ] Components referenced as `<${Component}>` not `<Component>`
- [ ] String interpolation uses `${}` not `{}`
- [ ] Arrays mapped correctly: `${items.map(i => html\`...\`)}`

### 4. Data Schema Compliance

**Record Fields:**
- [ ] IDs follow `PREFIX-NNNNN` format
- [ ] Dates in `YYYY-MM-DD` format
- [ ] Eras from approved list
- [ ] Categories from approved list

**Entity Fields:**
- [ ] Entity IDs follow `ENT-NNNNN` format
- [ ] Relationship types are consistent
- [ ] No orphan references

### 5. Dissertation Tool Standards

**File Structure:**
- [ ] index.html, data.js, script.js present
- [ ] Standalone (no dependencies on main app)
- [ ] Self-contained styles or uses shared-styles.css

**Content Accuracy:**
- [ ] Quotes match dissertation source
- [ ] Page references are accurate
- [ ] Concepts align with glossary

**Accessibility:**
- [ ] Semantic HTML elements
- [ ] ARIA labels where needed
- [ ] Keyboard navigation works
- [ ] Mobile responsive

### 6. Backend Standards

**Python Code:**
- [ ] Uses Poetry for dependencies
- [ ] Follows existing processor patterns
- [ ] Error handling with logging
- [ ] Rate limiting for API calls

**Data Processing:**
- [ ] Validates input before processing
- [ ] Handles edge cases (empty, malformed)
- [ ] Preserves existing data on errors

### 7. Security

- [ ] No API keys or credentials in code
- [ ] No PII exposed in data files
- [ ] User input sanitized
- [ ] No eval() or innerHTML with user content

### 8. Performance

- [ ] Large datasets paginated or lazy loaded
- [ ] Images optimized
- [ ] No blocking operations in render
- [ ] Cache headers appropriate

## Review Checklist Template

```markdown
## Code Review: [PR/Commit Title]

### Architecture
- [ ] Zero-build compatible
- [ ] Import versions consistent
- [ ] HTM syntax correct

### Paths
- [ ] Production paths correct
- [ ] No localhost hardcoding
- [ ] Data loading via service

### Components
- [ ] Uses shared components
- [ ] State management appropriate
- [ ] Props flow correct

### Data
- [ ] Schema compliant
- [ ] No orphan references
- [ ] Consistent formatting

### Quality
- [ ] Accessible
- [ ] Mobile responsive
- [ ] Secure
- [ ] Performant

### Notes
[Specific observations or concerns]
```

## Common Review Findings

### Finding: Missing Version Query Params

**Problem:**
```javascript
import { Sidebar } from './components/Sidebar.js';
```

**Fix:**
```javascript
import { Sidebar } from './components/Sidebar.js?v=2.0.2';
```

### Finding: JSX Instead of HTM

**Problem:**
```javascript
return <div className="p-4"><Button>Click</Button></div>;
```

**Fix:**
```javascript
return html`<div className="p-4"><${Button}>Click</${Button}></div>`;
```

### Finding: Relative Data Path

**Problem:**
```javascript
fetch('./data/archive-core.json')
```

**Fix:**
```javascript
import { fetchArchiveData } from './services/archiveService.js?v=2.0.2';
// Then use fetchArchiveData() which handles paths
```

### Finding: Hardcoded Navigation

**Problem:**
```html
<a href="../dissertation/">Back</a>
```

**Fix:**
```html
<a href="/j/rosen-archive/dissertation/">Back</a>
```

### Finding: Incorrect Era Value

**Problem:**
```javascript
era: "Early Days"
```

**Fix:**
```javascript
era: "Early Internet Era (1999-2004)"
```

## Integration

- **zero-build-frontend** - Architecture standards
- **deployment-manager** - Path standards
- **archive-validation** - Data standards
- **version-manager** - Version standards

---

## Skill Metadata
**Created**: 2025-12-25
**Author**: Claude Code
**Version**: 1.0.0
