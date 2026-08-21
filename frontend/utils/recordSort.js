/**
 * Ordering for the record grid.
 *
 * The grid renders this array row-major (a CSS `grid`, left-to-right then
 * top-to-bottom), so the array order IS the reading order. 'date-asc', the
 * default, reads oldest-first across each row: the chronological timeline
 * order a reader expects after picking a year in the volume bars (issue #529).
 *
 * Record dates are ISO 'YYYY-MM-DD', so a lexicographic compare is already
 * chronological. The `|| ''` guards keep a record with a missing date or title
 * from throwing, sorting it as the earliest/empty key
 * rather than crashing the whole list.
 */

export const RECORD_SORTS = ['date-asc', 'date-desc', 'title-asc'];

const COMPARATORS = {
  'date-asc': (a, b) => (a.date || '').localeCompare(b.date || ''),
  'title-asc': (a, b) => (a.title || '').localeCompare(b.title || ''),
  'date-desc': (a, b) => (b.date || '').localeCompare(a.date || ''),
};

/**
 * Return a new array of records ordered for display. Unknown sort keys fall
 * back to 'date-desc' (newest-first), the historical default. Pure: the input
 * array is not mutated.
 *
 * @param {Array<{date?: string, title?: string}>} records
 * @param {string} sortBy - one of RECORD_SORTS; anything else means date-desc
 * @returns {Array} a sorted copy
 */
export const sortRecords = (records, sortBy) => {
  const cmp = COMPARATORS[sortBy] || COMPARATORS['date-desc'];
  return [...records].sort(cmp);
};
