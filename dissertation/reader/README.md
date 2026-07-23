# Dissertation reader: "The Impossible Press"

A clean, accessible HTML reading experience for Jay Rosen's 1986 doctoral dissertation.

> `index.html` is the canonical source — edit it directly. There is no build step: the legacy `build-reader.py` + `src/templates/shell.html` generator was retired in #229 because the committed `index.html` had diverged with production features the template never had. `src/css/` and `src/js/` are loaded by `index.html` at runtime.

## Overview

The reader presents Jay Rosen's dissertation as a styled, navigable web application optimized for extended reading. The source text lives in `src/impossible-press.md`; the served page is the hand-maintained `index.html`.

## Features

- **Navigation**: Sticky table of contents, smooth scroll, keyboard navigation
- **Reading experience**: Adjustable text size, dark mode, print-friendly
- **Accessibility**: WCAG 2.1 AA compliant, screen reader optimized
- **Progress**: Reading position saved, resume functionality
- **Offline**: Works offline via Service Worker (after first load)
- **Text selection menu**: Highlight text to share, cite, or copy
  - **Share**: Generate social media-ready PNG with quote and citation
  - **Cite**: Copy APA-format citation with chapter reference
  - **Copy**: Quick copy selected text to clipboard
- **Quick actions**: Header buttons for PDF download, NotebookLM, and Archive access

## Directory structure

```
dissertation/reader/
├── index.html                # The reader (canonical source — edit directly)
├── src/
│   ├── impossible-press.md    # Dissertation source text
│   ├── css/
│   │   ├── variables.css      # CSS custom properties
│   │   ├── typography.css     # Reading-optimized type styles
│   │   ├── layout.css         # Responsive layout
│   │   └── main.css           # Entry point (loaded by index.html)
│   └── js/
│       ├── settings.js        # Theme, font size, preferences
│       ├── navigation.js      # ToC, scroll tracking
│       ├── progress.js        # Reading progress
│       └── reader.js          # Main entry point (loaded by index.html)
└── README.md
```

## Editing

`index.html` is the canonical, hand-maintained source — edit it directly. The styles in `src/css/` and the scripts in `src/js/` are loaded by `index.html` at runtime with a cache-busting `?v=` query string, so bump that string when you change them. There is no build or bundle step.

To preview locally, run `npm run preview` from the repository root and open `http://localhost:8000/dissertation/reader/` — the preview server serves the repo root with the same path layout as production.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Alt + Left` | Previous chapter |
| `Alt + Right` | Next chapter |
| `Ctrl + Home` | Go to top |
| `Ctrl + End` | Go to bottom |
| `Escape` | Close menu/settings |

## Browser support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

The dissertation content is &copy; 1986 Jay Rosen.
The reader code is part of Jay Rosen's Internet Archive project.
