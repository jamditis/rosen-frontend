// Hidden extras for the archive (#754): small, quiet rewards for people who
// poke at the site. This module holds the pure part — copy, timings, and the
// trigger logic — with no DOM and no ?v= imports, so the Node suite can import
// it by bare path the same way it imports recordDeepLink.js.
//
// House rules every extra follows:
// - Nothing here plays sound.
// - Nothing here traps focus, and every surfaced note can be dismissed.
// - Motion is optional. A visitor who asks for reduced motion still gets the
//   words, just not the movement.
// - Normal reading, search, and navigation never change.

/** Typing these letters outside a form field turns the page into a typewriter. */
export const TYPEWRITER_SEQUENCE = 'pressthink';

/** How long the typewriter treatment stays on before it reverts itself. */
export const TYPEWRITER_DURATION_MS = 6000;

/** The search term that reveals the dissertation note. */
export const DISSERTATION_YEAR = '1986';

/** How long the About page waits, with no input, before the last line appears. */
export const IDLE_REVEAL_MS = 120000;

/** Clicks on one category filter, inside one window, that count as a streak. */
export const BROKEN_RECORD_CLICKS = 5;
export const BROKEN_RECORD_WINDOW_MS = 2500;

/** How long the result list skips after a streak. */
export const BROKEN_RECORD_SKIP_MS = 900;

/** The single line on the hidden #nowhere route. */
export const NOWHERE_LINE = 'There is no view from nowhere.';

/** Jay Rosen, "The View from Nowhere: Questions and Answers", PressThink, 2010. */
export const NOWHERE_RECORD_ID = 'RECORD-00076';

/** The line the About page reveals to a visitor who stays put. */
export const IDLE_LINE = "Still here? Then you're no longer the audience.";

/** The note behind a search for the dissertation year. */
export const DISSERTATION_YEAR_NOTE =
  '1986 is the year of the dissertation: "The Impossible Press", written at New York University.';

/**
 * Match a fixed run of characters typed one at a time.
 * The matcher keeps only the last few characters, so a false start such as
 * "ppressthink" still completes. Case is ignored.
 */
export function createSequenceMatcher(sequence) {
  const target = String(sequence || '').toLowerCase();
  if (target === '') throw new TypeError('createSequenceMatcher requires a sequence');

  let buffer = '';

  return {
    push(character) {
      if (typeof character !== 'string' || character.length !== 1) return false;
      buffer = (buffer + character.toLowerCase()).slice(-target.length);
      if (buffer !== target) return false;
      buffer = '';
      return true;
    },
    reset() {
      buffer = '';
    },
  };
}

/**
 * Count repeat hits on the same key inside a time window.
 * `register` returns true on the hit that reaches the threshold, then starts
 * over. A different key, or a gap longer than the window, restarts the count.
 */
export function createRapidRepeatCounter({
  threshold = BROKEN_RECORD_CLICKS,
  windowMs = BROKEN_RECORD_WINDOW_MS,
} = {}) {
  let lastKey = null;
  let lastAt = 0;
  let count = 0;

  const reset = () => {
    lastKey = null;
    lastAt = 0;
    count = 0;
  };

  return {
    register(key, now) {
      const at = Number.isFinite(now) ? now : 0;
      if (key !== lastKey || at - lastAt > windowMs) count = 0;
      lastKey = key;
      lastAt = at;
      count += 1;
      if (count < threshold) return false;
      reset();
      return true;
    },
    reset,
  };
}

/**
 * True when a keystroke belongs to the person's own typing, not to the page.
 * The typewriter extra ignores these targets so search and forms stay normal.
 */
export function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable === true) return true;
  const tag = typeof target.tagName === 'string' ? target.tagName.toLowerCase() : '';
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

/** True when the search box holds the dissertation year and nothing else. */
export function isDissertationYearQuery(value) {
  return String(value == null ? '' : value).trim() === DISSERTATION_YEAR;
}

/**
 * Summarise how long one category has been repeating itself.
 * Returns null when the category has fewer than two records, because a single
 * record is not a broken record.
 */
export function summarizeBrokenRecord(category, records) {
  if (typeof category !== 'string' || category === '') return null;
  if (!Array.isArray(records)) return null;

  const matching = records.filter(record => (record?.categories || []).includes(category));
  if (matching.length < 2) return null;

  const years = matching
    .map(record => Number(record?.year))
    .filter(year => Number.isFinite(year));
  if (years.length === 0) return null;

  return {
    category,
    count: matching.length,
    firstYear: String(Math.min(...years)),
    lastYear: String(Math.max(...years)),
  };
}

/** The one line the broken-record extra shows. */
export function brokenRecordLine(summary) {
  if (!summary) return '';
  const span = summary.firstYear === summary.lastYear
    ? `all from ${summary.firstYear}`
    : `${summary.firstYear} to ${summary.lastYear}`;
  return `Broken record: ${summary.count} records filed under ${summary.category}, ${span}. Some things bear repeating.`;
}

export default {
  brokenRecordLine,
  createRapidRepeatCounter,
  createSequenceMatcher,
  isDissertationYearQuery,
  isTypingTarget,
  summarizeBrokenRecord,
};
