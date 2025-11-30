# HTML Reader Architecture: "The Impossible Press"

**Status:** DRAFT - Technical Architecture

---

## Overview

This document defines the technical architecture for the dissertation HTML reader. The reader will be a standalone, self-contained web application that presents the dissertation in a clean, accessible reading format while maintaining integration with the Jay Rosen Digital Archive.

---

## Architecture Principles

1. **Progressive Enhancement**: Core content readable without JavaScript
2. **Self-Contained**: No external runtime dependencies (fonts embedded, no CDNs)
3. **Offline-First**: Works offline via Service Worker after first load
4. **Accessible**: WCAG 2.1 AA compliant from the ground up
5. **Performant**: < 2s load on 3G, instant navigation

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BUILD PIPELINE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   impossible-press.md  ──►  Markdown Parser  ──►  AST           │
│                                    │                             │
│                                    ▼                             │
│                            Content Processor                     │
│                            (heading IDs, footnotes)              │
│                                    │                             │
│                                    ▼                             │
│                         ┌─────────┴─────────┐                   │
│                         │                   │                    │
│                         ▼                   ▼                    │
│                   index.html          toc.json                   │
│                   (full content)      (navigation)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      RUNTIME COMPONENTS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Navigator  │  │   Settings   │  │   Progress   │          │
│  │              │  │   Manager    │  │   Tracker    │          │
│  │  - ToC       │  │              │  │              │          │
│  │  - Chapter   │  │  - Theme     │  │  - Scroll %  │          │
│  │  - Scroll    │  │  - FontSize  │  │  - Chapter   │          │
│  └──────────────┘  │  - Storage   │  │  - Time      │          │
│         │          └──────────────┘  └──────────────┘          │
│         │                 │                 │                    │
│         └─────────────────┴─────────────────┘                   │
│                           │                                      │
│                           ▼                                      │
│                    ┌──────────────┐                             │
│                    │  App State   │                             │
│                    │  (localStorage)                            │
│                    └──────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Content Structure Analysis

The dissertation markdown has the following structure:

```
├── Title Page (metadata)
├── Acknowledgments
├── Table of Contents
├── Epigraphs
├── Introduction: Journalism as a Transaction
├── Part One: The Making of the Modern Public
│   ├── Chapter 1: Democracy and Distance
│   ├── Chapter 2: Two Views of News
│   ├── Chapter 3: The Universal Town Meeting
│   ├── Chapter 4: From Crowd to Public
│   └── Chapter 5: Communication Without Community
├── Part Two: The Public and the Professionalized Press
│   ├── Chapter 6: The Impossible Press
│   ├── Chapter 7: The Myth of the Omnicompetent Citizen
│   └── Chapter 8: The Art and Science of Forming a Public
├── Conclusion: Toward an Ecological View of Press and Public
├── Notes
└── Works Consulted
```

---

## Component Architecture

### 1. Shell Component (index.html)

The main HTML shell provides the structural framework:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The Impossible Press | Jay Rosen (1986)</title>

  <!-- Critical CSS inlined -->
  <style>/* ... */</style>

  <!-- Preload fonts -->
  <link rel="preload" href="fonts/charter.woff2" as="font" crossorigin>

  <!-- Theme initialization (prevents flash) -->
  <script>/* inline theme check */</script>
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>

  <header class="reader-header">
    <!-- Title, settings, archive link -->
  </header>

  <nav class="reader-nav" aria-label="Table of contents">
    <!-- ToC sidebar -->
  </nav>

  <main id="main-content" class="reader-content">
    <!-- Dissertation content -->
  </main>

  <footer class="reader-footer">
    <!-- Citation, download, links -->
  </footer>

  <!-- Deferred JS -->
  <script src="js/reader.js" defer></script>
</body>
</html>
```

### 2. Navigation Component

```javascript
// navigation.js
class ReaderNavigation {
  constructor() {
    this.toc = null;           // Table of contents data
    this.currentSection = null; // Active section ID
    this.observer = null;       // IntersectionObserver for scroll tracking
  }

  init() {
    this.buildToc();
    this.setupScrollTracking();
    this.setupKeyboardNav();
  }

  buildToc() {
    // Generate ToC from heading elements
    // Create collapsible part sections
    // Highlight current location
  }

  setupScrollTracking() {
    // IntersectionObserver to track visible section
    // Update ToC highlighting
    // Update progress bar
  }

  setupKeyboardNav() {
    // Arrow keys for chapter navigation
    // Escape to toggle ToC
    // Slash for search (optional)
  }

  scrollToSection(id) {
    // Smooth scroll to section
    // Update URL hash
    // Update state
  }
}
```

### 3. Settings Component

```javascript
// settings.js
class ReaderSettings {
  constructor() {
    this.defaults = {
      theme: 'system',      // 'light' | 'dark' | 'system'
      fontSize: 'medium',   // 'small' | 'medium' | 'large'
      lineHeight: 'normal', // 'compact' | 'normal' | 'relaxed'
    };
    this.state = this.load();
  }

  load() {
    // Load from localStorage
    // Merge with defaults
  }

  save() {
    // Persist to localStorage
  }

  setTheme(theme) {
    // Update CSS custom properties
    // Respect system preference if 'system'
    // Save state
  }

  setFontSize(size) {
    // Update root font-size
    // Save state
  }

  getMediaPreference() {
    // Check prefers-color-scheme
  }
}
```

### 4. Progress Component

```javascript
// progress.js
class ReadingProgress {
  constructor() {
    this.startTime = Date.now();
    this.currentChapter = null;
    this.progress = 0;
  }

  init() {
    this.loadProgress();
    this.setupTracking();
  }

  loadProgress() {
    // Restore last position from localStorage
    // Offer "continue reading" if applicable
  }

  updateProgress(scrollPercent, sectionId) {
    // Update progress bar
    // Save position periodically
  }

  calculateScrollProgress() {
    // Return 0-100 based on scroll position
  }

  savePosition() {
    // Store current scroll position + section
  }
}
```

---

## CSS Architecture

### File Organization

```
css/
├── variables.css      # CSS custom properties
├── reset.css          # Minimal reset/normalize
├── typography.css     # Font definitions, reading styles
├── layout.css         # Grid, flexbox layouts
├── components.css     # Header, nav, footer styles
├── utilities.css      # Helper classes
├── print.css          # Print-specific styles
└── main.css           # Imports all above
```

### CSS Custom Properties

```css
/* variables.css */
:root {
  /* Colors - Light */
  --color-bg: #faf9f7;
  --color-bg-secondary: #f0efed;
  --color-text: #1a1a1a;
  --color-text-secondary: #4a4a4a;
  --color-accent: #2563eb;
  --color-accent-hover: #1d4ed8;
  --color-border: #e5e5e5;

  /* Typography */
  --font-body: 'Charter', 'Georgia', 'Times New Roman', serif;
  --font-heading: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;

  /* Sizes */
  --font-size-base: 18px;
  --font-size-small: 16px;
  --font-size-large: 20px;

  --line-height-body: 1.7;
  --line-height-heading: 1.3;

  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 2rem;
  --space-xl: 4rem;

  /* Layout */
  --content-max-width: 680px;
  --toc-width: 280px;
  --header-height: 60px;
}

/* Dark mode */
[data-theme="dark"] {
  --color-bg: #1a1a1a;
  --color-bg-secondary: #252525;
  --color-text: #e5e5e5;
  --color-text-secondary: #a0a0a0;
  --color-accent: #60a5fa;
  --color-accent-hover: #93c5fd;
  --color-border: #333333;
}

/* Font size variants */
[data-font-size="small"] { --font-size-base: 16px; }
[data-font-size="large"] { --font-size-base: 20px; }
```

---

## Build Process

### Markdown Processing Pipeline

```javascript
// build/process-dissertation.js

const fs = require('fs');
const marked = require('marked');

class DissertationProcessor {
  constructor(sourcePath) {
    this.sourcePath = sourcePath;
    this.content = '';
    this.toc = [];
    this.headingCounter = 0;
  }

  async process() {
    // 1. Read source markdown
    this.content = await fs.promises.readFile(this.sourcePath, 'utf-8');

    // 2. Pre-process: clean up OCR artifacts
    this.content = this.cleanContent(this.content);

    // 3. Extract and process headings
    this.toc = this.extractToc(this.content);

    // 4. Convert to HTML with custom renderer
    const html = this.convertToHtml(this.content);

    // 5. Wrap in template
    return this.wrapInTemplate(html);
  }

  cleanContent(md) {
    // Remove excessive blank lines
    // Fix common OCR issues
    // Normalize quote marks
    return md
      .replace(/^#\s*$/gm, '')           // Empty headings
      .replace(/\n{4,}/g, '\n\n\n')      // Max 3 newlines
      .replace(/\.\s+\)/g, ')')          // Fix spacing
      .trim();
  }

  extractToc(md) {
    const toc = [];
    const headingRegex = /^(#{1,3})\s+\*?\*?(.+?)\*?\*?\s*$/gm;
    let match;

    while ((match = headingRegex.exec(md)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = this.generateId(text);

      if (text && !text.match(/^\s*$/)) {
        toc.push({ level, text, id });
      }
    }

    return toc;
  }

  generateId(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }

  convertToHtml(md) {
    // Custom marked renderer
    const renderer = new marked.Renderer();

    renderer.heading = (text, level) => {
      const id = this.generateId(text);
      return `<h${level} id="${id}">${text}</h${level}>`;
    };

    renderer.blockquote = (quote) => {
      return `<blockquote class="dissertation-quote">${quote}</blockquote>`;
    };

    marked.setOptions({
      renderer,
      gfm: true,
      breaks: false,
    });

    return marked.parse(md);
  }

  wrapInTemplate(html) {
    // Load template, inject content
    // Include ToC in nav
    return `<!-- Generated dissertation HTML -->
${html}`;
  }
}
```

### Build Script

```bash
#!/bin/bash
# build/build-reader.sh

set -e

echo "Building dissertation reader..."

# 1. Process markdown
node build/process-dissertation.js

# 2. Bundle CSS
npx postcss css/main.css -o dist/reader.css

# 3. Bundle JS
npx esbuild js/reader.js --bundle --minify --outfile=dist/reader.js

# 4. Copy assets
cp -r fonts dist/
cp -r assets dist/

# 5. Generate service worker
node build/generate-sw.js

echo "Build complete!"
```

---

## File Structure

```
dissertation-reader/
├── build/
│   ├── process-dissertation.js   # MD → HTML converter
│   ├── generate-sw.js            # Service worker generator
│   └── build-reader.sh           # Build script
├── src/
│   ├── css/
│   │   ├── variables.css
│   │   ├── reset.css
│   │   ├── typography.css
│   │   ├── layout.css
│   │   ├── components.css
│   │   ├── utilities.css
│   │   ├── print.css
│   │   └── main.css
│   ├── js/
│   │   ├── navigation.js
│   │   ├── settings.js
│   │   ├── progress.js
│   │   └── reader.js             # Main entry point
│   ├── fonts/
│   │   ├── charter-regular.woff2
│   │   ├── charter-italic.woff2
│   │   └── charter-bold.woff2
│   └── templates/
│       └── shell.html            # Base HTML template
├── dist/                          # Built output
│   ├── index.html
│   ├── reader.css
│   ├── reader.js
│   ├── fonts/
│   └── sw.js
├── package.json
└── README.md
```

---

## Integration Points

### With Jay Rosen Digital Archive

1. **Header Link**: "Part of the Jay Rosen Digital Archive" → archive homepage
2. **Footer Links**: "View in Archive" → dissertation record page
3. **Citation Helper**: Pre-formatted citations matching archive format
4. **PDF Download**: Link to unified PDF (separate asset)

### URL Structure

```
/dissertation/                    # Reader entry point
/dissertation/#introduction       # Deep link to section
/dissertation/#chapter-6          # Deep link to chapter
/archive/record/dissertation-001  # Archive record page
```

---

## Performance Budget

| Metric | Target | Notes |
|--------|--------|-------|
| First Contentful Paint | < 1.5s | Critical CSS inlined |
| Largest Contentful Paint | < 2.5s | Hero text visible |
| Time to Interactive | < 3.0s | JS deferred |
| Total Page Weight | < 500KB | Fonts are main cost |
| JavaScript | < 30KB | Vanilla JS, no framework |
| CSS | < 20KB | Minimal, modular |

---

## Accessibility Checklist

- [ ] All headings use proper hierarchy (h1 → h2 → h3)
- [ ] Skip link to main content
- [ ] Focus indicators visible on all interactive elements
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Dark mode respects prefers-color-scheme
- [ ] Font sizes respect browser default settings
- [ ] ToC navigable by keyboard
- [ ] Screen reader announcements for state changes
- [ ] Print stylesheet maintains readability

---

## Implementation Phases

### Phase 1: Core Reader (MVP)
- [ ] Process markdown to HTML
- [ ] Basic HTML template with semantic structure
- [ ] Core typography and layout CSS
- [ ] Table of contents (static)
- [ ] Responsive design (mobile/desktop)

### Phase 2: Interactivity
- [ ] Scroll-synced ToC highlighting
- [ ] Settings panel (theme, font size)
- [ ] localStorage persistence
- [ ] Progress bar

### Phase 3: Polish
- [ ] Service worker for offline
- [ ] Print stylesheet
- [ ] Citation copy helper
- [ ] "Continue reading" feature
- [ ] Smooth scroll navigation

### Phase 4: Integration
- [ ] Link to archive
- [ ] PDF download
- [ ] Analytics (optional)
- [ ] Final testing and QA

---

*Last Updated: November 2025*
