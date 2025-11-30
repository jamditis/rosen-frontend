# Dissertation Reader: "The Impossible Press"

A clean, accessible HTML reading experience for Jay Rosen's 1986 doctoral dissertation.

## Overview

This reader converts the dissertation markdown (`/frontend/web/95/impossible-press.md`) into a styled, navigable web application with features optimized for extended reading.

## Features

- **Navigation**: Sticky table of contents, smooth scroll, keyboard navigation
- **Reading Experience**: Adjustable text size, dark mode, print-friendly
- **Accessibility**: WCAG 2.1 AA compliant, screen reader optimized
- **Progress**: Reading position saved, resume functionality
- **Offline**: Works offline via Service Worker (after first load)

## Directory Structure

```
dissertation-reader/
├── build/                    # Build scripts
├── src/
│   ├── css/
│   │   ├── variables.css     # CSS custom properties
│   │   ├── typography.css    # Reading-optimized type styles
│   │   ├── layout.css        # Responsive layout
│   │   └── main.css          # Entry point
│   ├── js/
│   │   ├── settings.js       # Theme, font size, preferences
│   │   ├── navigation.js     # ToC, scroll tracking
│   │   ├── progress.js       # Reading progress
│   │   └── reader.js         # Main entry point
│   ├── fonts/                # Self-hosted fonts
│   └── templates/
│       └── shell.html        # HTML template
├── dist/                     # Built output
└── README.md
```

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
cd frontend/dissertation-reader
npm install
```

### Build

```bash
npm run build
```

This will:
1. Process the dissertation markdown
2. Bundle CSS and JS
3. Generate the final HTML
4. Copy to `dist/`

### Development Server

```bash
npm run dev
```

## Architecture

See `/release-assets/dissertation/digital-presentation/html-reader-architecture.md` for detailed technical documentation.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Alt + Left` | Previous chapter |
| `Alt + Right` | Next chapter |
| `Ctrl + Home` | Go to top |
| `Ctrl + End` | Go to bottom |
| `Escape` | Close menu/settings |

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

The dissertation content is &copy; 1986 Jay Rosen.
The reader code is part of the Jay Rosen Digital Archive project.
