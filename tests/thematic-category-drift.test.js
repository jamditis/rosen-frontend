import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Issue #856: self-service category editing (#524, ADDING-RECORDS.md,
// PR #852) lets a curator add a thematic category by hand, but nothing
// stopped two near-duplicate names from both landing in the list -- the
// same drift class backend/scripts/analyze_taxonomy.py already flags for
// tags ("nyt" vs "new york times", case variants) and eras. This test is
// the same check, aimed at backend/schema.json's taxonomy.thematic_categories,
// so drift is caught here instead of live on the site.
//
// It runs as a plain Node test (not a Python script) so it executes inside
// `npm test` with no backend environment required.
//
// Four checks, each mirroring a way analyze_taxonomy.py treats two names as
// "the same concept, different spelling":
//   1. case-insensitive collision      ("Local News" vs "local news")
//   2. an "&" / "and" swap             ("Press & Media" vs "Press and Media")
//   3. a singular/plural swap          ("Politics" vs "Politic")
//   4. very similar spelling           (a short edit away, e.g. a typo)

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'backend/schema.json'), 'utf8'),
);

/** Collapse whitespace and lowercase. The baseline every other check builds on. */
function normalizeCase(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Case-insensitive, with "&" and "and" treated as the same word. */
function normalizeAmpersand(name) {
  return normalizeCase(name)
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Naive English singularizer: drop one trailing "s" unless the word ends "ss". */
function singularizeWord(word) {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

/** Case- and ampersand-insensitive, plus each word singularized. */
function normalizeSingular(name) {
  return normalizeAmpersand(name).split(' ').map(singularizeWord).join(' ');
}

function bigrams(s) {
  const grams = new Set();
  for (let i = 0; i < s.length - 1; i += 1) grams.add(s.slice(i, i + 2));
  return grams;
}

/** Dice coefficient over character bigrams of the ampersand-normalized names, 0..1. */
function spellingSimilarity(a, b) {
  const setA = bigrams(normalizeAmpersand(a));
  const setB = bigrams(normalizeAmpersand(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const gram of setA) {
    if (setB.has(gram)) shared += 1;
  }
  return (2 * shared) / (setA.size + setB.size);
}

// Kept conservative on purpose: the six live categories' closest pair sits at
// ~0.46 (Journalism Theory & Practice / Journalism Education, which share the
// word "Journalism"), and a one-letter-dropped typo sits at ~0.92. 0.72 sits
// in the wide gap between real distinct categories and real drift, with
// margin either way.
const SIMILARITY_THRESHOLD = 0.72;

/**
 * Compare every pair of names and report near-duplicates. Mirrors
 * analyze_taxonomy.py's intent (flag two names that are probably the same
 * concept), not its code -- that script's checks are for tags and eras, not
 * thematic categories, and it never runs generic spelling similarity.
 *
 * Returns one entry per colliding pair: { a, b, reason }.
 */
function findNearDuplicates(names) {
  const findings = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = names[i];
      const b = names[j];
      if (a === b) {
        findings.push({ a, b, reason: 'identical name listed twice' });
        continue;
      }
      if (normalizeCase(a) === normalizeCase(b)) {
        findings.push({ a, b, reason: 'differs only by case' });
      } else if (normalizeAmpersand(a) === normalizeAmpersand(b)) {
        findings.push({ a, b, reason: 'differs only by "&" vs "and"' });
      } else if (normalizeSingular(a) === normalizeSingular(b)) {
        findings.push({ a, b, reason: 'differs only by singular/plural' });
      } else {
        const similarity = spellingSimilarity(a, b);
        if (similarity >= SIMILARITY_THRESHOLD) {
          findings.push({
            a,
            b,
            reason: `spelling is ${(similarity * 100).toFixed(0)}% similar`,
          });
        }
      }
    }
  }
  return findings;
}

function categoryNames(entries) {
  return entries.map((entry) => (typeof entry === 'string' ? entry : entry.name));
}

describe('thematic-category near-duplicate lint (issue #856)', () => {
  it('backend/schema.json has a non-empty taxonomy.thematic_categories list', () => {
    const categories = schema?.taxonomy?.thematic_categories;
    assert.ok(Array.isArray(categories) && categories.length > 0);
  });

  it('has no near-duplicate thematic-category names today', () => {
    const names = categoryNames(schema.taxonomy.thematic_categories);
    const findings = findNearDuplicates(names);
    assert.deepEqual(
      findings,
      [],
      `Near-duplicate thematic categories in backend/schema.json:\n` +
        findings.map((f) => `  "${f.a}" / "${f.b}" -- ${f.reason}`).join('\n'),
    );
  });
});

describe('findNearDuplicates catches the drift classes analyze_taxonomy.py flags', () => {
  it('flags a pure case variant', () => {
    const findings = findNearDuplicates(['Local news', 'local News']);
    assert.equal(findings.length, 1);
    assert.match(findings[0].reason, /case/);
  });

  it('flags an "&" vs "and" variant', () => {
    const findings = findNearDuplicates(['Politics & Democracy', 'Politics and Democracy']);
    assert.equal(findings.length, 1);
    assert.match(findings[0].reason, /"&" vs "and"/);
  });

  it('flags a singular/plural variant', () => {
    const findings = findNearDuplicates(['Journalism Education', 'Journalism Educations']);
    assert.equal(findings.length, 1);
    assert.match(findings[0].reason, /singular\/plural/);
  });

  it('flags a near-miss typo as a high-similarity pair', () => {
    const findings = findNearDuplicates(['Journalism Education', 'Journalism Eduction']);
    assert.equal(findings.length, 1);
    assert.match(findings[0].reason, /similar/);
  });

  it('flags the exact same name listed twice', () => {
    const findings = findNearDuplicates(['Politics & Democracy', 'Politics & Democracy']);
    assert.equal(findings.length, 1);
    assert.match(findings[0].reason, /listed twice/);
  });

  it('does not flag genuinely different categories', () => {
    const findings = findNearDuplicates([
      'Press & Media Criticism',
      'Journalism Theory & Practice',
      'Journalism Education',
      'Politics & Democracy',
      'Technology & Digital Media',
      'Audience & Public Engagement',
    ]);
    assert.deepEqual(findings, []);
  });
});
