/**
 * RECORD-00429 conflated-row split (#863)
 *
 * RECORD-00429 stored the URL of the 2005-02-07 samb_esn_p.html post
 * alongside the title and publication date of a different post, the
 * 2005-02-10 jrd_qust post. This test pins the fix: RECORD-00429 now
 * describes the work its URL actually points to, and the jrd_qust work
 * exists as its own verified record.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

let records;

before(() => {
  const csvText = fs.readFileSync(
    path.join(rootDir, 'data', 'archive_records-public.csv'),
    'utf-8'
  );
  records = parse(csvText, { columns: true, skip_empty_lines: true });
});

describe('RECORD-00429 conflated-row split (#863)', () => {
  it('RECORD-00429 carries the title and date for its own samb_esn URL', () => {
    const record = records.find((r) => r.id === 'RECORD-00429');
    assert.ok(record, 'RECORD-00429 must still exist');
    assert.match(record.url, /samb_esn/);
    assert.equal(
      record.title,
      'Richard Sambrook of the BBC: What Eason Jordan Said in Davos'
    );
    assert.equal(record.publication_date, '2005-02-07');
  });

  it('the jrd_qust work has its own record, no longer borrowed by RECORD-00429', () => {
    const jrdQust = records.find((r) => /jrd_qust/.test(r.url || ''));
    assert.ok(jrdQust, 'a record for the jrd_qust post must exist');
    assert.notEqual(jrdQust.id, 'RECORD-00429');
    assert.equal(
      jrdQust.title,
      'Blog Storm Troopers or Pack Journalism at its Best?'
    );
    assert.equal(jrdQust.publication_date, '2005-02-10');
    assert.equal(jrdQust.author, 'Jay Rosen');
    assert.equal(jrdQust.verified, 'TRUE');
    assert.ok(jrdQust.raw_text && jrdQust.raw_text.length > 500,
      'the split-off record should carry recovered article text');
  });

  it('no single row still conflates the two works', () => {
    const samb = records.find((r) => /samb_esn/.test(r.url || ''));
    const jrdQust = records.find((r) => /jrd_qust/.test(r.url || ''));
    assert.notEqual(samb.id, jrdQust.id, 'the two works must live in separate rows');
    // The samb_esn row must not carry the other work's title.
    assert.notEqual(samb.title, 'Blog Storm Troopers or Pack Journalism at its Best?');
  });

  it('every record id in the CSV is unique', () => {
    const ids = records.map((r) => r.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size,
      `found ${ids.length - uniqueIds.size} duplicate ids`);
  });
});
