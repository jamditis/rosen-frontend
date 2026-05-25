import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';

const records = parse(readFileSync('data/archive_records-public.csv', 'utf8'), {
  columns: true,
  bom: true,
  relax_quotes: true,
});

const byId = new Map(records.map((record) => [record.id, record]));

test('PressThink URL policy is documented in the schema', () => {
  const schema = readFileSync('data/SCHEMA.md', 'utf8');

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
  assert.ok(record.raw_text.length > 30000, 'canonical record should keep the richer modern text');
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
