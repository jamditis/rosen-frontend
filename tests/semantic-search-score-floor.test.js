/**
 * The semantic score floor, measured against the real archive vectors (#279).
 *
 * DEFAULT_MIN_SCORE decides what a query with no true match returns. Asserting
 * only that it sits between 0 and 1 proves nothing: bge-small has a compressed
 * similarity range, so a floor that is too low would hand back 25 arbitrary
 * records for "how to bake sourdough bread" and call them semantic matches.
 *
 * So this runs the shipped ranking over both committed artifacts using query
 * vectors from the shipped model, and
 * checks the property the floor exists for: off-topic queries come back empty,
 * on-topic queries do not. The vectors are committed in
 * tests/fixtures/semantic-query-vectors.json because CI must not download a
 * 30 MB model; that file records how to regenerate them.
 *
 * The assertions below keep the measured corpus-wide gap honest as the archive
 * grows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_MIN_SCORE,
  DEFAULT_QUERY_K,
  DEFAULT_SOCIAL_MIN_SCORE,
  QUERY_MODEL_ID,
  QUERY_PREFIX,
  rankQuery,
  rankSemanticStores,
} from '../frontend/services/semantic-search-worker.js';
import { buildEmbeddingStore } from '../frontend/services/embeddings-worker.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (...parts) =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, ...parts), 'utf8'));

const fixture = readJson('tests', 'fixtures', 'semantic-query-vectors.json');
const loadStore = stem => {
  const binary = fs.readFileSync(path.join(repoRoot, 'data', `${stem}.bin`));
  return buildEmbeddingStore(
    binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength),
    readJson('data', `${stem}.json`),
  );
};
const stores = {
  curated: loadStore('archive-embeddings'),
  social: loadStore('archive-social-embeddings'),
};

const queriesOfKind = kind => fixture.queries.filter(query => query.kind === kind);
const vectorFor = query => Float32Array.from(query.vector);
/** Best cosine anywhere in the corpus, floor removed, for a margin check. */
const bestScores = query => ({
  curated: rankQuery(stores.curated, vectorFor(query), { k: 1, minScore: -1 })[0].score,
  social: rankQuery(stores.social, vectorFor(query), { k: 1, minScore: -1 })[0].score,
});

test('the fixture was encoded by the model and prefix the worker uses', () => {
  assert.equal(fixture.model, QUERY_MODEL_ID);
  assert.equal(fixture.prefix, QUERY_PREFIX);
  assert.ok(fixture.queries.length >= 3, 'fixture must cover both outcomes');
});

test('a query with no match in the archive returns nothing', () => {
  for (const query of [...queriesOfKind('off-topic'), ...queriesOfKind('nonsense')]) {
    const matches = rankSemanticStores(stores, vectorFor(query));
    assert.deepEqual(
      matches,
      [],
      `"${query.text}" must not return topic-blob noise, got ${matches.length} matches`,
    );
  }
});

test('the floor clears the best off-topic score by a margin', () => {
  // Not a knife edge: the highest cosine any off-topic query reaches must stay
  // well under the floor, so ordinary corpus drift cannot start admitting them.
  for (const query of [...queriesOfKind('off-topic'), ...queriesOfKind('nonsense')]) {
    const best = bestScores(query);
    assert.ok(
      best.curated < DEFAULT_MIN_SCORE - 0.05,
      `"${query.text}" scores ${best.curated.toFixed(3)} in edited records, too close to the ${DEFAULT_MIN_SCORE} floor`,
    );
    assert.ok(
      best.social < DEFAULT_SOCIAL_MIN_SCORE - 0.04,
      `"${query.text}" scores ${best.social.toFixed(3)} in social records, too close to the ${DEFAULT_SOCIAL_MIN_SCORE} floor`,
    );
  }
});

test('a real question still returns matches above the floor', () => {
  for (const query of queriesOfKind('on-topic')) {
    const matches = rankSemanticStores(stores, vectorFor(query));
    assert.ok(matches.length > 0, `"${query.text}" returned nothing`);
    assert.ok(matches.length <= DEFAULT_QUERY_K, 'k must bound the result set');
    for (const match of matches) assert.ok(match.score >= DEFAULT_MIN_SCORE);
    // Ranked, best first.
    const scores = matches.map(match => match.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
    assert.ok(
      stores.curated.position.has(matches[0].id) || stores.social.position.has(matches[0].id),
      'matches must name real records',
    );
  }
});

test('k, not the floor, bounds a broad query', () => {
  // A broad question is similar to a large slice of a single-author archive, so
  // the floor alone would return hundreds. k is what keeps one query cheap.
  const broad = queriesOfKind('on-topic')[0];
  const aboveFloor = rankQuery(stores.curated, vectorFor(broad), {
    k: stores.curated.ids.length,
    minScore: DEFAULT_MIN_SCORE,
  });
  assert.ok(
    aboveFloor.length > DEFAULT_QUERY_K,
    'expected a broad query to clear the floor more often than k allows',
  );
  assert.equal(rankSemanticStores(stores, vectorFor(broad)).length, DEFAULT_QUERY_K);
});
