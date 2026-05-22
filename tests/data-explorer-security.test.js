/**
 * Security regression tests for the standalone data explorer tool.
 *
 * Covers issue #157: tools/active/dataexplorer/data_explorer_grid.html
 * interpolated CSV-derived values (title, id, summary, tags, etc.) straight
 * into innerHTML, placed an unvalidated record URL into an href, and built
 * target="_blank" anchors with no rel="noopener". The CSV is curator-
 * controlled today, so these are latent rather than active — but a single
 * malicious scraped field would execute.
 *
 * These tests assert the two escaping helpers exist and that the known
 * injection sinks now route through them.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlPath = path.join(
  __dirname, '..', 'tools', 'active', 'dataexplorer', 'data_explorer_grid.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

describe('data explorer — escaping helpers', () => {
  it('defines an escapeHtml helper', () => {
    assert.match(html, /function escapeHtml\s*\(/,
      'escapeHtml() must be defined to neutralise HTML in CSV values');
  });

  it('escapeHtml maps the HTML-significant characters', () => {
    const start = html.indexOf('function escapeHtml');
    assert.notStrictEqual(start, -1, 'escapeHtml must be defined');
    const body = html.slice(start, start + 600);
    for (const mapped of ['&amp;', '&lt;', '&gt;', '&quot;']) {
      assert.ok(body.includes(mapped),
        `escapeHtml body should map a character to ${mapped}`);
    }
  });

  it('defines a sanitizeUrl helper', () => {
    assert.match(html, /function sanitizeUrl\s*\(/,
      'sanitizeUrl() must be defined to validate record URLs');
  });

  it('sanitizeUrl whitelists only the http and https schemes', () => {
    const start = html.indexOf('function sanitizeUrl');
    assert.notStrictEqual(start, -1, 'sanitizeUrl must be defined');
    const body = html.slice(start, start + 600);
    assert.ok(/['"]http:['"]/.test(body) && /['"]https:['"]/.test(body),
      'sanitizeUrl must whitelist http: and https:');
  });
});

describe('data explorer — injection sinks routed through helpers', () => {
  it('record title is escaped before innerHTML', () => {
    assert.ok(!/\$\{\s*fullTitle\s*\}/.test(html),
      'fullTitle must not be interpolated raw into innerHTML');
    assert.ok(html.includes('escapeHtml(fullTitle)'),
      'fullTitle must pass through escapeHtml');
  });

  it('connected-record title is escaped before innerHTML', () => {
    assert.ok(!/\$\{\s*cr\.title\s*\}/.test(html),
      'cr.title must not be interpolated raw into innerHTML');
    assert.ok(html.includes('escapeHtml(cr.title)'),
      'cr.title must pass through escapeHtml');
  });

  it('record summary is escaped before innerHTML', () => {
    assert.ok(html.includes('escapeHtml(record.summary'),
      'record.summary must pass through escapeHtml');
  });

  it('connected-record href is sanitised, not interpolated raw', () => {
    assert.ok(!/href="\$\{\s*cr\.url\s*\}"/.test(html),
      'cr.url must not be placed in an href raw');
    assert.ok(/sanitizeUrl\(cr\.url\)/.test(html),
      'cr.url must pass through sanitizeUrl before reaching href');
  });

  it('view-source button href is sanitised', () => {
    assert.ok(/sanitizeUrl\(record\.url\)/.test(html),
      'viewSourceButton href must pass through sanitizeUrl');
  });
});

describe('data explorer — tabnabbing protection', () => {
  it('every target="_blank" anchor carries rel="noopener noreferrer"', () => {
    const blankCount = (html.match(/target="_blank"/g) || []).length;
    const relCount = (html.match(/rel="noopener noreferrer"/g) || []).length;
    assert.ok(blankCount > 0, 'expected target="_blank" anchors to exist');
    assert.strictEqual(relCount, blankCount,
      `every target="_blank" (${blankCount}) needs rel="noopener noreferrer" ` +
      `(found ${relCount})`);
  });
});
