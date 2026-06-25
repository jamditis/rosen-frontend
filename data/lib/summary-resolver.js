/**
 * Resolve the summary text shown for a record, letting a human-authored
 * excerpt override the auto-generated one (#309).
 *
 * Jay wants editorial control over the summary shown for new PressThink posts
 * instead of relying on the scraped/auto-generated text. The archive already
 * carries a scraped `excerpt` CSV column, but that field is full of UI artifacts
 * (see data/fixes/fix-junk-excerpts.js) and is only used to seed the pull quote,
 * so it is the wrong place to hang authored intent.
 *
 * Rather than add an optional 38th column to the 80k-line records CSV (which
 * would force every existing row to be padded, or the strict csv-parse to be
 * relaxed repo-wide), authored excerpts live in their own small sidecar file
 * keyed by record id: data/authored-excerpts.csv (record_id,authored_excerpt).
 * The export loads it into a Map and consults it here. The main corpus CSV and
 * every strict parser that reads it stay untouched.
 *
 * Precedence, highest first:
 *   1. authored excerpt for this record id (non-blank), when present
 *   2. the record's own CSV summary, exactly as today
 * The social-post summary fallback in export-archive-data.js is unchanged: it
 * still fires only when this resolver returns an empty string, so an authored
 * excerpt naturally suppresses the generated one.
 */

import { parse } from 'csv-parse/sync';
import { unescapeRow } from './csv-unescape.js';

/**
 * Parse the authored-excerpts sidecar CSV text into a Map of record id to the
 * authored excerpt. Blank excerpts are skipped so an empty cell never overrides
 * a real summary. Accepts the file contents (not a path) so it is testable
 * without touching the filesystem; pass '' for a missing/empty file.
 */
export function loadAuthoredExcerpts(csvText) {
  const map = new Map();
  if (!csvText || !csvText.trim()) return map;

  // Unescape at the read boundary, the same as the other export CSVs (#335), so
  // an authored excerpt saved with the spreadsheet-safety apostrophe (e.g. an
  // excerpt that opens with "@" stored as "'@...") renders as its original text.
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true }).map(unescapeRow);
  for (const row of rows) {
    const id = (row.record_id || row.id || row.ID || '').trim();
    const excerpt = (row.authored_excerpt || row.excerpt || '').trim();
    if (id && excerpt) map.set(id, excerpt);
  }
  return map;
}

/**
 * Pick the summary for a record: the authored excerpt when one exists for the
 * record's id, otherwise the record's existing CSV summary (returned verbatim,
 * no trimming, to preserve current behavior exactly when nothing is authored).
 *
 * Pass the record's resolved id (the same `rawId` the export ships the record
 * under) so the override and the served record agree by construction. When no id
 * is passed it falls back to the row's own id column, which is what the tests use.
 *
 * @param {object} row - a parsed CSV record row
 * @param {Map<string,string>} authoredExcerpts - id to authored excerpt
 * @param {string} [id] - the record's resolved id; defaults to the row's id column
 * @returns {string}
 */
export function resolveSummary(row, authoredExcerpts, id) {
  const recordId = (id !== undefined ? id : (row.id || row.ID || '')).trim();
  const authored = recordId && authoredExcerpts ? authoredExcerpts.get(recordId) : undefined;
  if (authored && authored.trim()) return authored.trim();
  return row.summary || row.Summary || '';
}
