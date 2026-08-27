/**
 * Edit the archive's source CSVs without rewriting the rows you did not touch.
 *
 * These files cannot be round-tripped through a CSV serializer. They store
 * multi-line fields (raw_text above all) with bare-LF newlines inside CRLF
 * record delimiters, so re-serializing every row rewrites its quoting and line
 * endings. Worse, a reader that treats a bare LF as the end of a record splits
 * archive_records-public.csv into 1,783 rows where csv-parse -- the reader the
 * exporter, the tests, and the site itself use -- sees 1,036. Rewriting the file
 * from a parse like that bakes the wrong record structure in.
 *
 * So this module never re-serializes a row it is not changing. csv-parse hands
 * back each record's own source text (`raw`), and a file is exactly its header,
 * then those raw slices joined by "\n", then a trailing newline. Removing a
 * record means dropping its slice; changing one means re-serializing that single
 * record. Every other byte survives untouched, which keeps the diff of a
 * seven-record removal to seven records.
 *
 * data/fixes/fix-author-is-document-summaries.js established the approach for
 * one-field edits; this generalizes it to removals and to whole-row edits, and
 * adds the check that makes it safe: verifyEdit re-parses the result and
 * compares every field of every surviving record against what the caller said
 * it expected. A caller that writes only after verifyEdit passes cannot corrupt
 * the file, because a wrong edit fails the comparison instead of reaching disk.
 */
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const PARSE_OPTIONS = { columns: true, skip_empty_lines: true };

/**
 * Parse a CSV into its header, its records, and each record's source text.
 *
 * @param {string} text the file contents
 * @returns {{header: string, columns: string[], entries: Array<{record: object, raw: string}>, trailer: string}}
 */
export function loadCsv(text) {
  const parsed = parse(text, { ...PARSE_OPTIONS, raw: true });
  if (parsed.length === 0) throw new Error('loadCsv: no records');

  const entries = parsed.map(({ record, raw }) => ({ record, raw }));
  const headerEnd = text.indexOf(entries[0].raw);
  const header = text.slice(0, headerEnd);
  const body = entries.map((entry) => entry.raw).join('\n');
  const trailer = text.slice(headerEnd + body.length);

  // The invariant the whole module rests on. If it does not hold, the raw
  // slices are not a faithful decomposition of the file and nothing below is
  // safe, so stop rather than write a file built on a bad assumption.
  if (header + body + trailer !== text) {
    throw new Error('loadCsv: record slices do not reassemble the source file');
  }
  if (trailer !== '' && trailer !== '\n') {
    throw new Error(`loadCsv: unexpected trailing bytes ${JSON.stringify(trailer)}`);
  }

  return { header, columns: Object.keys(entries[0].record), entries, trailer };
}

/** Reassemble a file from its header, a list of record source texts, and the trailer. */
export function renderCsv({ header, trailer }, raws) {
  return header + raws.join('\n') + trailer;
}

/**
 * Serialize one edited record back to a source slice.
 *
 * The record delimiter is CRLF to match the file, and the trailing newline is
 * stripped because the joiner in renderCsv supplies it. Quoting is left to
 * csv-stringify, which quotes a field holding a comma, a quote, or a CRLF --
 * the same shape the file already uses.
 */
export function serializeRecord(record, columns) {
  const text = stringify([record], { columns, header: false, record_delimiter: '\r\n' });
  return text.replace(/\n$/, '');
}

/**
 * Re-parse an edited file and confirm it says exactly what the caller intended.
 *
 * @param {string} text the edited file
 * @param {object[]} expected the records the file should now hold, in order
 * @param {string[]} columns the fields to compare
 * @returns {string[]} problems found; empty means the edit is safe to write
 */
export function verifyEdit(text, expected, columns) {
  let actual;
  try {
    actual = parse(text, PARSE_OPTIONS);
  } catch (err) {
    return [`edited CSV no longer parses: ${err.message}`];
  }

  const problems = [];
  if (actual.length !== expected.length) {
    problems.push(`record count is ${actual.length}, expected ${expected.length}`);
    return problems;
  }
  for (let i = 0; i < expected.length; i++) {
    for (const column of columns) {
      const want = expected[i][column] ?? '';
      const got = actual[i][column] ?? '';
      if (want !== got) {
        const id = expected[i][columns[0]];
        problems.push(
          `row ${i} (${id}) field "${column}": expected ${JSON.stringify(String(want).slice(0, 80))}, ` +
            `got ${JSON.stringify(String(got).slice(0, 80))}`,
        );
      }
    }
  }
  return problems;
}

export default { loadCsv, renderCsv, serializeRecord, verifyEdit };
