/**
 * Canonical era taxonomy shared by the export pipeline and the
 * data-integrity test — each previously held its own copy of this list.
 *
 * These 8 values are the eras the published archive actually uses: every
 * record in archive_records-public.csv carries one of them, the export
 * pipeline (data/export-archive-data.js) emits them as `facets.eras`, and
 * data/SCHEMA.md documents the same list. The order here is the published
 * order of `facets.eras`; keep it stable.
 *
 * This is not yet the repo-wide single source. Two other surfaces still
 * carry an independent — and currently divergent — era list: the frontend
 * fallback in frontend/constants.js (a stale 4-value taxonomy) and the
 * analytics ordering in data/compute-analytics.js. Folding those in is
 * tracked in issue #385; it is partly gated on the taxonomy decision below
 * because the frontend list is a different (coarser) taxonomy.
 *
 * Note: issue #197 proposed a different 8-era taxonomy (a non-overlapping
 * timeline with COVID-19 / Post-Trump / Second Trump splits). That proposal
 * was not adopted — the data conforms to the list below. Choosing between
 * the two taxonomies is the open editorial decision tracked in issue #201;
 * if it lands on #197's set, change this one file and run the data migration.
 */
export const ERAS = [
  "Public Journalism (90s)",
  "Blogging Launch & Digital Disruption (2000-2004)",
  "Peak Blogging & Citizen Journalism (2005-2009)",
  "Social Media & Financial Crisis (2010-2015)",
  "View from Nowhere (10s)",
  "Trump Era & Democratic Crisis (2016-2020)",
  "Democracy in Crisis (20s)",
  "Platform Transition & Future Models (2021-Present)"
];
