/**
 * CSV formula-injection coverage for the dataviz export (#423).
 *
 * dataviz.html is a standalone tool with inline helpers and no module system,
 * so it carries its own escapeCsvCell (it cannot import frontend/utils) and the
 * export cannot be imported into Node. Source-pattern, matching the repo's
 * convention for standalone HTML tools: pin the exact neutralization logic and
 * both wiring points so a regression that drops the prefix or reverts the
 * export to quote-only fails the test.
 *
 * Sibling of #289 (the frontend archiveService export); same bug class --
 * RFC-4180 quoting does not neutralize formula injection because a consuming
 * spreadsheet strips the quotes before evaluating the cell.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(
  path.join(__dirname, '..', 'tools', 'active', 'dataviz', 'dataviz.html'),
  'utf-8'
);

// Isolate the inline helper so the logic assertions cannot match unrelated code.
const fnMatch = html.match(/function escapeCsvCell\(value\) \{[\s\S]*?\n {12}\}/);

describe('dataviz defines escapeCsvCell with the full neutralization logic (#423)', () => {
  it('defines the inline escapeCsvCell helper', () => {
    assert.ok(fnMatch, 'dataviz.html must define an inline escapeCsvCell helper');
  });

  it('checks the leading character against every spreadsheet formula trigger', () => {
    const fn = fnMatch[0];
    // The trigger set must cover = + - @ tab CR LF, tested against str[0].
    assert.match(fn, /'=\+-@\\t\\r\\n'\.includes\(str\[0\]\)/,
      'must test the first character against the full trigger set');
  });

  it('prefixes a leading apostrophe when a trigger is present', () => {
    assert.match(fnMatch[0], /str\s*=\s*"'"\s*\+\s*str/,
      'a triggered cell must be prefixed with a leading apostrophe');
  });

  it('RFC-4180 quotes structural characters including bare CR and LF', () => {
    const fn = fnMatch[0];
    assert.match(fn, /\/\[",\\n\\r\]\/\.test\(str\)/,
      'must quote when the cell contains a quote, comma, LF, or CR');
    assert.match(fn, /str\.replace\(\/"\/g,\s*'""'\)/,
      'must double embedded quotes per RFC 4180');
  });
});

describe('dataviz exportDataToCSV is wired through escapeCsvCell (#423)', () => {
  it('routes each data cell through escapeCsvCell', () => {
    assert.match(
      html,
      /headers\.map\(header => \{[\s\S]*?return escapeCsvCell\(value\);/,
      'the export row map must return escapeCsvCell(value)'
    );
  });

  it('routes the header row through escapeCsvCell', () => {
    assert.match(html, /headers\.map\(escapeCsvCell\)\.join\(','\)/,
      'the header row must also be escaped');
  });

  it('no longer emits the unescaped always-quote template', () => {
    assert.doesNotMatch(
      html,
      /return `"\$\{String\(value/,
      'the old quote-only export (no formula neutralization) must be gone'
    );
  });
});
