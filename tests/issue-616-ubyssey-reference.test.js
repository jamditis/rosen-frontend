import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';

const SOURCE_URL = 'https://ubyssey.ca/margins/world-cup-coverage/';

test('issue #616: the Ubyssey awayness reference is published in the archive', () => {
  const rows = parse(fs.readFileSync('data/archive_records-public.csv', 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });
  const sourceRecord = rows.find((row) => row.url === SOURCE_URL);

  assert.ok(sourceRecord, 'the source CSV should include the reported Ubyssey article');
  assert.equal(sourceRecord.author, 'Caleb Peterson');
  assert.equal(sourceRecord.publication_date, '2026-07-15');
  assert.match(sourceRecord.key_concepts, /awayness/i);
  assert.equal(sourceRecord.verified, 'TRUE');

  const archive = JSON.parse(fs.readFileSync('data/archive-data.json', 'utf8'));
  const publishedRecord = archive.records.find((record) => record.url === SOURCE_URL);

  assert.ok(publishedRecord, 'the generated archive should include the reported Ubyssey article');
  assert.equal(publishedRecord.id, sourceRecord.id);
});
