import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

const records = parse(readFileSync(path.join(dataDir, 'archive_records-public.csv'), 'utf-8'), {
  columns: true,
  skip_empty_lines: true,
});

const byId = new Map(records.map((record) => [record.id, record]));

test('PressThink URL policy is documented in the schema', () => {
  const schema = readFileSync(path.join(dataDir, 'SCHEMA.md'), 'utf-8');

  assert.match(schema, /PressThink URL canonicalization/);
  assert.match(schema, /prefer `https:\/\/pressthink\.org\/<year>\/<month>\/<slug>\/`/);
  assert.match(schema, /keep `http:\/\/archive\.pressthink\.org\/<year>\/<month>\/<day>\/<slug>\.html`/);
});

test('Audience Atomization keeps the referenced record id with the modern PressThink URL', () => {
  assert.ok(!byId.has('RECORD-00699'), 'merged duplicate RECORD-00699 should be removed');

  const record = byId.get('RECORD-00340');
  assert.ok(record, 'canonical record should remain at RECORD-00340');
  assert.equal(
    record.title,
    'Audience Atomization Overcome: Why the Internet Weakens the Authority of the Press',
  );
  assert.equal(
    record.url,
    'https://pressthink.org/2009/01/audience-atomization-overcome-why-the-internet-weakens-the-authority-of-the-press/',
  );
  assert.match(record.raw_text, /Daniel C\. Hallin/);
  assert.match(record.raw_text, /sphere of legitimate debate/);
  assert.match(record.notes, /Merged duplicate RECORD-00699/);
});

test('CNN impossible dilemma keeps the dated record id with the working WNYC URL', () => {
  assert.ok(!byId.has('RECORD-00771'), 'merged duplicate RECORD-00771 should be removed');

  const record = byId.get('RECORD-00740');
  assert.ok(record, 'canonical record should remain at RECORD-00740');
  assert.equal(
    record.url,
    'https://www.wnycstudios.org/podcasts/otm/segments/cnn-impossible-dilemma-on-the-media',
  );
  assert.equal(record.publication_date, '2023-06-09');
  assert.match(record.notes, /Merged duplicate RECORD-00771/);
});
