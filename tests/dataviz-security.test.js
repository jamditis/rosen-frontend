/**
 * Security regression tests for the standalone dataviz dashboard tool.
 *
 * Covers issue #327: tools/active/dataviz/dataviz.html interpolated Google
 * Sheet CSV values (thematic categories, publication names, record titles)
 * straight into innerHTML — the same class the #157 fix closed in the sibling
 * data_explorer_grid.html. The #403 rebuild added an escapeHtml helper and
 * routed the sinks through it, but shipped no test to lock that in, so a future
 * rebuild could silently reintroduce the raw sink (exactly how this existed
 * before #403). These assertions guard the helper and the known sinks.
 *
 * The CSV is the curator's own published sheet gated by a verified filter, so
 * exploitation needs a tampered sheet — latent, not visitor-facing, and the
 * tool is not in DEPLOYMENT.md. Same severity posture as #157.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlPath = path.join(
  __dirname, '..', 'tools', 'active', 'dataviz', 'dataviz.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

describe('dataviz — escaping helper', () => {
  it('defines an escapeHtml helper', () => {
    assert.match(html, /function escapeHtml\s*\(/,
      'escapeHtml() must be defined to neutralise HTML in CSV values');
  });

  it('escapeHtml maps the HTML-significant characters', () => {
    const start = html.indexOf('function escapeHtml');
    assert.notStrictEqual(start, -1, 'escapeHtml must be defined');
    const body = html.slice(start, start + 400);
    for (const mapped of ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;']) {
      assert.ok(body.includes(mapped),
        `escapeHtml body should map a character to ${mapped}`);
    }
  });
});

describe('dataviz — CSV-derived sinks routed through escapeHtml', () => {
  it('filter checkbox value and label are escaped', () => {
    // createCheckboxes interpolates category/publication strings into both an
    // attribute and element text; neither may be raw.
    assert.ok(!/value="\$\{\s*c\s*\}"/.test(html),
      'checkbox value must not interpolate the raw CSV string');
    assert.ok(!/<span>\$\{\s*c\s*\}<\/span>/.test(html),
      'checkbox label must not interpolate the raw CSV string');
    assert.ok(html.includes('escapeHtml(c)'),
      'checkbox category string must pass through escapeHtml');
  });

  it('data-table record fields are escaped before innerHTML', () => {
    for (const field of ['row.title', 'row.original_publication', 'row.publication_date']) {
      const raw = new RegExp(`\\$\\{\\s*${field.replace('.', '\\.')}\\s*\\}`);
      assert.ok(!raw.test(html),
        `${field} must not be interpolated raw into the table innerHTML`);
      assert.ok(html.includes(`escapeHtml(${field})`),
        `${field} must pass through escapeHtml`);
    }
  });

  it('the data-load error message is escaped', () => {
    assert.ok(html.includes('escapeHtml(err.message)'),
      'the failure message must pass through escapeHtml before innerHTML');
  });
});
