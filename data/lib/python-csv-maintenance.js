/** CSV bridge for Python maintenance: use the exporter's parser and retain raw rows. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { loadCsv, renderCsv, serializeRecord, verifyEdit } from './csv-record-surgery.js';

function loadEditableCsv(source, rows, columns) {
  if (!rows.length) {
    return { header: source, trailer: '', entries: [], columns, lf: !source.endsWith('\r\n') };
  }

  const entries = parse(source, { columns: true, skip_empty_lines: true, raw: true });
  const headerEnd = source.indexOf(entries[0].raw);
  const header = source.slice(0, headerEnd);
  if (header.endsWith('\r\n')) {
    return loadCsv(source);
  }

  // csv-parse includes LF delimiters in raw slices, unlike its CRLF slices.
  // Keep the full slices and serialize only edited LF rows with the same ending.
  const body = entries.map(entry => entry.raw).join('');
  const trailer = source.slice(headerEnd + body.length);
  if (header + body + trailer !== source || !['', '\n'].includes(trailer)) {
    throw new Error('LF record slices do not reassemble the source file');
  }
  return { header, trailer, entries, columns, lf: true };
}

function renderExpected(file, columns, expected) {
  if (JSON.stringify(columns) !== JSON.stringify(file.columns)) {
    throw new Error('Maintenance cannot change CSV columns');
  }
  const key = record => JSON.stringify(columns.map(column => record[column] ?? ''));
  const unchanged = new Map();
  for (const entry of file.entries) {
    const signature = key(entry.record);
    if (!unchanged.has(signature)) unchanged.set(signature, []);
    unchanged.get(signature).push(entry.raw);
  }
  for (const originals of unchanged.values()) originals.reverse();
  const raws = expected.map(record => {
    if (Object.keys(record).some(column => !columns.includes(column))) {
      throw new Error('Maintenance row has unknown columns');
    }
    const originals = unchanged.get(key(record));
    if (originals?.length) return originals.pop();
    return file.lf
      ? stringify([record], { columns, header: false, record_delimiter: '\n' })
      : serializeRecord(record, columns);
  });
  const result = !expected.length ? file.header
    : file.lf ? file.header + raws.join('') + file.trailer : renderCsv(file, raws);
  const problems = verifyEdit(result, expected, columns);
  if (problems.length) throw new Error(problems.join('\n'));
  return result;
}

function main() {
  const [operation, filename] = process.argv.slice(2);
  if (!['read', 'render'].includes(operation)) {
    throw new Error('Expected read or render operation');
  }

  const originalBytes = fs.readFileSync(filename);
  const original = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    .decode(originalBytes);
  const bom = original.startsWith('\ufeff') ? '\ufeff' : '';
  const source = original.slice(bom.length);
  const rows = parse(source, { columns: true, skip_empty_lines: true });
  // A prior removal can leave only the header. Retain it without weakening the
  // surgery helper, which deliberately requires at least one record.
  const columns = rows.length ? Object.keys(rows[0]) : parse(source, { to: 1 })[0];
  if (!columns?.length) throw new Error('CSV has no header');

  if (operation === 'read') {
    process.stdout.write(JSON.stringify([columns, rows]));
    return;
  }

  const file = loadEditableCsv(source, rows, columns);
  const [expectedColumns, expectedRows] = JSON.parse(fs.readFileSync(0, 'utf8'));
  process.stdout.write(`${crypto.createHash('sha256').update(originalBytes).digest('hex')}\n`);
  process.stdout.write(bom + renderExpected(file, expectedColumns, expectedRows));
}

main();
