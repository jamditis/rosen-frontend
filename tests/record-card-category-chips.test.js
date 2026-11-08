/**
 * Category chips on record cards filter the archive (#876).
 *
 * A card chip used to be a span inside the card's record link, so a click on
 * it opened the record and a reader could not filter by category from a card.
 * The chips now sit outside the link as buttons that call the same
 * category-filter handler the record modal uses, which writes the
 * `filters.categories` state the sidebar checkboxes read.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf-8');

const results = read('frontend/components/ArchiveResults.js');
const app = read('frontend/App.js');
const desktopPanel = read('frontend/desktop/DesktopArchivePanel.js');
const modal = read('frontend/components/RecordModal.js');
const styles = read('frontend/index.css');

// The grid-card template: from the <article> to its closing tag.
const cardTemplate = (() => {
  const start = results.indexOf('<article');
  const end = results.indexOf('</article>', start);
  assert.ok(start > 0 && end > start, 'record card template not found');
  return results.slice(start, end);
})();

// The record link inside the card: from its opening <a to the matching </a>.
const cardLink = (() => {
  const start = cardTemplate.search(/<a\s/);
  const end = cardTemplate.indexOf('</a>', start);
  assert.ok(start > 0 && end > start, 'record card link not found');
  return cardTemplate.slice(start, end);
})();

describe('record card category chips', () => {
  it('keeps every interactive element out of the record link', () => {
    assert.doesNotMatch(cardLink, /<button/);
    assert.doesNotMatch(cardLink, /archive-record-card__labels/);
    assert.match(cardLink, /archive-record-card__body/);
  });

  it('renders the label row after the link, inside the card', () => {
    const linkEnd = cardTemplate.indexOf('</a>');
    const labelsAt = cardTemplate.indexOf('archive-record-card__labels');
    assert.ok(labelsAt > linkEnd, 'labels must follow the record link');
  });

  it('makes each category chip a button that filters by its category', () => {
    assert.match(
      cardTemplate,
      /<button[\s\S]*?type="button"[\s\S]*?onClick=\$\{\(\) => onFilterCategory\(category\)\}[\s\S]*?\$\{category\}[\s\S]*?<\/button>/,
    );
    assert.match(cardTemplate, /aria-label=\$\{`Filter archive by category: \$\{category\}`\}/);
    assert.match(results, /onFilterCategory = null/);
  });

  it('falls back to a plain chip when no filter handler is wired', () => {
    assert.match(cardTemplate, /onFilterCategory\s*\?\s*html`[\s\S]*?<button/);
  });

  it('wires the standard archive card chips to the shared category filter', () => {
    assert.match(app, /<\$\{ArchiveResults\}[\s\S]*?onFilterCategory=\$\{handleFilterCategory\}[\s\S]*?\/>/);
    assert.match(app, /const handleFilterCategory = useCallback\(\(cat\) => \{\s*setFilters\(prev => \(\{ \.\.\.prev, categories: \[cat\] \}\)\)/);
  });

  it('keeps plain chips in the desktop shell', () => {
    // The shell holds every button to 44 by 44 px. Chips that tall made the
    // desktop record-modal route exceed its layout-shift budget in CI, so the
    // shell keeps the span chips until that route gets a new baseline.
    assert.doesNotMatch(desktopPanel, /onFilterCategory=/);
  });

  it('keeps the record modal category chips as filter buttons', () => {
    assert.match(modal, /<button type="button" key=\$\{tag\} onClick=\$\{\(\) => onClick\(tag\)\}>/);
    assert.match(modal, /title="Thematic categories"[\s\S]*?onFilterCategory \? \(cat\) => leaveRecordFor\(onFilterCategory, cat\)/);
  });

  it('gives the button chip the span chip box so the row does not shift', () => {
    const rule = styles.match(/\.archive-record-card__label--action\s*\{([^}]*)\}/);
    assert.ok(rule, 'button chip rule missing');
    assert.match(rule[1], /font-family:\s*inherit/);
    assert.match(rule[1], /margin:\s*0/);
    assert.match(rule[1], /cursor:\s*pointer/);
    assert.doesNotMatch(rule[1], /padding|font-size|line-height|border-width/);
    assert.match(styles, /\.archive-record-card__label--action:focus-visible/);
    // The label row keeps the body's inset after it leaves the link.
    const labels = styles.match(/\.archive-record-card__labels\s*\{([^}]*)\}/);
    assert.match(labels[1], /margin:\s*0 1\.15rem 1\.15rem/);
  });
});
