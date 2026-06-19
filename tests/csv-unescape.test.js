/**
 * CSV formula-escape unescape at the site-export boundary (#335)
 *
 * The canonical CSVs prefix a leading apostrophe to any cell that starts with a
 * spreadsheet formula trigger (= + - @ \t \r \n) so the file is safe to open in
 * Excel/Sheets (backend csv_safety.py sanitize_csv_value). That apostrophe is
 * corruption for the public site, which reads the CSV as data. These tests pin
 * the read-side inverse used by data/export-archive-data.js, mirroring the
 * Python unescape_csv_value: strip a single leading apostrophe ONLY when it
 * directly precedes a trigger, and leave a legitimate leading apostrophe alone.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unescapeCsvValue, unescapeRow } from '../data/lib/csv-unescape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');

describe('unescapeCsvValue — reverses the canonical formula-escape', () => {
  it('strips the apostrophe before every formula trigger', () => {
    assert.equal(unescapeCsvValue("'@JayRosen"), '@JayRosen');
    assert.equal(unescapeCsvValue("'=SUM(A1:A2)"), '=SUM(A1:A2)');
    assert.equal(unescapeCsvValue("'+1 looks like a phone number"), '+1 looks like a phone number');
    assert.equal(unescapeCsvValue("'-5 degrees"), '-5 degrees');
    assert.equal(unescapeCsvValue("'\ttabbed"), '\ttabbed');
    assert.equal(unescapeCsvValue("'\rcarriage"), '\rcarriage');
    assert.equal(unescapeCsvValue("'\nnewline"), '\nnewline');
  });

  it('leaves a legitimate leading apostrophe intact (not a formula trigger after it)', () => {
    // The realistic false-positive guard: an apostrophe that is real content.
    assert.equal(unescapeCsvValue("'tis the season"), "'tis the season");
    assert.equal(unescapeCsvValue("'Hello' he said"), "'Hello' he said");
    assert.equal(unescapeCsvValue("''double"), "''double"); // second char is ', not a trigger
  });

  it('leaves an unescaped (pre-existing raw) trigger cell unchanged', () => {
    // #336 leaves some legacy cells raw; the site must still render them as-is.
    assert.equal(unescapeCsvValue('@handle'), '@handle');
    assert.equal(unescapeCsvValue('=formula'), '=formula');
    assert.equal(unescapeCsvValue('plain text'), 'plain text');
  });

  it('only strips the FIRST apostrophe (one level of escaping)', () => {
    // sanitize never double-escapes (a leading ' is not itself a trigger), so
    // unescape removes exactly one apostrophe and is stable thereafter.
    assert.equal(unescapeCsvValue("'@x"), '@x');
    assert.equal(unescapeCsvValue(unescapeCsvValue("'@x")), '@x');
  });

  it('passes through short and non-string values unchanged', () => {
    assert.equal(unescapeCsvValue("'"), "'");      // length 1
    assert.equal(unescapeCsvValue('='), '=');       // length 1, raw trigger
    assert.equal(unescapeCsvValue(''), '');
    assert.equal(unescapeCsvValue(42), 42);
    assert.equal(unescapeCsvValue(null), null);
    assert.equal(unescapeCsvValue(undefined), undefined);
    const obj = { a: 1 };
    assert.equal(unescapeCsvValue(obj), obj);
  });
});

describe('unescapeRow — unescapes every string cell, leaves others alone', () => {
  it('cleans escaped cells and passes non-string / non-escaped cells through', () => {
    const row = {
      entity_name: "'@JayRosen",
      role_or_description: "'=lead critic",
      affiliation: 'NYU',
      summary: "'tis a normal sentence",
      count: 7,
      missing: undefined,
    };
    assert.deepEqual(unescapeRow(row), {
      entity_name: '@JayRosen',
      role_or_description: '=lead critic',
      affiliation: 'NYU',
      summary: "'tis a normal sentence",
      count: 7,
      missing: undefined,
    });
  });

  it('returns a new object (does not mutate the input row)', () => {
    const row = { name: "'@x" };
    const out = unescapeRow(row);
    assert.notEqual(out, row);
    assert.equal(row.name, "'@x"); // original untouched
    assert.equal(out.name, '@x');
  });
});

describe('export-archive-data.js routes parsed rows through the unescape helper', () => {
  // Without this guard the helper could be correct yet unused: the export script
  // must apply unescapeRow at the CSV-parse boundary, or escaped apostrophes ship
  // to the site. Pins the import and the .map(unescapeRow) on every parsed CSV.
  const src = readSrc('data/export-archive-data.js');

  it('imports the helper from data/lib/csv-unescape.js', () => {
    assert.match(src, /from '\.\/lib\/csv-unescape\.js'/);
  });

  it('applies unescapeRow to all four parsed CSV datasets', () => {
    const applications = src.match(/\.map\(unescapeRow\)/g) || [];
    assert.ok(
      applications.length >= 4,
      `expected unescapeRow applied to all 4 parsed CSVs, found ${applications.length}`,
    );
  });
});
