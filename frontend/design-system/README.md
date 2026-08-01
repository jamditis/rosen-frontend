# Archive design-system foundations

This directory holds the shared visual foundation for Jay Rosen's Internet
Archive. It is plain CSS so the production site remains a zero-build static
bundle.

## Files and load order

- `legacy-token-bridge.css` keeps the first visit across a worker update safe.
- `tokens.css` defines canonical values. It does not own component presentation.
- `recipes.css` defines small, namespaced interface patterns.
- `demo.html` renders the current contract at mobile and desktop widths.

The main application loads styles in this order:

```html
<link rel="stylesheet" href="./frontend/design-system/legacy-token-bridge.css?v=...">
<link rel="stylesheet" href="./frontend/design-system/tokens.css?v=...">
<link rel="stylesheet" href="./frontend/index.css?v=...">
<link rel="stylesheet" href="./frontend/dist/tailwind.css?v=...">
<link rel="stylesheet" href="./frontend/design-system/recipes.css?v=...">
```

The deployed document loads `legacy-token-bridge.css` immediately before
`tokens.css`. Its pathname did not exist in the previous worker's cache, so it
can provide semantic fallbacks while that worker serves its old token file on
the first post-deploy navigation. The canonical token file overrides the bridge
as soon as the current asset reaches the browser.

Tokens load before their consumers. Recipes load after Tailwind so a component
can opt into a stable recipe without depending on a generated utility class.
Standalone pages load any generated utility stylesheet first, then the legacy
bridge, tokens, recipes, `shared-styles.css`, and finally their page-owned
stylesheet or inline composition rules.

## Semantic tokens

New work should use the `--archive-*` roles. The older `--color-*` and
`--shadow-*` names remain as aliases while existing surfaces move over in
focused pull requests.

| Role | Purpose |
| --- | --- |
| `--archive-canvas` | Main warm page background |
| `--archive-paper` | Raised sheets, controls, and panels |
| `--archive-paper-deep` | Recessed or grouped surfaces |
| `--archive-ink` | Primary text and strong rules |
| `--archive-ink-muted` | Secondary text that still meets WCAG AA on paper |
| `--archive-rule` | Dividers and neutral borders |
| `--archive-hero` | Dark editorial fields |
| `--archive-signal` | High-attention yellow accent |
| `--archive-manila` | Labels and filing cues |
| `--archive-sky`, `--archive-amber`, `--archive-green` | Restrained category accents |
| `--archive-focus` | Keyboard focus indicator |
| `--archive-target-min` | 44-pixel minimum interactive size |

Accent base colors are for fills, rules, and decoration. Use the matching dark
token for text on a light surface.

## Recipes

Recipes are CSS classes, not JavaScript components. They do not own behavior,
DOM structure, state, focus management, or application data.

### Canvas and labels

```html
<main class="archive-canvas">
  <p class="archive-section-label">A living collection</p>
</main>
```

### Actions

```html
<a class="archive-action archive-action--primary" href="...">Primary action</a>
<button class="archive-action archive-action--secondary">Secondary action</button>
<button class="archive-action archive-action--quiet">Quiet action</button>
```

Use primary once per decision group. Secondary actions have equal geometry but
less visual weight. Quiet actions are for nearby utility work. Pills remain for
filters, compact choices, and state; they are not the default button shape.

### Controls

```html
<label for="archive-query">Search the archive</label>
<input class="archive-control" id="archive-query" type="search">
```

The recipe supplies visible borders, inherited type, a 44-pixel minimum height,
and a `:focus-visible` outline. Labels and accessible names remain the owning
component's responsibility.

### Panels and frames

```html
<section class="archive-panel">Neutral panel</section>
<section class="archive-panel archive-panel--accent">Signal panel</section>
<figure class="archive-frame">Framed media</figure>
```

Panels use square geometry. Offset shadows and signal bars mark editorial
emphasis; they should not appear on every card.

### Notices, statistics, and dialogs

```html
<aside class="archive-notice">Informational note</aside>
<aside class="archive-notice archive-notice--warning">Check this detail</aside>

<div class="archive-stat">
  <span class="archive-stat__label">Records</span>
  <strong class="archive-stat__value">1,029</strong>
</div>

<div class="archive-dialog-backdrop">
  <section class="archive-dialog" role="dialog" aria-modal="true">...</section>
</div>
```

The dialog recipe handles presentation only. The component must still manage
the accessible name, initial focus, focus containment, Escape, close behavior,
and focus return.

## Density

Apply a density modifier to a recipe or a containing region:

```html
<section class="archive-panel archive-density--compact">...</section>
<section class="archive-panel archive-density--spacious">...</section>
```

Compact density is for dashboards and repeated controls. Spacious density is
for orientation and editorial sections. Both preserve the 44-pixel interactive
minimum.

## Accessibility contract

The recipe layer provides:

- `:focus-visible` outlines that remain distinct from borders;
- a 44-pixel minimum action and control size;
- reduced-motion behavior that removes dialog entrance animation and movement;
- forced-colors rules that replace decorative fills and shadows with system
  colors;
- hover movement only on devices that report hover capability; and
- print rules that remove decorative shadows.

These safeguards do not replace semantic HTML, accessible names, keyboard
behavior, or route-level testing.

## Migration boundaries

- Keep behavior and markup ownership in the current React or page component.
- Add recipe classes only where the recipe expresses the existing role.
- Keep page-specific composition, unusual hero treatments, and information
  colors in the page stylesheet.
- Do not create a generic JavaScript component library around these classes.
- Migrate one coherent surface per pull request and compare it at mobile,
  tablet, and desktop widths.

## Visual restraint

Use expressive archival treatments for orientation, narrative context, and
primary artifacts. A landing page can earn a dark editorial field, a clipped
label, or one offset signal panel when those choices help a reader understand
where they are and why the material matters.

Dense utility routes should let the system recede. Archive results, entity
lists, analytics, repeated filters, and research tools should prefer compact
density, plain paper, strong rules, and predictable controls. Repeated shadows,
rotated elements, and competing signal colors make those surfaces harder to
scan.

Specialized modes keep their own visual identity. The dissertation may remain
dark and book-like; Rosen 98 may keep teal wallpaper, blue title bars, and
spatial windows. Shared tokens should improve contrast, focus, and state without
making either mode look like the standard archive.

## Release checks

When a deployable stylesheet changes:

1. Run `npm run bump-version -- X.X.X`.
2. Run `npm run test:frontend` and `npm run preview:audit`.
3. Inspect `frontend/design-system/demo.html` and the changed production route.
4. After merge, inspect `https://jamditis.github.io/rosen-frontend/` as the
   release candidate before packaging the same committed files for FTP.
