---
name: dissertation-tool-generator
description: Generate new standalone dissertation tools following the established patterns. Use when creating new interactive features for the dissertation content.
---

# Dissertation Tool Generator

Create new standalone tools for the Jay Rosen dissertation presentation. All tools follow a consistent pattern for deployment and maintenance.

## When to Activate

- Creating a new dissertation feature tool
- Adding interactive functionality to dissertation content
- Building searchable/filterable views of dissertation data
- Creating comparison or timeline visualizations

## Existing Tools Reference

| Tool | Path | Pattern | Records |
|------|------|---------|---------|
| Glossary | `/features/glossary/` | Filterable cards | 16 concepts |
| FAQ | `/features/faq/` | Searchable accordion | 46 Q&A |
| Comparison | `/features/comparison-tool/` | Side-by-side panels | 7 entries |
| Timeline | `/features/timeline/` | Vertical timeline | 14 entries |
| Context 1986 | `/features/context-1986/` | Sectioned content | 5 sections |
| Excerpts | `/features/annotated-excerpts/` | Card with drawer | 12 passages |
| Reader | `/features/dissertation-reader/` | Full text view | Full dissertation |
| Network | `/features/network-effect/` | Force graph | Entity relationships |

## Tool Scaffold Structure

```
features/[tool-name]/
├── index.html      # Self-contained HTML (~200 lines)
├── data.js         # Content data export (~100-500 lines)
├── script.js       # Interactive logic (~200-400 lines)
└── styles.css      # Custom styles (optional)
```

## Step 1: Create index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Tool Name] | The Impossible Press</title>
    <link rel="icon" type="image/x-icon" href="/j/rosen-archive/favicon.ico">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=Roboto+Mono:wght@400;500;600&display=swap" rel="stylesheet">

    <!-- Tailwind -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        'typewriter': ['"Special Elite"', 'monospace'],
                        'mono': ['"Roboto Mono"', 'monospace'],
                    },
                    colors: {
                        paper: '#fdfbf7',
                        'paper-dark': '#f5f0e6',
                    }
                }
            }
        }
    </script>

    <!-- Shared styles -->
    <link rel="stylesheet" href="/j/rosen-archive/shared-styles.css">

    <!-- Tool styles (optional) -->
    <link rel="stylesheet" href="styles.css">
</head>
<body class="bg-paper min-h-screen font-mono text-stone-800">
    <!-- Header -->
    <header class="bg-white/80 backdrop-blur-sm border-b border-stone-200 sticky top-0 z-50">
        <div class="max-w-6xl mx-auto px-4 py-4">
            <div class="flex items-center justify-between">
                <div>
                    <a href="/j/rosen-archive/dissertation/"
                       class="text-stone-500 hover:text-stone-700 text-sm flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                        Back to Dissertation
                    </a>
                    <h1 class="font-typewriter text-2xl md:text-3xl text-stone-900 mt-1">
                        [Tool Title]
                    </h1>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-6xl mx-auto px-4 py-8">
        <!-- Search/Filter Bar (if needed) -->
        <div class="mb-8">
            <div class="relative">
                <input type="text"
                       id="searchInput"
                       placeholder="Search..."
                       class="w-full px-4 py-3 pl-10 rounded-lg border border-stone-300
                              focus:ring-2 focus:ring-amber-500 focus:border-transparent">
                <svg class="absolute left-3 top-3.5 w-5 h-5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
            </div>
        </div>

        <!-- Content Container -->
        <div id="contentContainer" class="grid gap-6">
            <!-- Items rendered by script.js -->
        </div>

        <!-- Empty State -->
        <div id="emptyState" class="hidden text-center py-12 text-stone-500">
            <p>No items match your search.</p>
        </div>
    </main>

    <!-- Footer -->
    <footer class="bg-white/50 border-t border-stone-200 mt-12">
        <div class="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-stone-500">
            <p>From "The Impossible Press" (1986) by Jay Rosen</p>
            <a href="/j/rosen-archive/dissertation/" class="text-amber-600 hover:text-amber-700">
                Return to main dissertation page
            </a>
        </div>
    </footer>

    <!-- Scripts -->
    <script type="module" src="data.js"></script>
    <script type="module" src="script.js"></script>
</body>
</html>
```

## Step 2: Create data.js

Choose the appropriate data structure:

### Glossary-Style (Term Definitions)
```javascript
export const DATA = [
    {
        id: 'unique-id',
        term: 'Term Name',
        definition: 'Full definition text...',
        category: 'Category Name',
        pageRef: 'pp. 45-47',
        relatedTerms: ['related-id-1', 'related-id-2'],
        contemporary: 'Modern relevance note (optional)'
    }
];

export const CATEGORIES = [
    'All',
    'Category 1',
    'Category 2'
];
```

### FAQ-Style (Questions and Answers)
```javascript
export const DATA = [
    {
        id: 'q1',
        question: 'Question text?',
        answer: 'Answer text with <strong>HTML</strong> allowed.',
        category: 'Category',
        keywords: ['keyword1', 'keyword2']
    }
];
```

### Comparison-Style (Before/After)
```javascript
export const DATA = [
    {
        id: 'comp-1',
        title: 'Comparison Title',
        theme: 'Theme Name',
        then: {
            year: 1986,
            text: 'Historical context...',
            quote: 'Original quote from dissertation',
            pageRef: 'p. 123'
        },
        now: {
            year: 2025,
            text: 'Contemporary context...',
            examples: ['Example 1', 'Example 2']
        }
    }
];
```

### Timeline-Style (Chronological)
```javascript
export const DATA = [
    {
        id: 'event-1',
        year: 1986,
        title: 'Event Title',
        description: 'Event description...',
        type: 'dissertation|publication|event',
        significance: 'Why this matters'
    }
];
```

## Step 3: Create script.js

```javascript
import { DATA, CATEGORIES } from './data.js';

// DOM Elements
const searchInput = document.getElementById('searchInput');
const contentContainer = document.getElementById('contentContainer');
const emptyState = document.getElementById('emptyState');

// State
let activeCategory = 'All';
let searchQuery = '';

// Render Functions
function renderItem(item) {
    return `
        <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6
                    hover:shadow-md transition-shadow" data-id="${item.id}">
            <h3 class="font-typewriter text-lg text-stone-900 mb-2">
                ${item.title || item.term || item.question}
            </h3>
            <p class="text-stone-600 text-sm">
                ${item.definition || item.answer || item.description}
            </p>
            ${item.pageRef ? `
                <span class="inline-block mt-3 text-xs text-amber-600 bg-amber-50
                             px-2 py-1 rounded">
                    ${item.pageRef}
                </span>
            ` : ''}
        </div>
    `;
}

function render() {
    // Filter data
    const filtered = DATA.filter(item => {
        const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
        const matchesSearch = searchQuery === '' ||
            JSON.stringify(item).toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // Update UI
    if (filtered.length === 0) {
        contentContainer.innerHTML = '';
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        contentContainer.innerHTML = filtered.map(renderItem).join('');
    }

    // Update result count
    updateResultCount(filtered.length);
}

function updateResultCount(count) {
    const countEl = document.getElementById('resultCount');
    if (countEl) {
        countEl.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
    }
}

// Event Handlers
searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
});

// Keyboard Navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        searchInput.value = '';
        searchQuery = '';
        render();
    }
    if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput?.focus();
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    render();
});
```

## Step 4: Add Navigation Links

Update the dissertation landing page navigation:

```javascript
// In labs/dissertation-launch/landing-page/index.html
// Add to the tools grid:
{
    title: '[Tool Name]',
    description: 'Brief description...',
    icon: '...', // SVG or emoji
    link: '/j/rosen-archive/features/[tool-name]/'
}
```

## Design Patterns

### Card Layouts
```html
<!-- Single column -->
<div class="grid gap-6">

<!-- Two columns on medium+ -->
<div class="grid md:grid-cols-2 gap-6">

<!-- Three columns on large+ -->
<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
```

### Category Badges
```html
<span class="inline-block px-2 py-1 text-xs rounded-full
             bg-amber-100 text-amber-800">
    Category
</span>
```

### Page References
```html
<span class="text-xs text-stone-500 font-mono">
    pp. 45-47
</span>
```

### Expandable Content
```javascript
function toggleExpand(id) {
    const el = document.querySelector(`[data-id="${id}"] .expandable`);
    el.classList.toggle('hidden');
    const btn = document.querySelector(`[data-id="${id}"] .expand-btn`);
    btn.textContent = el.classList.contains('hidden') ? 'Show more' : 'Show less';
}
```

## Pre-Deployment Checklist

- [ ] Favicon path: `/j/rosen-archive/favicon.ico`
- [ ] Shared styles: `/j/rosen-archive/shared-styles.css`
- [ ] Navigation links use absolute paths
- [ ] Mobile responsive (test at 375px width)
- [ ] Keyboard accessible (Tab, Enter, Escape)
- [ ] Search works with empty results state
- [ ] Page title includes "| The Impossible Press"

## Integration

- **zero-build-frontend** - Architectural foundation
- **deployment-manager** - Path configuration for production
- **archive-validation** - Validates data.js content

---

## Skill Metadata
**Created**: 2025-12-25
**Author**: Claude Code
**Version**: 1.0.0
