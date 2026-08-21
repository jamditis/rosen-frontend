import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'version.json'), 'utf8')).version;
const recordModal = fs.readFileSync(
  path.join(repoRoot, 'frontend', 'components', 'RecordModal.js'),
  'utf8',
);
const semanticClient = fs.readFileSync(
  path.join(repoRoot, 'frontend', 'services', 'semanticRecall.js'),
  'utf8',
);
const worker = fs.readFileSync(
  path.join(repoRoot, 'frontend', 'services', 'embeddings-worker.js'),
  'utf8',
);
const serviceWorker = fs.readFileSync(
  path.join(repoRoot, 'frontend', 'sw.js'),
  'utf8',
);

describe('similar-in-theme record strand', () => {
  it('loads semantic neighbors lazily through the dedicated worker client', () => {
    assert.match(
      recordModal,
      new RegExp(`semanticRecall\\.js\\?v=${version.replaceAll('.', '\\.')}`),
    );
    assert.match(recordModal, /requestSemanticNeighbors\(record\.id, allRecords/);
    assert.match(semanticClient, /new Worker\(DEFAULT_WORKER_URL/);
    assert.match(semanticClient, /type: 'module'/);
  });

  it('does not load the artifact for social or other non-embedded record types', () => {
    assert.match(recordModal, /record\?\.type !== 'article'/);
  });

  it('renders a sem-only details strand after entity-related records', () => {
    const relatedIndex = recordModal.indexOf('archive-record-related');
    const semanticIndex = recordModal.indexOf('archive-record-semantic');
    assert.ok(relatedIndex >= 0 && semanticIndex > relatedIndex);
    assert.match(
      recordModal,
      /<details key=\$\{record\.id\} className="archive-record-semantic">/,
    );
    assert.match(recordModal, /Similar in theme/);
    assert.match(recordModal, /archive-record-semantic__signal">sem</);
  });

  it('distinguishes loading, errors, matches, and a genuinely empty result', () => {
    assert.match(recordModal, /setSemanticStatus\('loading'\)/);
    assert.match(recordModal, /setSemanticStatus\(matches\.length > 0 \? 'ready' : 'empty'\)/);
    assert.match(recordModal, /setSemanticStatus\('error'\)/);
    assert.match(recordModal, /semanticStatus !== 'empty'/);
    assert.match(recordModal, /Retry thematic matches/);
  });

  it('versions the worker and artifacts and caches binary vectors after first use', () => {
    const escapedVersion = version.replaceAll('.', '\\.');
    assert.match(worker, new RegExp(`archive-embeddings\\.bin\\?v=${escapedVersion}`));
    assert.match(worker, new RegExp(`archive-embeddings\\.json\\?v=${escapedVersion}`));
    assert.match(serviceWorker, /'services\/semanticRecall\.js'/);
    assert.match(serviceWorker, /pathname\.endsWith\('\.bin'\)/);
  });
});
