/**
 * Reverse the CSV formula-injection escaping at the site-export boundary (#335).
 *
 * The canonical CSVs are escaped for spreadsheet safety: a cell whose first
 * character is a formula trigger (= + - @ \t \r \n) gets a leading apostrophe so
 * Excel/Sheets render the text instead of evaluating a formula (see
 * backend/src/rosen_scraper/csv_safety.py sanitize_csv_value). That apostrophe is
 * corruption for the public site, which reads the CSV as data, not as a
 * spreadsheet — without this, an @handle entity name renders as "'@JayRosen".
 *
 * This is the read-side inverse, applied when data/export-archive-data.js maps
 * CSV rows to site JSON. It mirrors unescape_csv_value in csv_safety.py exactly:
 * strip a single leading apostrophe ONLY when it directly precedes a trigger, so
 * an escaped value restores to its original text while a legitimate leading
 * apostrophe ("'tis") is left intact. A pre-existing raw trigger cell (one never
 * escaped, #336) has no leading apostrophe and passes through unchanged.
 *
 * Accepted limitation: the escape is lossy, so a value that genuinely begins with
 * an apostrophe-then-trigger (e.g. a quote written as "'@handle said") is
 * indistinguishable on disk from an escaped @handle, and this unescape strips its
 * apostrophe. That is the inherent cost of the canonical escaping the issue keeps
 * for spreadsheet safety (#335 chose the read-side fix over un-escaping the
 * canonical data); the Python pair carries the same ambiguity. The corpus has
 * zero such cells today, and the common case (every escaped @handle / formula)
 * dominates. Eliminating the ambiguity entirely would require not escaping the
 * site-read copy upstream — out of scope here, related to #336.
 *
 * Apply ONLY at the site-export read boundary, never to data that round-trips
 * back into the canonical CSV (that would compound the loss).
 *
 * Keep this in sync with csv_safety.py — the two are a matched escape/unescape pair.
 */

// OWASP CSV-injection prefixes — must match CSV_INJECTION_PREFIXES in csv_safety.py.
const CSV_INJECTION_PREFIXES = new Set(['=', '+', '-', '@', '\t', '\r', '\n']);

/**
 * Strip the canonical formula-escape from a single value.
 * Non-strings and values shorter than 2 chars pass through unchanged.
 */
export function unescapeCsvValue(value) {
  if (typeof value !== 'string' || value.length < 2) return value;
  if (value[0] === "'" && CSV_INJECTION_PREFIXES.has(value[1])) {
    return value.slice(1);
  }
  return value;
}

/**
 * Return a new row object with every string cell unescaped. Applied once at the
 * CSV-parse boundary so every downstream consumer (record fields, entity fields,
 * relationship snippets) sees raw values — no per-field call sites to miss.
 */
export function unescapeRow(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    out[key] = unescapeCsvValue(row[key]);
  }
  return out;
}

export default { unescapeCsvValue, unescapeRow };
