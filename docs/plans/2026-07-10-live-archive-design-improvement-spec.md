# Live archive design improvement spec

Date: 2026-07-10

Live surface inspected: https://pressthink.org/j/rosen-archive/

Repo issue source inspected: https://github.com/jamditis/rosen-frontend/issues?q=is%3Aissue+is%3Aopen+-label%3Ado-not-automate

## Purpose

Improve the Rosen Archive design without changing its identity. The site should still feel like a warm paper archive with filing-cabinet tools, mono body text, display headings, subdued category colors, and direct access to records. The work should make the current design clearer, calmer, more legible, and easier to operate on desktop and mobile.

This is a design spec, not an implementation ticket. It should guide small, testable changes that can ship in batches.

## Constraints that must not change

- Keep the zero-build static architecture: React 18, HTM, sql.js, Lucide React, native modules, and pre-built Tailwind CSS.
- Do not introduce JSX, Vite, Webpack, or a production build step.
- Keep the visual language: `Special Elite` display type, `Roboto Mono` body type, warm paper background, texture, stone borders, compact labels, and category colors.
- Keep existing information architecture unless a specific issue says otherwise: archive, folders, dissertation, entities, analytics, wiki, about, report form, and tools.
- Keep progressive data loading and avoid adding large first-load assets.
- Keep all public deploy changes aligned with favicon, social sharing, og image, and version bump rules.

## Evidence reviewed

### Live site and code-backed surface map

Automated browser inspection of the live production URL was attempted with Playwright, but the environment could not download the required Chromium build because the Playwright CDN returned 403. I still reviewed the live URL through the web fetcher and compared it against the current production-facing source because this repo is the live app source.

The current archive surface includes:

- A sticky paper header that switches from translucent paper to solid paper with a subtle shadow after scroll.
- A compact brand block with newspaper icon, full desktop name, and mobile `JRIA` label.
- Desktop stats for record count and timeline span.
- Header actions for tools, about, report a bug, curator link, and mobile filter drawer.
- A left filter sidebar on large screens and a slide-in mobile filter drawer.
- Search with suggestions, category checkboxes, era radios, content-type radios, and a reset-all action.
- Home-only tool pills, featured works, and a timeline strip.
- Result controls with found count, cards/folders toggle, sort control, pagination, and record cards.
- Modal record viewing with previous/next navigation, deep links, category filtering, and related connections.
- Separate pages for dissertation, entities, analytics, about, and wiki.

### Open issue themes

Open issues were reviewed with `do-not-automate` excluded. The design-related signals are:

- #602: Entity browser counts are not labeled as query-scoped.
- #601: Query filter cannot be cleared without resetting all filters.
- #584: Decide whether the data explorer belongs in the public deploy surface.
- #575 and #530: Build or publish the walkthrough as a branded public archive page.
- #525: SQL query builder is broken and points to a blank page.
- #524: Add more thematic categories to the archive.
- #483: `og:image` returns 404.
- #402: Finish the “Digital Archive” to “Internet Archive” rename outside the feed surface.

These issues point to a shared problem: the site has strong archival atmosphere, but some tool affordances, scoped states, and public-facing launch details need clearer framing.

## Design diagnosis

### What works now

- The site has a memorable identity. The paper background, mono type, display face, stone borders, and category chips feel aligned with an archive rather than a generic search app.
- The header is compact and persistent, which helps orientation during long result browsing.
- The left sidebar makes the primary research workflow visible: search, categories, time, and content type.
- The home page gives several entry points: featured works, timeline, entities, analytics, dissertation, and more tools.
- The card grid works for scanning many records because metadata, categories, dates, and snippets appear close together.
- Record modals keep browsing context intact and support next/previous motion through the current result set.
- The report form is in-brand instead of sending readers straight to GitHub.

### What feels less clear

- The hierarchy competes in a few places. Header stats, tools, featured works, timeline, result controls, and filters can all appear before the first record.
- Some controls are technically available but not self-explanatory. `More`, `Entities`, `Analytics`, and query result states need more context for readers who did not build the site.
- Filter state is visible but not summarized as a plain-language sentence. A reader can end up in a scoped result set without understanding why counts changed.
- The search clear control is small and local; clearing only the query should be as obvious as resetting all filters.
- Entity counts and query-derived record sets need scope labels so readers know whether they are seeing global archive counts or filtered counts.
- Mobile puts many high-value controls behind icon-only buttons. This is space-efficient but raises the cost of first use.
- The `JRIA` mobile wordmark saves space, but it may be cryptic for new visitors arriving from search or social links.
- Public launch details such as og image health are part of the design system because they shape first impressions before the page loads.

## Design principles

1. Preserve the archive feeling.
   - Keep warmth, paper texture, stone borders, typewriter cues, and small editorial labels.
   - Avoid glossy surfaces, bright SaaS colors, large gradients, and oversized rounded cards.

2. Make state readable.
   - Every scoped view should answer: “What am I looking at, why, and how do I clear it?”
   - Counts must say whether they are global, filtered, query-scoped, or local to a tool.

3. Prefer editorial hints over UI chrome.
   - Add short labels, helper text, and inline context before adding more panels.
   - Treat the archive like a guided research desk, not an app dashboard.

4. Keep improvements reversible.
   - Ship small CSS and copy changes first.
   - Avoid new data dependencies unless needed for an issue.

5. Design for slow reading and fast recovery.
   - Results should be easy to scan, but mistakes should be easy to undo.
   - Search, filters, sort, view mode, and query scopes need local clear paths.

## Proposed improvements

### 1. Add a results state sentence above the grid

Add a one-line, plain-language state summary above the result controls.

Examples:

- `Showing 214 records matching “public journalism” across all eras.`
- `Showing 38 records in query results, filtered to press criticism.`
- `Showing all 1,248 records, sorted oldest first.`
- `No records match “x” with the current filters.`

Details:

- Place it near the existing found-count line, not in the sidebar.
- Use body mono text at small size, with the active query/category/year/type emphasized in stone-900.
- Include a local `Clear query` action when `filters.search` is set.
- Include a local `Clear query result scope` action when `filters.recordIds !== null`.
- Keep `Reset all filters` in the sidebar for full reset.

Why:

- Addresses #601 by making query clearing obvious without forcing a full reset.
- Reduces confusion when analytics or entity workflows send readers back to scoped archive results.

Acceptance criteria:

- Search text can be cleared without resetting category, era, year, type, or query result scope.
- Query result scope can be cleared without resetting normal filters.
- The sentence updates after search, category, era, year, content type, sort, and query-result changes.
- Empty states explain both the query and active filters.

### 2. Label scoped counts everywhere counts appear

Counts should use explicit labels:

- `1,248 archive records` for global counts.
- `214 filtered records` for filter-limited result sets.
- `38 query result records` for analytics or query builder output.
- `12 people in current results` versus `12 people in archive` for entity browser counts.

Details:

- Header stats should stay global and say so in tooltips or visible small labels.
- Entity browser counts should include a scope label when entered from query results.
- Result count should avoid the ambiguous `records found` wording when the list is scoped by query IDs.

Why:

- Directly addresses #602.
- Makes analytics-to-archive and entity-to-archive workflows less surprising.

Acceptance criteria:

- No count-bearing UI relies only on a bare number.
- Query-scoped counts are visually distinct but not louder than the content.
- Existing tests for query result filtering continue to pass.

### 3. Make the mobile header less cryptic

Replace or supplement `JRIA` on mobile with a two-line compact mark:

- Line 1: `Rosen archive`
- Line 2: `Internet archive` or `records and tools`

Details:

- Keep the newspaper icon.
- Use `Special Elite` for the primary line and mono for the small descriptor.
- Keep within the current header height if possible.
- If space is tight, use `Rosen archive` instead of `JRIA` and rely on the icon.

Why:

- New mobile visitors should understand where they landed without opening a menu.
- Supports the remaining rename work in #402.

Acceptance criteria:

- Header actions still fit at 390px width.
- The archive name is understandable without prior knowledge of the acronym.
- No horizontal overflow is introduced.

### 4. Strengthen the filter drawer affordance on mobile

The mobile filter button should communicate both function and state.

Details:

- Change the icon-only button to `Filters` plus icon at small widths where space allows.
- Keep the red count badge, but add `active` in `aria-label` when filters are active.
- In the drawer header, show `Filters` plus `3 active` when applicable.
- Add a sticky drawer footer with `Show 214 records` and `Reset all`.

Why:

- Mobile users should not have to infer that sliders means filters.
- The drawer needs a clear exit that confirms the result set.

Acceptance criteria:

- Mobile drawer can be opened, filters changed, and closed with visible result feedback.
- Keyboard focus remains inside the drawer while open.
- The close and reset actions remain reachable without scrolling to the drawer bottom.

### 5. Clarify tools as research modes, not generic utilities

Rename and group the home tool pills as `Research modes`.

Suggested labels:

- `Read the dissertation`
- `Browse entities`
- `View archive analytics`
- `Open more tools`

Details:

- Keep pill styling, but add a short line above: `Choose a path into the archive.`
- Keep the icon set, subdued borders, and compact spacing.
- In the tools modal, add one-sentence descriptions that explain what each mode is for.

Why:

- #575 and #530 ask for a branded walkthrough. This is a low-cost first step toward guided onboarding.
- Tool names like `Analytics` and `Entities` are accurate but assume insider knowledge.

Acceptance criteria:

- Home tools read as entry points for readers, not developer features.
- The labels remain sentence case.
- Existing route behavior does not change.

### 6. Add a lightweight guided walkthrough page

Create a public walkthrough page that explains how to use the archive in five short sections:

1. Search by idea, title, or phrase.
2. Filter by theme and era.
3. Open a record and follow related entities.
4. Use the dissertation and analytics tools.
5. Report a problem or suggest a record.

Details:

- Use the existing design system, not a separate marketing layout.
- Link it from the home tool area, about page, and tools modal.
- Keep the page static and cache-friendly.
- Include no large screenshots unless optimized and versioned.

Why:

- Addresses #575 and #530 while staying in the archive voice.
- Helps readers understand why multiple tools exist.

Acceptance criteria:

- The walkthrough has an svg favicon and complete social metadata before publication.
- It uses the same header/footer framing as other public pages or a clearly intentional standalone frame.
- It passes `npm run preview:audit` before deploy.

### 7. Improve record cards for scan rhythm

Make record cards easier to scan without changing their basic shape.

Details:

- Keep warm white card surfaces, stone borders, and category chips.
- Use a consistent metadata row order: date, publication/source, type.
- Limit visible category chips to a stable count, then show `+n more`.
- Increase title line-height slightly if cards feel dense.
- Add a subtle hover/focus treatment that looks like paper lift, not a glossy button.
- Ensure card focus state is as visible as hover state.

Why:

- The grid is the main reading surface. Small rhythm improvements compound over long sessions.

Acceptance criteria:

- Cards remain visually compatible with the existing design system.
- Keyboard users can see which card is focused.
- Long titles and many categories do not cause uneven card interiors beyond the current grid behavior.

### 8. Improve empty and loading states

Replace generic status text with archive-specific, action-oriented states.

Examples:

- Loading: `Opening the archive drawers…`
- Search loading with MiniSearch pending: `Searching titles and summaries now. Full-text matches are still loading.`
- Empty search: `No records match this combination. Clear the query, remove one filter, or reset all filters.`
- Data error: keep the current reload action, but add a support/report path if reload fails.

Details:

- Use restrained language. Avoid jokes that could become annoying.
- Keep loading quotes if they remain fast and accessible.

Why:

- The current app has strong data-loading behavior; the interface should explain it in reader terms.

Acceptance criteria:

- Loading and empty states do not shift layout more than needed.
- Error states give a next action.
- Text remains sentence case.

### 9. Make public launch metadata part of the visual system

Fix the missing og image and treat social cards as a designed surface.

Details:

- Create or repair the `og:image` referenced by production metadata.
- The image should use the archive’s paper background, display type, newspaper/filing-cabinet cue, and a short readable title.
- Verify absolute production URL and dimensions.
- Keep the svg favicon aligned with the same visual system.

Why:

- #483 reports that `og:image` returns 404.
- Shared links are often the first design impression.

Acceptance criteria:

- `og:image` returns 200 from production after deploy.
- `twitter:image` or equivalent points to the same valid asset unless there is a deliberate variant.
- The image remains legible in a small social preview.

### 10. Reconsider public tool exposure before adding visual polish

Before polishing the data explorer or query builder, decide whether each belongs on the public surface.

Details:

- If a tool is public, give it a reader-facing name, description, empty state, and safe back path.
- If a tool is curator-only, remove it from public navigation and document how maintainers access it.
- Broken tools should not be discoverable from public paths.

Why:

- #584 asks whether the data explorer belongs in the public deploy surface.
- #525 reports a broken SQL query builder blank page.
- Design polish should not make unstable surfaces more prominent.

Acceptance criteria:

- Public navigation includes only tools that load reliably in preview.
- Each public tool has an explanatory title and back path.
- Curator-only tools are documented outside the public reader flow.

## Visual tokens to preserve and tune

### Typography

- Keep `Special Elite` for display headings and archive labels.
- Keep `Roboto Mono` for body and control text.
- Increase line-height on dense card titles and modal summaries before increasing font size.
- Avoid all-caps for longer labels; reserve uppercase tracking for short section labels.

### Color

- Keep warm paper as the page base.
- Keep stone neutrals as the default interface color.
- Keep existing category color families, but ensure chip contrast passes WCAG 2.1 AA.
- Use red only for errors, active badges, and destructive/problem reporting signals.

### Spacing

- Reduce stacked pre-results modules when a filter is active.
- Keep sidebar sections separated by quiet borders.
- Use consistent `gap-2`, `gap-3`, and `gap-4` patterns for controls.
- Avoid adding new large vertical bands above the first record.

### Motion

- Keep transitions subtle: opacity, border, paper lift, and existing modal view transitions.
- Avoid parallax, large transforms, or animated decoration.
- Respect `prefers-reduced-motion` for any new motion.

## Implementation sequence

### Phase 1: clarity without new pages

- Add the results state sentence and local clear actions.
- Label scoped counts, starting with result counts and entity counts.
- Adjust mobile header label.
- Improve mobile filter button and drawer header/footer.

### Phase 2: guided entry points

- Rename home tool labels as research modes.
- Add short tool descriptions in the tools modal.
- Add a guided walkthrough page if the content is approved.

### Phase 3: scan and launch polish

- Tune record card metadata rhythm and focus states.
- Improve empty and loading copy.
- Fix og image and verify social metadata.
- Decide public exposure for data explorer and query builder before visual treatment.

## Testing and review checklist

Run these checks for any implementation PR that follows this spec:

- `npm run test:frontend`
- `npm test`
- `npm run preview:audit`
- Manual desktop preview at 1440px wide.
- Manual mobile preview at 390px wide.
- Keyboard-only pass through header, filters, cards, modal, and drawer.
- Screen reader spot check for count labels, active filters, drawer state, and modal title.
- Social metadata URL check for favicon and og image.

## Non-goals

- Do not redesign the archive into a new brand.
- Do not replace the card grid with a dense table.
- Do not make analytics the primary landing experience.
- Do not add a build system.
- Do not add new heavy images or fonts to first load.
- Do not expose broken or curator-only tools because they look interesting.

## Open questions for maintainers

- Should the walkthrough be part of the main app route or a standalone public page under `features/`?
- Should entity counts always be global unless explicitly entered from a query-scoped flow?
- Which public tool names does Jay prefer: plain nouns (`Entities`) or reader-facing verbs (`Browse entities`)?
- Should the mobile header use `Rosen archive` or the full `Jay Rosen archive` when space permits?
- Should query-builder and data-explorer surfaces be public, curator-only, or removed from navigation?
