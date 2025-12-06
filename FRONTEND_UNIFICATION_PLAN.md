# Frontend Design Unification Plan

## Jay Rosen Digital Archive - Systematic UI/UX Review & Improvement

**Branch:** `feature/frontend-design-unification`
**Created:** December 5, 2025
**Status:** Planning Phase

---

## Executive Summary

This plan outlines a systematic approach to review, improve, and unify every frontend page, modal, navigation element, and component across the Jay Rosen Digital Archive. The goal is to achieve a cohesive, production-grade design system that maintains the archive's distinctive typewriter aesthetic while ensuring accessibility, responsiveness, and maintainability.

---

## Current State Analysis

### Inventory Summary

| Category | Count | Location |
|----------|-------|----------|
| Main App Components | 15 | `/frontend/components/` |
| Feature Tools | 8 | `/features/` |
| Lab/Experimental | 2 | `/labs/dissertation-launch/` |
| Active Tools | 2 | `/tools/active/` |
| Services | 2 | `/frontend/services/` |
| **Total UI Components** | **29** | |

### Design System Foundation

**Typography:**
- Display: `Special Elite` (typewriter aesthetic)
- Body: `Roboto Mono` (monospace readability)

**Color Palette:**
- Background: `#fdfbf7` (paper)
- Text: `stone-900` / `#1c1917`
- Accents: sky, green, amber, pink, violet, orange

**Visual Elements:**
- Paper texture via SVG noise filter
- 2px borders with 8px box shadows
- Smooth fade-in animations

---

## Identified Issues (Priority Order)

### Critical (Must Fix)

1. **Component Duplication** - Headers, navigation, buttons duplicated across features
2. **Modal Pattern Inconsistency** - 5+ different modal implementations
3. **Path Configuration** - Mix of relative and WordPress absolute paths
4. **Typography Drift** - Archived pages use Inter font instead of design system

### High Priority

5. **Button Styling Variance** - Primary/secondary styles redefined per feature
6. **Mobile Responsiveness Gaps** - Some features have incomplete mobile layouts
7. **Loading State Inconsistency** - Multiple loading patterns (quotes, spinners, skeletons)
8. **Color Theme Application** - Hardcoded colors instead of theme variables

### Medium Priority

9. **Search/Filter UI Fragmentation** - Multiple implementations
10. **Navigation Patterns** - Inconsistent back buttons, breadcrumbs, links
11. **Accessibility Gaps** - Missing ARIA labels, focus management
12. **Error/Empty States** - Minimal implementations

---

## Subagent Deployment Strategy

Each subagent will be equipped with the `frontend-design` skill and given a specific scope to review and improve. Work will proceed in waves to maintain coherence.

---

## Wave 1: Design System Foundation

**Goal:** Establish shared components and design tokens before touching individual features.

### Agent 1.1: Design Token Extraction
**Scope:** Create unified CSS custom properties and Tailwind config
**Files:**
- `frontend/tailwind.config.js`
- `frontend/index.css`
- `shared-styles.css`

**Tasks:**
- Extract all colors, spacing, typography into CSS variables
- Create button variant classes (primary, secondary, ghost, danger)
- Create modal base classes
- Create card/panel base classes
- Document design tokens

**Deliverable:** `frontend/design-system/tokens.css`

---

### Agent 1.2: Shared Component Library
**Scope:** Create reusable components for headers, modals, buttons
**Files to create:**
- `frontend/components/shared/Header.js`
- `frontend/components/shared/Modal.js`
- `frontend/components/shared/Button.js`
- `frontend/components/shared/Card.js`
- `frontend/components/shared/LoadingState.js`
- `frontend/components/shared/ErrorState.js`

**Tasks:**
- Design universal header with back button, title, actions slots
- Design modal wrapper with consistent animations, backdrop, keyboard handling
- Design button variants matching design system
- Design card component with hover states
- Design loading/error states

**Deliverable:** Shared component library with documentation

---

## Wave 2: Main Application Components

**Goal:** Unify the 15 main app components with design system.

### Agent 2.1: Navigation & Layout
**Scope:** Header, Sidebar, navigation patterns
**Files:**
- `frontend/App.js`
- `frontend/components/Sidebar.js`

**Tasks:**
- Review header layout and responsiveness
- Improve sidebar filter UI consistency
- Ensure mobile navigation is accessible
- Add proper ARIA landmarks
- Improve search autocomplete UX

---

### Agent 2.2: Modal System
**Scope:** Unify all modal patterns
**Files:**
- `frontend/components/WelcomeModal.js`
- `frontend/components/RecordModal.js`
- `frontend/components/ToolsModal.js`
- `frontend/components/DetailPanel.js`

**Tasks:**
- Migrate to shared Modal component
- Ensure consistent animations (300ms, ease-out)
- Implement proper focus trapping
- Add aria-modal, aria-labelledby attributes
- Ensure ESC key works universally
- Fix backdrop click behavior

---

### Agent 2.3: Data Visualization
**Scope:** Explorer, Timeline, MindMap
**Files:**
- `frontend/components/Explorer.js`
- `frontend/components/Timeline.js`
- `frontend/components/MindMap.js`

**Tasks:**
- Improve canvas accessibility (screen reader descriptions)
- Ensure color contrast in visualizations
- Add keyboard navigation to interactive elements
- Improve loading states
- Mobile touch interaction improvements

---

### Agent 2.4: Content Display
**Scope:** Cards, Featured Section, Record display
**Files:**
- `frontend/components/FeaturedSection.js`
- `frontend/components/ThreadModal.js`
- `frontend/components/AnalyticsDashboard.js`
- `frontend/components/LoadingQuotes.js`
- `frontend/components/WorkInProgressBanner.js`

**Tasks:**
- Unify card styling across components
- Improve carousel accessibility
- Ensure banner dismissal persists correctly
- Analytics dashboard mobile layout
- Thread modal readability improvements

---

### Agent 2.5: Dissertation Components
**Scope:** Dissertation page and related components
**Files:**
- `frontend/components/DissertationPage.js`
- `frontend/components/MindMap.js`
- `frontend/components/DetailPanel.js`
- `frontend/components/dissertationData.js`

**Tasks:**
- Improve node selection UX
- Mobile layout for detail panel
- Print stylesheet for dissertation content
- Keyboard navigation through tree

---

## Wave 3: Feature Tools

**Goal:** Bring all 8 feature tools into design system compliance.

### Agent 3.1: Comparison Tool
**Scope:** `/features/comparison-tool/`
**Files:** `index.html`, `script.js`, `styles.css`, `data.js`

**Tasks:**
- Use shared header component pattern
- Improve navigation dots visibility on mobile
- Ensure keyboard navigation works
- Add print stylesheet
- Review quote attribution styling

---

### Agent 3.2: Glossary
**Scope:** `/features/glossary/`
**Files:** `index.html`, `script.js`, `data.js`

**Tasks:**
- Unify with shared modal/panel patterns
- Improve search highlighting
- Mobile slide-up panel animation
- Related concepts linking
- Category filter tabs styling

---

### Agent 3.3: Timeline
**Scope:** `/features/timeline/`
**Files:** `index.html`, `script.js`, `data.js`

**Tasks:**
- Improve timeline line gradient
- Mobile single-column layout polish
- Entry card hover states
- Era color coding consistency
- Scroll-based animations

---

### Agent 3.4: Annotated Excerpts
**Scope:** `/features/annotated-excerpts/`
**Files:** `index.html`, `script.js`, `data.js`

**Tasks:**
- Quote vs commentary visual distinction
- Copy-to-clipboard UX
- Related records section
- Navigation between excerpts
- Mobile layout improvements

---

### Agent 3.5: FAQ
**Scope:** `/features/faq/`
**Files:** `index.html`, `script.js`, `data.js`

**Tasks:**
- Accordion animation smoothness
- Search highlighting improvements
- Screen reader announcements
- NotebookLM integration section styling
- Empty search state

---

### Agent 3.6: 1986 Context
**Scope:** `/features/context-1986/`
**Files:** `index.html`, `script.js`, `data.js`

**Tasks:**
- Historical photo styling
- Table of contents sticky behavior
- Section anchor links
- Mobile horizontal scroll for TOC
- Print stylesheet

---

### Agent 3.7: Dissertation Reader
**Scope:** `/features/dissertation-reader/`
**Files:** `index.html`, `src/js/*`, `src/css/*`

**Tasks:**
- Progress bar accessibility
- TOC sidebar improvements
- Text selection context menu polish
- Quote image generation quality
- Settings modal dark mode text fix (already done, verify)
- Chapter navigation
- Reading progress persistence

---

### Agent 3.8: Network Effect
**Scope:** `/features/network-effect/`
**Files:** `index.html`

**Tasks:**
- Three-node timeline visualization polish
- Video embed responsiveness
- Analysis section styling
- Navigation to related features

---

## Wave 4: Labs & Experimental

**Goal:** Polish launch materials for December 2025 release.

### Agent 4.1: Landing Page
**Scope:** `/labs/dissertation-launch/landing-page/`
**Files:** `index.html`

**Tasks:**
- Hero section animation timing
- CTA button prominence
- Insight cards hover effects
- Navigation grid responsiveness
- About section photo/icon styling
- Footer links

---

### Agent 4.2: 3D Concept Sphere
**Scope:** `/labs/dissertation-launch/3d-concepts/info-sphere/`
**Files:** `index.html`

**Tasks:**
- Info panel styling consistency
- Category badge design
- Mobile touch controls
- Performance optimization
- Loading state for Three.js
- Fallback for WebGL-unsupported browsers

---

## Wave 5: Tools & Polish

### Agent 5.1: Data Tools
**Scope:** `/tools/active/dataexplorer/`, `/tools/active/dataviz/`
**Files:** `data_explorer_grid.html`, `dataviz.html`

**Tasks:**
- Align with main design system
- Control panel styling
- Legend/key improvements
- Mobile layout

---

### Agent 5.2: Final Integration Pass
**Scope:** All files
**Tasks:**
- Verify all features use shared components
- Path configuration audit (local vs WordPress)
- Cache busting version increments
- Cross-browser testing checklist
- Accessibility audit (WCAG 2.1 AA)
- Performance audit (Lighthouse)

---

## Execution Guidelines

### For Each Subagent

1. **Read First** - Always read the existing file(s) before making changes
2. **Preserve Functionality** - Never break existing features
3. **Use Design System** - Reference tokens.css and shared components
4. **Mobile First** - Ensure mobile layout works before desktop
5. **Accessibility** - Add ARIA labels, keyboard navigation, focus management
6. **Document Changes** - Update CHANGELOG.md for significant changes

### Quality Checklist Per Component

- [ ] Uses design system colors (CSS variables)
- [ ] Uses correct typography (Special Elite / Roboto Mono)
- [ ] Responsive at all breakpoints (sm, md, lg, xl)
- [ ] Keyboard navigable
- [ ] Screen reader friendly
- [ ] Loading state defined
- [ ] Error state defined
- [ ] Animations smooth (300ms default)
- [ ] No console errors
- [ ] Works in Safari, Chrome, Firefox, Edge

---

## Success Metrics

1. **Visual Consistency** - All pages share identical header, footer, button, and modal patterns
2. **Code Reduction** - Eliminate duplicate CSS/JS through shared components
3. **Accessibility Score** - WCAG 2.1 AA compliance (Lighthouse 90+)
4. **Performance** - Lighthouse Performance 85+
5. **Mobile Experience** - All features fully functional on 375px viewport
6. **Maintainability** - Single source of truth for design tokens

---

## Timeline (Suggested Execution Order)

| Wave | Focus | Estimated Agents |
|------|-------|------------------|
| Wave 1 | Design System Foundation | 2 agents |
| Wave 2 | Main App Components | 5 agents |
| Wave 3 | Feature Tools | 8 agents |
| Wave 4 | Labs & Experimental | 2 agents |
| Wave 5 | Tools & Final Polish | 2 agents |
| **Total** | | **19 agents** |

---

## Files Modified Tracking

As agents complete their work, this section will track all modified files:

```
[ ] frontend/design-system/tokens.css (NEW)
[ ] frontend/components/shared/Header.js (NEW)
[ ] frontend/components/shared/Modal.js (NEW)
[ ] frontend/components/shared/Button.js (NEW)
[ ] frontend/tailwind.config.js
[ ] frontend/index.css
[ ] shared-styles.css
[ ] frontend/App.js
[ ] frontend/components/Sidebar.js
[ ] frontend/components/WelcomeModal.js
[ ] frontend/components/RecordModal.js
[ ] frontend/components/ToolsModal.js
[ ] frontend/components/DetailPanel.js
[ ] frontend/components/Explorer.js
[ ] frontend/components/Timeline.js
[ ] frontend/components/MindMap.js
[ ] frontend/components/FeaturedSection.js
[ ] frontend/components/ThreadModal.js
[ ] frontend/components/AnalyticsDashboard.js
[ ] frontend/components/DissertationPage.js
[ ] features/comparison-tool/index.html
[ ] features/comparison-tool/styles.css
[ ] features/glossary/index.html
[ ] features/timeline/index.html
[ ] features/annotated-excerpts/index.html
[ ] features/faq/index.html
[ ] features/context-1986/index.html
[ ] features/dissertation-reader/index.html
[ ] features/dissertation-reader/src/css/*
[ ] features/network-effect/index.html
[ ] labs/dissertation-launch/landing-page/index.html
[ ] labs/dissertation-launch/3d-concepts/info-sphere/index.html
[ ] tools/active/dataexplorer/data_explorer_grid.html
[ ] tools/active/dataviz/dataviz.html
```

---

## Next Steps

1. **Review this plan** - Confirm scope and priorities
2. **Approve Wave 1** - Begin with design system foundation
3. **Deploy agents sequentially** - One wave at a time for coherence
4. **Test after each wave** - Verify no regressions before proceeding

---

*Plan created by Claude Code with frontend-design skill*
