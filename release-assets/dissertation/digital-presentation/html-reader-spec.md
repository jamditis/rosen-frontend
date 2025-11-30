# HTML Reader Specification: "The Impossible Press"

**Status:** COMPLETE (Specification)

**Related Documents:**
- [Architecture Document](./html-reader-architecture.md) - Technical implementation details

---

## Overview

Create a clean, accessible HTML reading experience for the dissertation, converting the existing markdown (`/frontend/web/95/impossible-press.md`) into a styled, navigable web page.

---

## Requirements

### Functional Requirements

1. **Navigation**
   - Sticky table of contents sidebar (desktop) / hamburger menu (mobile)
   - Chapter links with smooth scroll
   - "Back to top" button
   - Progress indicator showing reading position
   - Previous/Next chapter navigation

2. **Reading Experience**
   - Clean, readable typography
   - Adjustable text size (3 levels minimum)
   - Dark mode toggle
   - Print-friendly stylesheet
   - Line spacing controls (optional)

3. **Accessibility**
   - WCAG 2.1 AA compliance
   - Semantic HTML structure
   - Skip navigation link
   - Screen reader optimized
   - Keyboard navigable
   - Focus indicators

4. **Integration**
   - Links to full archive
   - Citation helper (copy formatted citation)
   - Share functionality
   - PDF download link

### Non-Functional Requirements

- Load time < 2 seconds on 3G
- No external dependencies (self-contained)
- Works offline once loaded
- Responsive: mobile, tablet, desktop

---

## Design Specifications

### Typography

```css
/* Primary reading font */
font-family: 'Charter', 'Georgia', serif;
font-size: 18px; /* base */
line-height: 1.7;

/* Headings */
font-family: 'system-ui', sans-serif;

/* Code/citations */
font-family: 'Menlo', 'Monaco', monospace;
```

### Color Palette

**Light Mode:**
```css
--bg-primary: #faf9f7;
--text-primary: #1a1a1a;
--text-secondary: #4a4a4a;
--accent: #2563eb;
--border: #e5e5e5;
```

**Dark Mode:**
```css
--bg-primary: #1a1a1a;
--text-primary: #e5e5e5;
--text-secondary: #a0a0a0;
--accent: #60a5fa;
--border: #333333;
```

### Layout

```
Desktop (>1024px):
┌─────────────────────────────────────────────────┐
│ Header: Title + Archive Link                     │
├───────────┬─────────────────────────────────────┤
│           │                                      │
│  Table    │     Main Content Area               │
│   of      │     (max-width: 680px)              │
│ Contents  │                                      │
│  (240px)  │                                      │
│           │                                      │
├───────────┴─────────────────────────────────────┤
│ Footer: Citations, Archive Links                 │
└─────────────────────────────────────────────────┘

Mobile (<768px):
┌──────────────────────┐
│ Header + Menu Toggle │
├──────────────────────┤
│                      │
│   Main Content       │
│   (full width        │
│    with padding)     │
│                      │
├──────────────────────┤
│ Footer               │
└──────────────────────┘
```

---

## Component Specifications

### Header
- Dissertation title
- "Part of the Jay Rosen Digital Archive" link
- Settings gear (text size, dark mode)
- Menu toggle (mobile)

### Table of Contents
- All chapters listed
- Current chapter highlighted
- Collapsible part sections
- Sticky on scroll (desktop)

### Main Content
- Chapter title as H1
- Section titles as H2
- Subsections as H3
- Block quotes styled distinctly
- Footnotes as hover tooltips or end-of-chapter

### Footer
- Citation information
- "Download PDF" button
- "View in Archive" link
- "Report Issue" link

### Settings Panel
- Text size: Small / Medium / Large
- Theme: Light / Dark / System
- (Optional) Line spacing
- (Optional) Font choice

---

## File Structure

```
dissertation-reader/
├── index.html
├── css/
│   ├── main.css
│   ├── typography.css
│   ├── dark-mode.css
│   └── print.css
├── js/
│   ├── navigation.js
│   ├── settings.js
│   └── progress.js
└── assets/
    └── (any images if needed)
```

---

## Implementation Notes

### Source Content
- Parse `/frontend/web/95/impossible-press.md`
- Preserve all formatting
- Convert markdown to semantic HTML
- Add id attributes to all headings for linking

### Performance
- Inline critical CSS
- Lazy-load non-critical features
- Use CSS for dark mode (no flash)
- Cache settings in localStorage

### Analytics (Optional)
- Track chapter views
- Track completion rate
- Track time on page
- Privacy-respecting (no PII)

---

## Testing Checklist

- [ ] All chapters load correctly
- [ ] Navigation works on all devices
- [ ] Dark mode toggles properly
- [ ] Text size adjustments work
- [ ] Print stylesheet produces clean output
- [ ] Screen reader navigation tested
- [ ] Keyboard navigation complete
- [ ] Links to archive work
- [ ] PDF download works
- [ ] Citation copy works

---

*Last Updated: November 2025*
