/**
 * Regression tests for the standalone data dashboard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlPath = path.join(__dirname, '..', 'tools', 'active', 'dataviz', 'dataviz.html');
const html = fs.readFileSync(htmlPath, 'utf-8');
// Extract the inline dashboard script (the one bare <script> block; the CDN
// includes above it all carry a src= attribute). Sliced by literal delimiters
// rather than a tag-matching regex, which CodeQL flags as fragile HTML parsing.
const scriptOpen = html.indexOf('<script>');
const scriptClose = html.lastIndexOf('</script>');
const script = scriptOpen >= 0 && scriptClose > scriptOpen
  ? html.slice(scriptOpen + '<script>'.length, scriptClose)
  : '';

describe('data dashboard visualization modes', () => {
  it('keeps the inline dashboard script parseable', () => {
    assert.doesNotThrow(() => new Function(script));
  });

  it('offers four additional visualization modes beyond overview', () => {
    for (const mode of ['decades', 'categories', 'publications', 'quality']) {
      assert.match(html, new RegExp(`<option value="${mode}"`));
    }
  });

  it('wires each alternate mode to a chart renderer', () => {
    for (const fn of ['updateDecadeHeatmap', 'updateCategoryComparison', 'updatePublicationMix', 'updateDataQualityChart']) {
      assert.match(script, new RegExp(`function ${fn}\\s*\\(`));
    }
  });
});

describe('data dashboard export and sharing tools', () => {
  it('adds JSON export and shareable filter links', () => {
    assert.match(html, /id="export-json-btn"/);
    assert.match(html, /id="copy-link-btn"/);
    assert.match(script, /function exportDataToJSON\s*\(/);
    assert.match(script, /function copyShareableLink\s*\(/);
  });

  it('projects JSON export records instead of exposing internal search text', () => {
    assert.match(script, /function getExportRecords\s*\(/);
    assert.match(script, /const fields = \['id', 'publication_date', 'title', 'original_publication', 'summary', 'key_concepts', 'thematic_categories'\]/);
    assert.doesNotMatch(script, /records:\s*state\.dashboardData/);
  });

  it('clamps restored share-link years to the available archive range', () => {
    assert.match(script, /function parseSharedYear\s*\(/);
    assert.match(script, /Math\.min\(state\.maxYear, Math\.max\(state\.minYear, year\)\)/);
    assert.match(script, /parseSharedYear\(start, state\.minYear\)/);
    assert.match(script, /parseSharedYear\(end, state\.maxYear\)/);
  });

  it('stores normalized search text for faster filtering', () => {
    assert.match(script, /searchText:/);
    assert.match(script, /r\.searchText\.includes\(searchTerm\)/);
  });

  it('schedules chart work with requestAnimationFrame', () => {
    assert.match(script, /function scheduleChartUpdate\s*\(/);
    assert.match(script, /requestAnimationFrame\s*\(/);
  });
});


describe('data dashboard reading path workflow', () => {
  it('adds controls and a panel for creating a reading path from active filters', () => {
    assert.match(html, /id="generate-reading-path-btn"/);
    assert.match(html, /id="reading-path-panel"/);
    assert.match(html, /id="export-reading-path-btn"/);
  });

  it('wires the reading path through named helpers', () => {
    for (const fn of ['generateReadingPath', 'scoreReadingPathRecord', 'renderReadingPath', 'exportReadingPathMarkdown']) {
      assert.match(script, new RegExp(`function ${fn}\\s*\\(`));
    }
  });

  it('keeps reading path exports in markdown instead of raw dashboard objects', () => {
    assert.match(script, /downloadTextFile\(`rosen_archive_reading_path_/);
    assert.match(script, /'text\/markdown;charset=utf-8;'/);
    assert.doesNotMatch(script, /JSON\.stringify\(state\.readingPath/);
  });
});

describe('data dashboard reading path export escaping', () => {
  // escapeMarkdownField is a pure helper, so pull it out of the inline script and
  // exercise its neutralization directly rather than only regex-matching the source.
  const fnMatch = script.match(/function escapeMarkdownField\([^)]*\)\s*\{[\s\S]*?\n {12}\}/);
  const escapeMarkdownField = fnMatch
    ? new Function(`${fnMatch[0]}; return escapeMarkdownField;`)()
    : null;

  it('defines the markdown field escaper', () => {
    assert.ok(escapeMarkdownField, 'escapeMarkdownField must be present in the inline script');
  });

  it('html-encodes angle brackets so a raw-html previewer cannot run embedded tags', () => {
    const out = escapeMarkdownField('<img src=x onerror=alert(1)>');
    assert.doesNotMatch(out, /[<>]/);
    assert.match(out, /&lt;img/);
    assert.match(out, /&gt;/);
  });

  it('backslash-escapes inline markdown control characters', () => {
    assert.match(escapeMarkdownField('`code`'), /\\`code\\`/);
    assert.match(escapeMarkdownField('[a](b)'), /\\\[a\\\]\(b\)/);
    assert.match(escapeMarkdownField('*bold* _em_'), /\\\*bold\\\* \\_em\\_/);
  });

  it('collapses newlines so a field cannot break the list structure', () => {
    assert.doesNotMatch(escapeMarkdownField('line1\nline2\r\nline3'), /[\r\n]/);
  });

  it('wires the escaper into every untrusted markdown export field', () => {
    for (const field of ['record.title', 'record.original_publication', 'record.id']) {
      assert.match(script, new RegExp(`escapeMarkdownField\\(${field.replace('.', '\\.')}\\)`));
    }
  });
});
