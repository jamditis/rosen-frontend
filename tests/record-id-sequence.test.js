import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { parse } from 'csv-parse/sync';

test('durable article reservations cover every canonical RECORD ID', () => {
  const state = JSON.parse(fs.readFileSync('data/record-id-sequence.json', 'utf8'));
  assert.equal(state.version, 1);
  assert.ok(Number.isSafeInteger(state.high_water) && state.high_water >= 0);
  const rows = parse(fs.readFileSync('data/archive_records-public.csv', 'utf8'), {
    columns: true, skip_empty_lines: true, bom: true,
  });
  const highest = rows.reduce((maximum, row) => {
    const number = /^RECORD-(\d+)$/.exec(row.id || '');
    return number ? Math.max(maximum, Number(number[1])) : maximum;
  }, 0);
  assert.ok(state.high_water >= highest, 'Commit article reservations with canonical rows; never lower them after retirement');
});
