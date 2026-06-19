// Pure predicate for the "needs review" flag (#350).
//
// A record is auto-published but flagged for a human pass when its needsReview
// field is set. The field's type is not stable across the data pipeline: the
// committed JSON stores a boolean, while data/export-archive-data.js coerces it
// with .toString() (a string) on regeneration. No flagged record reaches
// production yet, so the marker must read both shapes or it would silently stop
// rendering the day the JSON is regenerated. Accept boolean true and the string
// 'true' (trimmed, case-insensitive); treat everything else — false, '', a
// truthy non-true value, an absent field, null — as not flagged. Normalising the
// field to one type upstream is tracked in #356.
export function recordNeedsReview(record) {
  const value = record == null ? undefined : record.needsReview;
  if (value === true) return true;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
}

export default { recordNeedsReview };
