# Main Interface Changelog

## 2025-10-13

- Rebuilt the archive explorer layout with a modular architecture (`index.html`, `assets/css`, `assets/js`).
- Split data fetching, filtering, and UI rendering into dedicated ES modules for maintainability.
- Introduced accessible filter drawer, responsive grid/list toggle, and semantic dialog markup.
- Added lightweight design system (buttons, chips, typography) driven by CSS custom properties.
- Archived the previous single-file prototype under `legacy/` for reference.
- Restored rich record detail view (metadata grid, YouTube embeds, related/responds chips, resource links) while keeping the new modular layout.
- Normalised CSV parsing for all schema fields and bundled `sample-data.csv` (first 25 records from the production dataset) as the offline fallback.
