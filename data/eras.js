/**
 * Canonical era taxonomy shared by the export pipeline, tests, analytics, and
 * frontend. Each previously held its own copy of this list.
 *
 * These 8 values are the eras the published archive actually uses: every
 * record in archive_records-public.csv carries one of them, the export
 * pipeline (data/export-archive-data.js) emits them as `facets.eras`, and
 * data/SCHEMA.md documents the same list. The order here is the published
 * order of `facets.eras`; keep it stable.
 *
 * Note: issue #197 proposed a different 8-era taxonomy (a non-overlapping
 * timeline with COVID-19 / Post-Trump / Second Trump splits). That proposal
 * was not adopted. Joe decided issue #201 on 2026-07-09: use the canonical
 * 8-era taxonomy below across the repository.
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
