import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateOkfBundle } from '../scripts/validate-okf.js';
import { buildSeed } from '../data/build-wiki-seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const contentDir = path.join(rootDir, 'data', 'wiki-content');
const seedPath = path.join(rootDir, 'data', 'wiki-seed.json');

describe('public wiki OKF bundle', () => {
  it('passes OKF v0.1 bundle validation with no errors', () => {
    const result = validateOkfBundle({ rootDir, bundleDir: contentDir });
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
  });
});

describe('wiki seed is generated from the OKF bundle', () => {
  it('matches the committed seed exactly, so editing source without rebuilding fails CI', () => {
    // buildSeed() re-renders the OKF bundle and runs the frontend's own
    // validateWikiData; a mismatch here means data/wiki-seed.json is stale
    // relative to data/wiki-content/ (someone edited a source file without
    // running `node data/build-wiki-seed.js`).
    const generated = buildSeed();
    const committed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    assert.deepEqual(generated, committed);
  });

  it('renders the dissertation concepts, one topic page per chapter, and the thinker entities', () => {
    const seed = buildSeed();
    const concepts = seed.pages.filter(page => page.kind === 'concept');
    const entities = seed.pages.filter(page => page.kind === 'entity');
    const topics = seed.pages.filter(page => page.kind === 'topic');
    assert.equal(concepts.length, 39);
    assert.equal(topics.length, 8);
    // Jay Rosen plus the seven thinkers the dissertation engages by name.
    assert.deepEqual(entities.map(page => page.slug).sort(), [
      'entity/gabriel-tarde',
      'entity/gustave-le-bon',
      'entity/james-carey',
      'entity/jay-rosen',
      'entity/john-dewey',
      'entity/neil-postman',
      'entity/robert-park',
      'entity/walter-lippmann'
    ]);
    // Every concept links back to Rosen so the entity is reachable from any idea.
    for (const page of concepts) {
      assert.ok(
        page.relatedEntities.includes('entity/jay-rosen'),
        `${page.slug} should relate to entity/jay-rosen`
      );
    }
    // Every topic page groups at least one concept so a chapter is navigable.
    for (const page of topics) {
      assert.ok(
        page.relatedConcepts.length > 0,
        `${page.slug} should link the concepts it groups`
      );
    }
  });
});
