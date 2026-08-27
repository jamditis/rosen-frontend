/**
 * Tests for data/lib/csv-record-surgery.js.
 *
 * The module exists because the archive's source CSVs cannot survive a
 * round-trip through a serializer: they hold bare-LF newlines inside CRLF
 * records, so a full rewrite changes every row, and a reader that treats a bare
 * LF as the end of a record reads a different set of records than csv-parse
 * does. The fixtures here reproduce that exact shape, because a helper that only
 * works on tidy CSVs would be no use for this data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'csv-parse/sync';
import {
  loadCsv,
  renderCsv,
  serializeRecord,
  verifyEdit,
} from '../data/lib/csv-record-surgery.js';

// Three records, CRLF-delimited, where the middle one holds a bare LF inside an
// unquoted field -- the shape archive_records-public.csv actually has.
const AWKWARD_CSV =
  'id,body,note\r\n' +
  'R1,plain,first\r\n' +
  'R2,line one\nline two,second\r\n' +
  'R3,"has, a comma",third\r\n';

test('reads the records csv-parse reads, not one row per line feed', () => {
  const file = loadCsv(AWKWARD_CSV);
  assert.deepEqual(
    file.entries.map((entry) => entry.record.id),
    ['R1', 'R2', 'R3'],
  );
  assert.equal(file.entries[1].record.body, 'line one\nline two');
  assert.deepEqual(file.columns, ['id', 'body', 'note']);
});

test('reassembles an untouched file byte for byte', () => {
  const file = loadCsv(AWKWARD_CSV);
  const rebuilt = renderCsv(file, file.entries.map((entry) => entry.raw));
  assert.equal(rebuilt, AWKWARD_CSV);
});

test('removing a record leaves the other rows byte-identical', () => {
  const file = loadCsv(AWKWARD_CSV);
  const kept = file.entries.filter((entry) => entry.record.id !== 'R2');
  const rebuilt = renderCsv(file, kept.map((entry) => entry.raw));

  assert.equal(rebuilt, 'id,body,note\r\nR1,plain,first\r\nR3,"has, a comma",third\r\n');
  assert.deepEqual(
    parse(rebuilt, { columns: true, skip_empty_lines: true }).map((r) => r.id),
    ['R1', 'R3'],
  );
});

test('a re-serialized record still parses back to the values it was given', () => {
  const file = loadCsv(AWKWARD_CSV);
  const edited = { ...file.entries[1].record, note: 'changed, with a comma' };
  const raws = file.entries.map((entry) =>
    entry.record.id === 'R2' ? serializeRecord(edited, file.columns) : entry.raw,
  );
  const rebuilt = renderCsv(file, raws);
  const reparsed = parse(rebuilt, { columns: true, skip_empty_lines: true });

  assert.equal(reparsed.length, 3);
  assert.equal(reparsed[1].note, 'changed, with a comma');
  assert.equal(reparsed[1].body, 'line one\nline two');
  assert.equal(reparsed[0].note, 'first');
});

test('verifyEdit passes when the file says exactly what the caller intended', () => {
  const file = loadCsv(AWKWARD_CSV);
  const expected = file.entries.map((entry) => entry.record);
  assert.deepEqual(verifyEdit(AWKWARD_CSV, expected, file.columns), []);
});

test('verifyEdit reports a field that did not come back as intended', () => {
  const file = loadCsv(AWKWARD_CSV);
  const expected = file.entries.map((entry) => entry.record);
  expected[0] = { ...expected[0], note: 'not what the file says' };

  const problems = verifyEdit(AWKWARD_CSV, expected, file.columns);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /row 0 \(R1\) field "note"/);
});

test('verifyEdit reports a record count that does not match', () => {
  const file = loadCsv(AWKWARD_CSV);
  const expected = file.entries.slice(0, 2).map((entry) => entry.record);

  const problems = verifyEdit(AWKWARD_CSV, expected, file.columns);
  assert.deepEqual(problems, ['record count is 3, expected 2']);
});

test('loadCsv refuses a file with no records', () => {
  assert.throws(() => loadCsv('id,body,note\r\n'), /no records/);
});
