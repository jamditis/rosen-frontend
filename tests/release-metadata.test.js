import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createReleaseMetadataLoader,
  formatReleaseDate,
  normalizeReleaseMetadata,
} from '../frontend/services/releaseMetadata.js';

describe('footer release metadata', () => {
  it('normalizes the version and release date from version.json', () => {
    assert.deepEqual(
      normalizeReleaseMetadata({ version: ' 3.8.20 ', updated: '2026-08-11' }),
      { version: '3.8.20', updated: '2026-08-11' },
    );

    assert.equal(normalizeReleaseMetadata({ version: '3.8', updated: '2026-08-11' }), null);
    assert.equal(normalizeReleaseMetadata({ version: '3.8.20', updated: '2026-02-30' }), null);
    assert.equal(normalizeReleaseMetadata(null), null);
  });

  it('formats the ISO release date without a timezone shift', () => {
    assert.equal(formatReleaseDate('2026-08-11'), 'August 11, 2026');
    assert.equal(formatReleaseDate('not-a-date'), '');
  });

  it('shares one cache-busted version.json request across callers', async () => {
    const calls = [];
    const loadReleaseMetadata = createReleaseMetadataLoader({
      now: () => 12345,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          json: async () => ({ version: '3.8.20', updated: '2026-08-11' }),
        };
      },
    });

    const [first, second] = await Promise.all([
      loadReleaseMetadata(),
      loadReleaseMetadata(),
    ]);

    assert.deepEqual(first, { version: '3.8.20', updated: '2026-08-11' });
    assert.strictEqual(second, first);
    assert.deepEqual(calls, [{
      url: './version.json?t=12345',
      options: { cache: 'no-store' },
    }]);
  });

  it('rejects bad metadata and retries after a failed request', async () => {
    let attempts = 0;
    const loadReleaseMetadata = createReleaseMetadataLoader({
      now: () => 99,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) return { ok: false, status: 503 };
        return {
          ok: true,
          json: async () => ({ version: '3.8.20', updated: '2026-08-11' }),
        };
      },
    });

    await assert.rejects(loadReleaseMetadata(), /HTTP 503/);
    assert.deepEqual(
      await loadReleaseMetadata(),
      { version: '3.8.20', updated: '2026-08-11' },
    );
    assert.equal(attempts, 2);
  });

  it('renders semantic, unobtrusive release details in the site footer', () => {
    const app = readFileSync('frontend/App.js', 'utf8');
    const styles = readFileSync('frontend/index.css', 'utf8');
    const worker = readFileSync('frontend/sw.js', 'utf8');
    const archiveService = readFileSync('frontend/services/archiveService.js', 'utf8');

    assert.match(app, /loadReleaseMetadata\(\)/);
    assert.match(app, /releaseMetadata\s*&&\s*html`[\s\S]*Last updated/);
    assert.match(app, /<time[\s\S]*dateTime=\$\{releaseMetadata\.updated\}/);
    assert.match(app, /Version \$\{releaseMetadata\.version\}/);
    assert.match(styles, /\.archive-site-footer__release/);
    assert.match(worker, /'services\/releaseMetadata\.js'/);
    assert.match(archiveService, /loadReleaseMetadata\(\)/);
    assert.doesNotMatch(archiveService, /fetch\(['"]\.\/version\.json/);
  });

  it('shows the data date near the archive results', () => {
    const app = readFileSync('frontend/App.js', 'utf8');

    assert.match(app, /archive-results__updated/);
    assert.match(app, /Data updated[\s\S]*dateTime=\$\{releaseMetadata\.updated\}/);
  });

  it('offers to reload an open tab when a new service worker takes control', () => {
    const app = readFileSync('frontend/App.js', 'utf8');
    const index = readFileSync('index.html', 'utf8');

    assert.match(index, /controllerchange/);
    assert.match(index, /jrda:update-ready/);
    assert.match(app, /addEventListener\('jrda:update-ready'/);
    assert.match(app, /New archive data is available/);
    assert.match(app, /window\.location\.reload\(\)/);
  });
});
