# Live archive design improvement spec

Date: 2026-07-10
Status: Proposed
Live surface inspected: https://pressthink.org/j/rosen-archive/
Repo issues reviewed: open issues excluding do-not-automate (https://github.com/jamditis/rosen-frontend/issues?q=is%3Aissue+is%3Aopen+-label%3Ado-not-automate)
Scope: Subtle improvements to the live public archive without changing its core identity, information model, or zero-build architecture

## Purpose

This spec defines a focused refinement of Jay Rosen's Internet Archive. The work should make the archive easier to understand, scan, filter, navigate, and share while preserving the qualities that already make it distinctive.

The archive should still feel like the same place after this work. It should keep the warm paper field, paper texture, Special Elite display type, Roboto Mono interface and reading type, black-and-stone controls, category colors, editorial photography, folder metaphor, and typewriter pacing. The target is greater clarity and finish, not a visual reset.

This is a design spec, not an implementation ticket. It guides small, testable changes that can ship in batches.

## Constraints that must not change

- Keep the zero-build static architecture: React 18, HTM, sql.js, Lucide React, native modules, and pre-built Tailwind CSS.
- Do not introduce JSX, Vite, Webpack, or a production build step.
- Keep the visual language: `Special Elite` display type, `Roboto Mono` body type, warm paper background, texture, stone borders, compact labels, and category colors.
- Keep existing information architecture unless a specific issue says otherwise: archive, folders, dissertation, entities, analytics, wiki, about, report form, and tools.
- Keep progressive data loading and avoid adding large first-load assets.
- Keep all public deploy changes aligned with favicon, social sharing, og image, and version bump rules.

## Evidence used

The live archive at [pressthink.org/j/rosen-archive](https://pressthink.org/j/rosen-archive/) was inspected in Microsoft Edge on July 10, 2026. The review covered:

- The desktop archive home, search results, layered filters, cards, folders, empty state, and timeline.
- Record detail opening, closing, URL state, navigation, related records, categories, tags, and concepts.
- The entity browser and entity detail panel.
- The analytics page.
- The dissertation mind map.
- The About page.
- Responsive behavior at a narrow CSS viewport using 250 percent browser zoom.
- Browser accessibility exposure for the main controls, record cards, dialogs, and entity controls.

The review also considered the current Vercel web interface guidelines, the repository's design-taste checks, and all eligible open GitHub issues returned by the required query that excludes `do-not-automate` issues.

## Product principles

### Preserve the archive's voice

The current visual language feels archival, editorial, handmade, and specific to Jay Rosen's work. Keep it. New components should look like they were made from the same paper, ink, type, rules, and filing-system vocabulary.

### Let the archive lead

The homepage currently asks the Read carousel, tools, filters, timeline, results, and masthead to compete at once. The archive records are the primary task. Curated reading and specialist tools should support that task without delaying it.

### Make scope visible

Users should always be able to answer:

- What part of the archive am I viewing?
- Which filters are active?
- How many results do those filters produce?
- Is a count archive-wide or limited by a query?
- How do I remove one constraint without losing the others?

### Use motion to explain change

Keep the current restrained fades and modal transitions, but shorten any transition that leaves text visibly doubled or washed out. Motion should show a view change, panel opening, or result update. It should not hold the interface in an unreadable midpoint.

### Treat narrow screens as a different reading mode

Mobile should not be a tall stack of every desktop feature. It should prioritize search, active scope, records, and the next useful action. Curated features and exploratory tools can remain available with less vertical cost.

## What already works

These qualities should be retained and strengthened.

### Visual identity

- The warm paper background and subtle texture create a clear archival setting without imitating a museum website.
- Special Elite gives headings and record titles a recognizable voice.
- Roboto Mono keeps metadata, dates, filters, and summaries connected to the filing-system idea.
- Black, stone, muted blue, purple, teal, and rust accents provide enough hierarchy without turning the archive into color confetti.
- Grayscale editorial images in the Read section feel appropriate to the subject and contrast well with the paper field.

### Information patterns

- The top masthead communicates the collection name, record count, and date span at a glance.
- The timeline histogram shows the archive's historical shape before a user reads individual records.
- Record cards expose publication, date, title, summary, and categories in a compact repeated form.
- The folder view is a strong domain-specific alternative to generic cards. Its tabbed folder silhouette is memorable and useful.
- Record URLs update with `?record=`, which preserves a direct link while the modal is open.
- The record modal has a strong reading hierarchy: date and type, title, byline, source link, quotation, summary, related records, and taxonomy.
- The entity browser's type counts and side-panel detail make a large network approachable.
- The dissertation mind map has clear controls, a useful legend, visible hierarchy, and a good canvas-to-chrome balance.
- The About page has a calm reading measure, useful live stats, and clear explanations of the archive's purpose.

## Main findings

### The homepage hierarchy is crowded

At desktop width, the masthead, tools, Read carousel, sidebar filters, timeline, result count, view switch, sort control, and cards are all visible in the first screen. Each part is individually understandable, but the page does not establish a strong first action.

At narrow width, the Read cards become large stacked features. A visitor can spend several screens moving through curated highlights before reaching the timeline and archive results. The visual treatment is attractive, but the archive task is delayed.

### Search feedback is delayed and fragmented

Typing `gatekeeping` produced a brief zero-result state before the real five-result state appeared. The suggestion menu remained open over the sidebar and contained near-duplicate capitalization and phrase variants. The result count sat in the main column, separated from the search field and active filters.

When search and a thematic category were combined, the selected checkbox was the only persistent explanation of the narrower result set. There was no compact active-filter summary above the results. The only visible reset control was low in the sidebar, requiring a long scroll.

### Record cards do not expose their action clearly

In the browser accessibility tree, archive cards appeared as generic groups rather than links or buttons. The visual card affordance is clear to a pointer user, but the semantic and keyboard affordance is weak. The card title should be a real link that supports Enter, Cmd/Ctrl-click, middle-click, and context menus.

### The record modal needs focus work

The record detail correctly exposed a dialog role, and Escape closed it. The Share link and Copy citation controls had accessible names. The close control appeared as an unnamed button. Focus did not move into the dialog when it opened and did not return to the triggering card when it closed. Background archive controls remained exposed in the accessibility tree while the modal was open.

The modal's visual design is strong. This is an interaction repair, not a redesign.

### Query scope is not a first-class state

The live entity browser presents counts as if they describe the full archive. Open issues document that a query-limited entity view can silently recompute every count from the query subset. The user then has no visible scope label or query-only reset.

This is both a design and trust problem. Counts need a named scope wherever they appear.

### Entity metadata contains unexplained shorthand

Entity rows use compact values such as `P:6` and the detail panel uses `Prominence: 6`. The shortened form saves space but asks first-time users to infer its meaning. The page begins with “Browse entities and their connections” but lacks a strong visible page title, so it reads as a tool panel rather than a destination within the archive.

### Folder counts need context

The folder view is visually strong, but category counts overlap because records can belong to more than one category. The folder totals therefore exceed the archive total with no explanation. The global Sort control remains beside the Cards/Folders switch even though its relevance to six category folders is unclear.

### Route chrome is inconsistent

The homepage uses the full masthead. About uses a plain Back to archive bar. Analytics uses a different Archive/title header and foregrounds “Powered by sql.js.” The dissertation uses its own book header and includes “Part of Jay Rosen's Internet Archive” only at the bottom.

These pages should remain distinct, but they need one shared orientation pattern so users always know they are still inside the archive.

### Analytics overstates implementation and understates meaning

The analytics page gives `sql.js` prominent billing even though that detail matters more to maintainers than readers. Its era chart is dominated by 25,734 records in the 2021–present range, making earlier eras look nearly empty. The chart is numerically correct but not useful for comparison without separating social posts from curated articles or explaining the skew.

### Sharing is visually unfinished

Open issues confirm that the site-level `og:image` returns 404 and that record deep links produce generic social previews. A user can copy a record link from a polished modal and then see an empty or generic preview in Bluesky, Twitter/X, Slack, or messaging apps. The share experience should carry the archive identity beyond the site.

## Proposed design system refinements

### Type roles

Keep the current families and reduce role ambiguity.

| Role | Typeface | Treatment | Use |
| --- | --- | --- | --- |
| Archive display | Special Elite | Large, dark ink, balanced wrapping | Page titles, record titles, folder names |
| Section heading | Special Elite | Medium, dark ink | Read, Timeline, Archive stats, Related records |
| Reading text | Roboto Mono | Regular, comfortable line height, limited measure | Summaries, About copy, quotations |
| Interface text | Roboto Mono | Medium, sentence case | Buttons, tabs, filter names, navigation |
| Metadata | Roboto Mono | Regular, muted ink, tabular numerals | Dates, counts, publication, range labels |
| Micro-label | Roboto Mono | Medium, restrained tracking | Record type, category label, compact status |

Requirements:

- Keep body and metadata text at 16 CSS pixels or larger at the default desktop scale unless a tested utility exception is needed.
- Use tabular numerals for dates, counts, timeline labels, and analytics values.
- Use `text-wrap: balance` on short display headings and `text-wrap: pretty` on summaries.
- Keep all interface labels in sentence case. Existing content titles retain their authored casing.
- Do not introduce a third typeface.

### Color roles

Keep the existing palette values from the current constants and assign each color a named job.

- Paper: site background and reading field.
- Raised paper: cards, dialogs, drawers, and side panels.
- Ink: primary text, primary controls, selected dark surfaces.
- Muted ink: metadata and supporting copy that still passes WCAG AA.
- Hairline: separators, card boundaries, timeline rails.
- Category colors: category identity only.
- Link blue: source links and other navigation links.
- Focus blue: keyboard focus only; it must not double as selected or current state.
- Error rust: errors and failed states only.

No new gradient, glass, glow, or shadow language should be added. The current paper, rules, and restrained elevation are enough.

### Spacing and density

Use an 8-pixel base with a 4-pixel half step.

- 4 pixels between a title and its immediate metadata.
- 8 pixels between related metadata items.
- 12–16 pixels inside compact controls and result rows.
- 20–24 pixels inside standard cards and panels.
- 32 pixels between functional groups.
- 48–64 pixels between major page sections on desktop.
- 32–40 pixels between major sections on narrow screens.

Reduce ornamental padding before reducing text size. The archive should remain dense enough to scan without making controls small.

### Surface grammar

- Use cards for individual records and selected-item detail.
- Use folders for thematic category browsing.
- Use plain rules and spacing for page sections.
- Use pills only for short filters, categories, or selected tokens.
- Use a side panel for entity detail on wide screens and a full-height sheet on narrow screens.
- Use a modal for a single record because the user should return to the prior result context.

### Motion

- Keep transitions subtle: opacity, border, paper lift, and the existing modal view transitions.
- Avoid parallax, large transforms, and animated decoration.
- Respect `prefers-reduced-motion` for any new motion.

## Homepage specification

### Desktop order

1. Masthead.
2. Compact orientation row: one sentence about the archive, plus “How to use this archive.”
3. Search and filter scope bar.
4. Result count, active filters, Cards/Folders switch, and sort.
5. Timeline, collapsed by default only after a user has an active text query.
6. Results.
7. Read highlights and specialist tools as secondary discovery sections.
8. Footer.

This order keeps all existing features but makes browse and search the first task. If the current Read carousel must remain above results on desktop, reduce it to one featured card plus two compact links and add a clear “View all highlights” action.

### Masthead

Keep the current full archive name, record count, date range, About, Report a bug, and curator credit on wide screens.

Refinements:

- Make the archive mark and title one link to the default archive state.
- Label every icon-only control.
- Give About, Report a bug, and the future guide consistent text-link treatment.
- Keep the record count and date range, but reduce their border weight so the collection name remains primary.
- On narrow screens, use `JRIA` only as a compact mark if the full name is available in the accessible name and appears in the drawer or first page heading.

### Orientation row

Use a single quiet sentence:

> Browse four decades of Jay Rosen's writing, teaching, criticism, and public conversation.

Place a “How to use this archive” link beside it. This implements the public guide direction from issues #530 and #575 without adding a welcome modal to every visit.

### Search field

- Label the field “Search the archive.”
- Keep a short example placeholder such as `Try “gatekeeping” or “public journalism”…`.
- Debounce results without rendering a false zero-result state. Keep the previous results visible with a small `Searching…` status until the new result set is ready.
- Announce the final result count with `aria-live="polite"`.
- Normalize duplicate suggestions by case and punctuation.
- Group suggestions by type where useful: topics, people, publications, and exact phrases.
- Limit the open menu height so it does not cover the full thematic filter block.
- Support arrow keys, Enter, Escape, and clear-button behavior with a standard combobox pattern.
- Keep typed text distinct from a selected suggestion; choosing a suggestion should never happen as a side effect of dismissing the menu.

### Active scope bar

Place this directly above results. It should contain:

- Result count: `5 records` rather than `5 records found`.
- A removable token for each active constraint: text query, query-builder result set, category, era, content type, and folder.
- A clear action on each token.
- A quiet “Clear all” link shown only when two or more constraints are active.
- A scope sentence when a query result set is active: `Within 48 query results`.

Each token clears independently. Removing the text-query token clears `filters.search` while preserving category, era, content type, and any query-builder result scope. Removing the query-builder result-set token clears `filters.recordIds` while preserving the text query and the other filters. This directly addresses issue #601, where the query result scope currently cannot be cleared without resetting everything.

### Sidebar and filter drawer

Desktop:

- Keep the left sidebar.
- Keep common categories, era, and content type visible.
- Make the sidebar sticky only within the results region and ensure it never obscures focused controls.
- Place Reset filters near the top once any filter is active; do not require a scroll to the footer.

Narrow screens:

- Replace the sidebar with a Filters button that includes an active count, such as `Filters (2)`.
- Open a full-height paper drawer with a clear heading, Close button, Apply button, and Reset filters link.
- Preserve filter changes if the drawer is dismissed accidentally.
- Keep the result count and active tokens visible behind the closed drawer.
- Use 44-pixel minimum touch targets.

### Timeline

- Keep the histogram and horizontal historical shape.
- Make every bar a labeled button with year and record count.
- Increase the hit area without increasing the visible bar width.
- Add an explicit selected-year label and clear action.
- Use tabular numerals.
- Keep the rail and labels visible in high contrast.
- On narrow screens, show a compact sparkline with a “Choose a year” disclosure rather than the full horizontal rail.
- When search is active, collapse the timeline under `Timeline: All years` so results remain near the search field.

### Cards view

- Make the title a real link and the whole card a larger linked hit area without nesting conflicting interactive elements.
- Preserve publication, date, title, summary, and category order.
- Allow titles to wrap; do not truncate the primary title without a recovery path.
- Clamp summaries consistently to four lines on desktop and three on narrow screens.
- Keep category labels quiet and limit the visible set to two, with `+N more` when needed.
- Use the category-colored top rule as identity, not as the only selected or focused cue.
- Add a clear `:focus-visible` outline that is distinct from hover.
- Do not animate card position or scale. A small ink/border contrast change is enough for hover.

### Folders view

- Keep the current folder silhouette and six-folder grid.
- Add the note `Records may appear in more than one folder` beside the folder-view heading.
- Hide the record sort control while the user is looking at the six top-level folders.
- Sort only after a folder is opened.
- Make the folder name and count one labeled link or button.
- Keep category color on the tab and left rule, with visible focus independent of color.

### Read highlights

- Keep the photography, black labels, and editorial selection.
- On desktop, show one large feature and two smaller text-led highlights or keep the three-card row at a reduced height.
- On narrow screens, use one current card with previous/next controls and a visible `1 of 21` label. Do not stack several full-height image cards before the archive results.
- Stop automatic movement while focus or pointer is inside the section.
- Honor reduced motion.
- Use descriptive link labels such as `Read The View from Nowhere` instead of a repeated `Read` alone.

### Tools

- Keep Mind map, Entities, Analytics, and More as a compact secondary row.
- On narrow screens, use a two-by-two grid or a single `Explore tools` disclosure instead of forcing four large pills into one line.
- Keep the text labels; do not rely on icons.
- Do not expose River of News or the data explorer until the product decisions in issues #584 and #583 are resolved. "Not exposed" means unreachable in production, not merely absent from the tools row: `tools/active/dataexplorer` currently ships in the `_DEPLOY_DIRS` manifest of `backend/scripts/deploy_full_site.py` and is reachable by direct URL. Removing it from `_DEPLOY_DIRS` only stops future uploads; the already-uploaded live directory stays served, because `push_files()` prunes only `_REMOTE_PRUNE_DIRS` and `tools/active/` is currently exempt from that cleanup per DEPLOYMENT.md. Honoring this therefore requires a remote prune step (add the directory to `_REMOTE_PRUNE_DIRS` so the deploy deletes it) or an auth gate, not only removing it from navigation or the upload manifest.

## Record detail specification

### Visual structure

Keep the current modal width, paper surface, title treatment, quotation rule, and footer navigation. Refine the hierarchy:

- Keep date and content type in the top utility row.
- Keep title and byline as the first reading block.
- Treat the source link as the primary action: `Read on PressThink`, `Read on Bluesky`, or the truthful source name.
- Keep Share link and Copy citation as compact secondary controls with text labels in their accessible names and tooltips.
- Place categories, tags, concepts, related records, and era after the summary under clear section headings.
- If the record is unavailable at its source, replace the primary action with a factual status and any archived copy that exists.

### Dialog behavior

- Use `role="dialog"`, `aria-modal="true"`, and an accessible name from the record title.
- Name the close button `Close record`.
- Move focus to the dialog heading or close button after opening.
- Trap Tab and Shift+Tab inside the dialog.
- Mark the background inert while the dialog is open.
- Close with Escape and the close button.
- Return focus to the exact card or link that opened the dialog.
- Preserve the result scroll position.
- Add `overscroll-behavior: contain` to prevent the archive behind the dialog from moving.
- Keep the `?record=` URL while open and remove it on close without discarding the current search and filter state.
- Honor reduced motion and shorten the exit transition so text does not remain doubled during dismissal.

### Previous and next

- Keep Previous, `1 of 3`, and Next at the bottom.
- Explain that navigation is within the current filtered result set when filters are active.
- Use a disabled state with readable contrast, not near-invisible text.
- Support Left and Right Arrow only when focus is not inside a text field or interactive subcontrol.

### Content quality and feedback

Issue #581 shows that summary quality is part of the reading experience. Keep Report a bug available from the modal and prefill the record ID. Add a small `Report a problem with this record` link near the record metadata rather than asking readers to return to the masthead.

## Entity browser specification

### Page identity

- Add the visible page title `Entities and connections`.
- Keep the sentence `Browse people, organizations, works, concepts, events, and locations mentioned across the archive.`
- Add the shared archive breadcrumb or masthead pattern above it.

### Scope and counts

- Show `All archive records` by default.
- When opened from a filtered or query-built result set, show `Within 48 query results` beside the page title and result count.
- Provide `Clear query scope` without clearing other filters.
- Use `Showing 100 of 8,152 entities` only for archive-wide scope.
- Use `Showing 100 of 612 entities within 48 query results` for query scope.
- Carry the same scope label into the entity detail panel.

This directly addresses issues #601 and #602.

### Type filters and search

- Keep the current type chips and counts.
- Allow chips to wrap to a second line on medium widths instead of shrinking text.
- Keep the search field and sort control on one row only when both have room.
- Announce updated counts after search or type changes.
- Add a visible clear control for entity search.

### Entity rows

- Keep the two-column desktop list.
- Replace `P:6` with a tooltip-backed label such as `Prominence 6` or remove it from the row if users do not act on it.
- Make the entity name, type, descriptor, record count, and prominence one coherent button label.
- Keep type icons restrained and pair them with text where the icon meaning is not obvious.
- Use one-column rows below the medium breakpoint.

### Detail panel

- Keep the right-side panel on wide screens.
- Use a full-height paper sheet on narrow screens.
- Name the close control.
- Move focus into the panel and return it to the entity row on close.
- Keep record rows readable; allow two title lines before truncation.
- Explain the difference between the count shown in the list and the count shown in the panel if deduplication or scope changes it.

## Analytics specification

### Header and framing

- Use the shared archive breadcrumb/header pattern.
- Keep `Archive analytics` as the page title.
- Move `Powered by sql.js` to a small technical note near the bottom or About section.
- Add one sentence describing what the page answers: `See how the archive is distributed across time, subjects, and named entities.`

### Overview cards

- Keep Records, Categories, Concepts, and Entities.
- Use tabular numerals and consistent thousands separators.
- Add a small definition or tooltip where a count can be misunderstood.
- Keep these cards compact so the first chart begins in the first screen.

### Era chart

The 2021–present category contains nearly all social posts and makes the earlier era bars unreadable.

Use one of these low-disruption treatments:

1. Preferred: show two adjacent series, `Articles and long-form records` and `Social posts`.
2. Acceptable: add a switch between `All records` and `Articles only`, defaulting to Articles only for the era comparison.
3. Minimum: annotate the 2021–present bar with `Includes 25,665 social posts` and offer a clear exclusion toggle.

Before any of these treatments, resolve the era-axis overlap for the chart only. The checked-in `byEra` data (canonical source `data/eras.js`, mirrored in `data/archive-analytics.json`) mixes decade labels that overlap in time (`View from Nowhere (10s)` spans 2010–2019) with fixed year-range buckets such as `Social Media & Financial Crisis (2010-2015)` and `Trump Era & Democratic Crisis (2016-2020)` that fall inside that same decade. Charting bars across overlapping, unequal spans is misleading regardless of the social-post treatment above. Do not change the canonical 8-era taxonomy in `data/eras.js` to fix this: that list is a decided, test-guarded data model (Joe, 2026-07-09; issue #201; guarded by `tests/data-integrity.test.js`), and editing it would move filters and feeds, not just the chart. Instead, derive an analytics-only bucketing for the era chart, or make the overlap explicit in the chart's labels and counts.

Do not use a logarithmic scale without an explicit explanation.

### Other charts

- Keep horizontal bars for categories and people.
- Use the same left edge, label pattern, bar height, and number alignment across chart sections.
- Use category colors only for categories. Use one neutral or ink-derived scale for people and entities.
- Make chart rows links only if they lead to a filtered result set; otherwise keep them static.
- Provide the exact value as text so color and bar length are never the only cues.

## Dissertation, About, guide, and other routes

### Shared archive orientation

Create one lightweight route header used by About, Analytics, Entities, the guide, and other standalone archive pages:

- Archive mark.
- `Jay Rosen's Internet Archive` link.
- Current section title.
- Back to archive action.

The dissertation can keep its book-specific header, but add `Jay Rosen's Internet Archive / The Impossible Press` as a breadcrumb near the top. This applies the reader-orientation finding from issue #561 without weakening the book identity.

### Dissertation mind map

- Keep the current canvas, node colors, legend, zoom, fit, Collapse all, Expand all, and Read full text controls.
- Add keyboard instructions to Help.
- Provide an ordered outline fallback for readers who cannot use the canvas.
- Keep node labels readable at 200 percent text zoom.
- On narrow screens, place the legend and topic tags in disclosures so the map receives more vertical space.

### About page

- Keep the narrow reading measure and current content structure.
- Link the live stats to their related views where the destination is useful.
- Add the public guide beside `What you can do here`.
- Use the same shared route header as the rest of the archive.

### Public guide

Build the guide described in issues #530 and #575 as a real archive route, not a document embed.

- Include a table of contents with anchored sections.
- Use live counts.
- Link each described feature to the working feature.
- Include a real example record and its citation/share flow.
- Explain the difference between the archive and the Vault.
- Point public feedback to the in-archive report form.
- Keep private intake-bot instructions out of the public page.

## Responsive specification

### Breakpoint behavior

Use content-driven breakpoints rather than device names.

- Wide: full masthead, sidebar plus main content, three record columns, entity detail panel.
- Medium: compact masthead, sidebar plus two record columns, wrapped entity filters.
- Narrow: compact archive mark, filter drawer, one result column, one highlight at a time, entity detail sheet.

### Narrow-screen order

1. Compact masthead.
2. Archive purpose and guide link.
3. Search.
4. Active scope and Filters button.
5. Result count, view switch, and sort.
6. Results.
7. Collapsed timeline.
8. Read highlight.
9. Tools.
10. Footer.

### Narrow-screen controls

- Minimum 44-by-44-pixel touch targets for primary controls.
- Keep labels on uncommon icons.
- Avoid a four-pill tools row that depends on shrinking or horizontal overflow.
- Allow two title lines before truncation.
- Keep page gutters between 16 and 24 CSS pixels.
- Respect safe-area insets on full-height drawers and sheets.
- Do not disable browser zoom.

## Loading, empty, and error states

### Search loading

- Keep the current results visible.
- Add `Searching…` beside the result count.
- Do not flash `0 records` before the final result set is known.

### Empty search

Use:

> No records match “gatekeepng”
>
> Check the spelling, remove a filter, or try one of these related terms.

Provide related suggestions, removable active filters, and Clear all. Keep the user's text in the field.

### Data loading

- Preserve the masthead, search, scope bar, and expected results shape.
- Use quiet paper skeletons for six records.
- Announce loading and completion.

### Route or query failure

Issue #525 reports a query-builder path that can lead to a blank page. No archive route should render blank.

Use a route-level error panel with:

- A factual heading.
- The failed action in plain language.
- `Try again`.
- `Return to archive`.
- `Report this problem` with relevant route and query context.

### Partial data

If one data source fails, show the rest of the archive and label the missing feature. Do not replace the full app with a generic error.

## Accessibility requirements

- Add a skip link to the main archive content.
- Use semantic landmarks and hierarchical headings.
- Make result cards real links.
- Give every icon-only button an accessible name.
- Use `:focus-visible` and never remove the outline without a visible replacement.
- Keep focus, hover, selected, active filter, current record, and disabled states visually distinct.
- Never use category color as the only state cue.
- Use native controls where possible.
- Follow the standard combobox pattern for search suggestions.
- Follow modal focus rules described above.
- Announce result counts, filter changes, loading, and errors politely.
- Honor `prefers-reduced-motion`.
- Test at 200 percent text size and 400 percent page zoom.
- Test keyboard-only use, NVDA with Edge, Windows high contrast, and touch.
- Ensure sticky controls do not obscure focused content.
- Add `scroll-margin-top` to anchored guide and About headings.
- Give images explicit width and height to prevent layout shift.
- Lazy-load below-fold Read images.

## Share and link presentation

The visual experience extends to social and messaging previews.

- Restore a valid 1200-by-630 site image for the archive root, and add it to the deploy scope. The asset exists and `index.html` references it, but `og-image.png` is absent from both `_DEPLOY_FILES` in `backend/scripts/deploy_full_site.py` and `DEPLOYMENT.md`, so a full-site deploy leaves the live OG URL 404. This requirement is met only when the image is in the deploy manifest, not merely present in the repo.
- Provide record-specific title and summary metadata for shared record URLs. This is not achievable for bare `?record=` query-string URLs under the current zero-build static FTP architecture: social and OG crawlers fetch the one static `index.html` and read its fixed metadata before React and sql.js can resolve the record, so every query-string record URL falls back to the site-level card. Per-record previews therefore require a server-side or pre-generated path: static per-record share pages (one HTML file per record with baked-in metadata) or an Apache rewrite that serves record-specific metadata. That path is the `?record=` SSR-fallback work tracked in issue #263. Until that path exists, the site image is the only preview these URLs can show; a metadata-only change cannot satisfy this on its own.
- Reuse the archive's paper, black ink, archive mark, category rule, record title, publication, and date in a record-card image if per-record images are added.
- Keep image text large enough for a small social card.
- Use the site image as the first tier if per-record images are deferred.
- Verify Bluesky, Twitter/X, Facebook, Mastodon, Slack, iMessage, and generic Open Graph output.

This work maps to issues #263 and #483.

## Category maintenance

Issue #524 asks for more thematic categories and for a path Jay can maintain when Joe is unavailable.

Design requirements:

- The filter list and folder grid must handle more than six categories without redesign.
- Desktop may show the six most-used categories plus `More categories`.
- Narrow screens should use a searchable category section in the filter drawer.
- Folder view may paginate or group categories if the count grows beyond 12.
- Category order, label, color, and description should come from one documented data source.
- Do not add self-service editing controls to the public archive. Document the curator workflow separately unless an authenticated administration surface is approved later.

## Issue mapping

| Issue | Design response |
| --- | --- |
| [#602](https://github.com/jamditis/rosen-frontend/issues/602) | Show query scope in entity counts and detail. |
| [#601](https://github.com/jamditis/rosen-frontend/issues/601) | Add a removable query token that preserves other filters. |
| [#575](https://github.com/jamditis/rosen-frontend/issues/575) | Build an interactive, branded public guide with live links and counts. |
| [#561](https://github.com/jamditis/rosen-frontend/issues/561) | Add a shared archive breadcrumb/signpost inside readers and tools. |
| [#530](https://github.com/jamditis/rosen-frontend/issues/530) | Publish the guide and keep private intake instructions private. |
| [#525](https://github.com/jamditis/rosen-frontend/issues/525) | Replace blank query failures with a recoverable error state. |
| [#524](https://github.com/jamditis/rosen-frontend/issues/524) | Make category browsing and maintenance scale beyond six categories. |
| [#581](https://github.com/jamditis/rosen-frontend/issues/581) | Add record-specific feedback near the summary and prefill record context. |
| [#263](https://github.com/jamditis/rosen-frontend/issues/263) | Give record deep links informative share metadata. |
| [#483](https://github.com/jamditis/rosen-frontend/issues/483) | Restore a valid archive preview image. |
| [#584](https://github.com/jamditis/rosen-frontend/issues/584) | Do not add River of News to navigation until its product status is decided. |
| [#583](https://github.com/jamditis/rosen-frontend/issues/583) | Do not surface the data explorer until its public status is decided. |

## Delivery sequence

### Phase 1: clarity and accessibility

- Fix card semantics and focus styles.
- Fix modal naming, focus entry, focus trap, inert background, and focus return.
- Add active filter tokens, query scope, granular clear actions, and polite result announcements.
- Prevent false zero-result flashes.
- Add route-level blank/failure states.
- Add the shared archive orientation pattern.

### Phase 2: homepage hierarchy and responsive pacing

- Move search, scope, and results ahead of tall discovery content.
- Refine Read into one mobile highlight at a time.
- Add the mobile filter drawer.
- Collapse the timeline during active search and on narrow screens.
- Hide irrelevant sort controls in folder view.

### Phase 3: specialist routes

- Refine entity labels, scope, and detail behavior.
- Reframe analytics and separate social-post skew from article comparisons.
- Add an outline fallback and narrow-screen disclosures to the mind map.
- Build the public guide.

### Phase 4: sharing and category scale

- Restore the site preview image.
- Add record-specific previews through the #263 static or pre-generated share path (a metadata-only change cannot satisfy `?record=` query-string URLs), and, if approved, record-card images.
- Expand the category data model and document the curator workflow.

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

## Acceptance criteria

### Identity

- A side-by-side comparison still reads as the same archive.
- Existing typefaces, paper texture, core palette, folder metaphor, timeline, record modal, and category colors remain.
- No new visual trend layer is introduced.

### Homepage

- Search, active scope, result count, and first results are visible before Read highlights on a 390-by-844 CSS-pixel viewport.
- Users can remove any one filter, including query scope, without clearing the others.
- Search never shows a final empty state before the debounced query completes.
- Suggestions are keyboard-operable and deduplicated.
- Folder totals include an overlap explanation.

### Records

- Every record card is reachable and openable by keyboard as a real link.
- Opening a record moves focus into the dialog.
- Tab cannot escape the dialog.
- Escape closes the dialog.
- Closing returns focus to the triggering record.
- The background is inert while the dialog is open.
- The record URL remains shareable without losing the current result context.

### Entities

- Archive-wide and query-scoped counts cannot be confused.
- Query scope can be cleared independently.
- Entity type filters, search, and detail are usable at 390 CSS pixels without horizontal page scrolling.
- `P:N` shorthand is removed or explained.

### Analytics

- Earlier eras remain visually comparable even when social posts dominate the latest era.
- Exact values are available as text.
- The page explains its purpose before its implementation.

### Responsive and access

- The key tasks pass at 390, 768, 1024, and 1440 CSS pixels.
- The app passes the existing preview audit with no WCAG 2.1 AA violations.
- Manual keyboard, NVDA, high-contrast, reduced-motion, 200 percent text, and 400 percent zoom checks pass.
- Primary touch targets are at least 44 CSS pixels where layout permits and never below WCAG 2.2 minimum target requirements.
- No sticky element obscures focused content.

### Sharing

- The archive root returns a valid Open Graph image.
- A shared record shows its title and summary rather than the generic shell.
- Preview verification passes in at least Bluesky, Twitter/X, Slack, and a generic Open Graph debugger.

## Non-goals

- Replacing the zero-build React/HTM/sql.js architecture.
- Introducing Vite, Webpack, JSX, or a production build step.
- Rebranding the archive.
- Replacing Special Elite or Roboto Mono.
- Adding personalization, accounts, saved searches, or recommendations.
- Publishing private intake-bot details.
- Surfacing undecided hidden tools.
- Rewriting verified dissertation quotations or attributions.
- Changing the archive taxonomy without the curator decision required by the related data work.

## Open questions for maintainers

- Should the public guide be a main app route or a standalone page under `features/`? The spec calls for a real archive route with live links and counts; the exact mount point is open.
- Which public tool names does Jay prefer: plain nouns (`Entities`, `Analytics`) or reader-facing verbs (`Browse entities`, `View analytics`)?
- When space permits on mobile, should the header read `Rosen archive` or the full `Jay Rosen's Internet Archive`? The compact `JRIA` mark is only acceptable when the full name is in the accessible name.
- Should the data explorer and the unreachable River of News component be public, curator-only, or removed from navigation? This follows the product decisions in issues #583 (data explorer) and #584 (River of News). The broken SQL query builder is tracked separately as a bug in issue #525.

## Definition of done

The refinement is done when a first-time reader can understand the archive, search or browse it, see and remove every active constraint, open and close a record without losing place, understand whether counts are scoped, move through every key interaction by keyboard, and share a link that looks like the archive, while a returning reader still recognizes the current Rosen archive immediately.
