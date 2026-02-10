# Building a 30,000-Record Archive with AI: A Technical Case Study

*Entity extraction, knowledge graphs, and zero-build deployment for digital humanities*

---

## Overview

The Jay Rosen Internet Archive is a research platform containing 869 curated records and 29,187 social media posts spanning 40 years of journalism criticism. This post covers the technical architecture, focusing on three challenges:

1. **Entity extraction at scale** - Processing 10,000 posts with Gemini API
2. **Knowledge graph construction** - Building 16,539 relationships
3. **Zero-build deployment** - React without Node.js

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Google Sheets  │────▶│  Python Pipeline │────▶│  Static JSON    │
│  (curator UI)   │     │  (Gemini API)    │     │  (25MB)         │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  React Frontend │
                                                 │  (CDN-loaded)   │
                                                 └─────────────────┘
```

The pipeline has three stages:
1. **Ingestion** - Content dispatched to specialized processors (articles, videos, social media, PDFs)
2. **Enrichment** - AI categorization, entity extraction, relationship mapping
3. **Export** - Static JSON for zero-build frontend consumption

---

## Challenge 1: Entity Extraction at Scale

### The Problem

We needed to extract entities (people, organizations, concepts, works) from 10,000 social media posts. Sequential processing would take ~7 hours and cost ~$100.

### The Solution: Parallel Processing with Rate Limiting

```python
from concurrent.futures import ProcessPoolExecutor
import time

def process_post(post_data):
    """Process a single post through Gemini API."""
    # Per-worker rate limiting (2s between calls)
    time.sleep(2)

    response = gemini_model.generate_content(
        ENTITY_EXTRACTION_PROMPT.format(content=post_data['text'])
    )

    return parse_entities(response.text)

def batch_extract(posts, num_workers=5):
    """Parallel extraction with worker pools."""
    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        results = list(executor.map(process_post, posts))
    return results
```

### Results

| Metric | Sequential | Parallel (5 workers) |
|--------|------------|---------------------|
| Time | 7 hours | 91 minutes |
| Cost | ~$100 | ~$50 |
| Success rate | - | 90.1% |

**Key insight**: Per-worker rate limiting (`time.sleep(2)`) prevents API quota exhaustion while maximizing throughput.

---

## Challenge 2: Entity Deduplication

### The Problem

"The New York Times," "NY Times," "NYT," and "New York Times" were being treated as four different entities.

### The Solution: Normalization Pipeline

```python
class EntityRegistry:
    def __init__(self):
        self.canonical_ids = {}
        self.name_variations = {}

    def normalize(self, entity_name: str) -> str:
        """Normalize entity name for matching."""
        normalized = entity_name.lower().strip()

        # Remove common prefixes
        if normalized.startswith('the '):
            normalized = normalized[4:]

        # Strip punctuation
        normalized = re.sub(r'[^\w\s]', '', normalized)

        return normalized

    def register(self, entity_name: str, entity_type: str) -> str:
        """Register entity, returning canonical ID."""
        normalized = self.normalize(entity_name)

        if normalized in self.canonical_ids:
            # Track variation
            self.name_variations[entity_name] = self.canonical_ids[normalized]
            return self.canonical_ids[normalized]

        # Create new canonical entry
        entity_id = f"{entity_type}-{uuid.uuid4().hex[:8]}"
        self.canonical_ids[normalized] = entity_id
        return entity_id
```

### Results

- **25,972 entities** extracted
- **4,724 unique entities** after deduplication
- **Entity distribution**: 52% People, 32% Organizations, 6% Concepts

---

## Challenge 3: Relationship Augmentation

### The Problem

Flat archive records don't show connections. We needed to build a knowledge graph.

### The Solution: Multi-Dimensional Scoring

```python
def calculate_relationship_strength(record_a: dict, record_b: dict) -> float:
    """Calculate relationship strength between two records."""
    score = 0.0

    # Shared thematic categories (weight: 0.3)
    shared_categories = set(record_a['categories']) & set(record_b['categories'])
    score += 0.3 * (len(shared_categories) / max(len(record_a['categories']), 1))

    # Shared key concepts (weight: 0.4)
    shared_concepts = set(record_a['concepts']) & set(record_b['concepts'])
    score += 0.4 * (len(shared_concepts) / max(len(record_a['concepts']), 1))

    # Shared era (weight: 0.2)
    if record_a['era'] == record_b['era']:
        score += 0.2

    # Entity co-occurrence (weight: 0.1)
    shared_entities = set(record_a['entities']) & set(record_b['entities'])
    score += 0.1 * min(len(shared_entities) / 5, 1.0)

    return score

def build_relationships(records: list, threshold: float = 0.3) -> list:
    """Build relationship graph from records."""
    relationships = []

    for i, record_a in enumerate(records):
        for record_b in records[i+1:]:
            strength = calculate_relationship_strength(record_a, record_b)

            if strength >= threshold:
                relationships.append({
                    'source': record_a['id'],
                    'target': record_b['id'],
                    'strength': strength,
                    'types': list(set(record_a['categories']) & set(record_b['categories']))
                })

    return relationships
```

### Results

- **16,539 relationships** mapped
- **14 relationship types** (Mentions, Criticizes, Cites, Discusses, etc.)
- **856 relationships** added in a single session (expected 150-300)

---

## Challenge 4: Zero-Build Deployment

### The Problem

The archive needed to deploy to WordPress via FTP. No Node.js on the server. No build step possible.

### The Solution: CDN-Loaded React

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.2.0",
      "react-dom": "https://esm.sh/react-dom@18.2.0",
      "htm": "https://esm.sh/htm@3.1.1"
    }
  }
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./frontend/index.js"></script>
</body>
</html>
```

```javascript
// frontend/html.js
import htm from 'htm';
import React from 'react';

export const html = htm.bind(React.createElement);
```

```javascript
// frontend/components/Example.js
import React, { useState } from 'react';
import { html } from '../html.js';

export function Example() {
  const [count, setCount] = useState(0);

  return html`
    <div className="p-4">
      <h1 className="text-2xl">Count: ${count}</h1>
      <button onClick=${() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  `;
}
```

### Key Decisions

1. **HTM instead of JSX** - Tagged template literals, no transpilation needed
2. **Tailwind via CDN** - `<script src="https://cdn.tailwindcss.com"></script>`
3. **Static JSON data** - Pre-processed, no runtime API calls
4. **Import maps** - Native browser ES module resolution

### Benefits

| Aspect | Traditional Build | Zero-Build |
|--------|-------------------|------------|
| Deploy method | CI/CD pipeline | FTP upload |
| Server requirements | Node.js | Any static host |
| Dependency rot risk | High (node_modules) | Low (CDN) |
| Time to first deploy | Minutes | Seconds |

---

## Challenge 5: Data Quality at Scale

### The Problem

After months of processing, we discovered:
- 14 overlapping era definitions
- 862 tag case variations
- 2,992 non-normalized tag instances

### The Solution: Automated Taxonomy Consolidation

```python
def consolidate_taxonomy(records: list) -> list:
    """Consolidate overlapping eras and normalize tags."""

    ERA_MAPPING = {
        'Early Career (1990-1999)': 'Early Career & Public Journalism (1990-1999)',
        'Public Journalism Era (1990-1999)': 'Early Career & Public Journalism (1990-1999)',
        'Blogging Era (2000-2004)': 'Blogging Launch & Digital Disruption (2000-2004)',
        # ... 14 variations mapped to 8 clean eras
    }

    for record in records:
        # Map era to canonical version
        if record['era'] in ERA_MAPPING:
            record['era'] = ERA_MAPPING[record['era']]

        # Normalize tags to consistent casing
        record['tags'] = [normalize_tag(tag) for tag in record['tags']]

    return records

def normalize_tag(tag: str) -> str:
    """Normalize tag to title case with specific exceptions."""
    ACRONYMS = {'nyt', 'nyu', 'cnn', 'bbc', 'npr'}

    words = tag.lower().split()
    normalized = []

    for word in words:
        if word in ACRONYMS:
            normalized.append(word.upper())
        else:
            normalized.append(word.capitalize())

    return ' '.join(normalized)
```

### Results

| Metric | Before | After |
|--------|--------|-------|
| Era definitions | 14 (overlapping) | 8 (clean) |
| Tag variations | 862 | 0 |
| Schema compliance | ~85% | 100% |
| Records updated | - | 650 (98.6%) |

---

## Performance Optimization

### Split Data Architecture

The full archive JSON is 25MB—too large for initial page load.

```javascript
// archiveService.js
const DATA_FILES = {
  core: '/data/archive-core.json',      // 8.3MB - IDs, titles, summaries
  details: '/data/archive-details.json', // 11MB - Full content, lazy-loaded
  entities: '/data/archive-entities.json' // 1.3MB - For network visualization
};

export async function loadCore() {
  // Always load core data on init
  return fetch(DATA_FILES.core).then(r => r.json());
}

export async function loadDetails(recordId) {
  // Lazy-load details when modal opens
  if (!detailsCache) {
    detailsCache = await fetch(DATA_FILES.details).then(r => r.json());
  }
  return detailsCache[recordId];
}
```

### Results

| Metric | Before | After |
|--------|--------|-------|
| Initial load | 25MB | 8.3MB |
| Time to interactive | 1500ms | 100-200ms |
| Modal open (cached) | - | <50ms |

---

## Lessons Learned

### 1. Rate Limiting is Essential

Per-worker delays (`time.sleep(2)`) prevent API quota exhaustion. We processed 10,000 items without a single 429 error.

### 2. Deduplication Must Be Centralized

Entity matching requires a single source of truth. Our `EntityRegistry` class prevented duplicate entities across parallel workers.

### 3. Zero-Build is Viable for Production

CDN-loaded React works. HTM provides JSX-like syntax. Import maps handle dependencies. No build step, no dependency rot.

### 4. Data Quality Requires Vigilance

Taxonomy drift is inevitable in long-running projects. Automated validation scripts caught 14 overlapping era definitions that manual review missed.

### 5. Split Your Data

25MB JSON is too large. Splitting into core (always loaded) and details (lazy-loaded) reduced initial load time by 87%.

---

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | React 18 via esm.sh, HTM, Tailwind CSS |
| Visualization | Three.js (3D), HTML5 Canvas (network) |
| Data processing | Python 3.11, Gemini API, Playwright |
| Entity extraction | Google Gemini with parallel processing |
| Storage | Static JSON, Google Sheets (curator UI) |
| Deployment | Static files via FTP to WordPress |

---

## Repository

The complete codebase is available at:
- [github.com/jamditis/rosen-frontend](https://github.com/jamditis/rosen-frontend)

---

*Joe Amditis built the Jay Rosen Internet Archive with Claude (Anthropic) and GitHub Copilot. The archive processes 869 curated records and 29,187 social posts into an interconnected knowledge graph.*
