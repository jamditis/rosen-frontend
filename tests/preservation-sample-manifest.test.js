import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { convertPreservationSample } from '../preservation/import-preservation-sample.mjs';
import { validatePreservationManifest } from '../preservation/validate-preservation-manifests.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(root, 'preservation', 'import-preservation-sample.mjs');
const samplePath = path.join(root, 'data', 'preservation-sample.json');
const createdAt = '2026-08-27T00:00:00.000Z';

const withUrlSample = {
  sources: [
    { id: 'RECORD-90001', objectType: 'archive-record', url: 'https://pressthink.org/example' },
  ],
};

const missingUrlSample = {
  sources: [
    { id: 'BSKY-90002', objectType: 'social-post', url: null },
  ],
};

const mixedSample = {
  sources: [
    { id: 'RECORD-90001', objectType: 'archive-record', url: 'https://pressthink.org/example' },
    { id: 'BSKY-90002', objectType: 'social-post', url: null },
    { id: 'TWTR-90003', objectType: 'social-post', url: 'https://x.com/jayrosen_nyu/status/1' },
  ],
};

describe('preservation sample manifest compatibility (#857)', () => {
  it('maps a source with a url to a urn objectId and a passthrough canonicalSourceUrl', () => {
    const { manifest, stats } = convertPreservationSample(withUrlSample, { createdAt });
    assert.equal(validatePreservationManifest(manifest), manifest);
    assert.equal(stats.total, 1);
    assert.equal(stats.missingUrlCount, 0);

    const [object] = manifest.objects;
    assert.equal(object.objectId, 'urn:rosen:object:archive-record:RECORD-90001');
    assert.equal(object.objectType, 'archive-record');
    assert.equal(object.canonicalSourceUrl, 'https://pressthink.org/example');
    assert.equal(object.sourceRecordId, 'RECORD-90001');
    assert.deepEqual(manifest.events, []);
    assert.deepEqual(manifest.artifacts, []);
  });

  it('gives a null-url social-post source the explicit missing-url state instead of a fabricated URL', () => {
    const { manifest, stats } = convertPreservationSample(missingUrlSample, { createdAt });
    assert.equal(validatePreservationManifest(manifest), manifest);
    assert.equal(stats.missingUrlCount, 1);

    const [object] = manifest.objects;
    assert.equal(object.objectId, 'urn:rosen:object:social-post:BSKY-90002');
    assert.equal(object.canonicalSourceUrl, 'urn:rosen:social-source:missing-url:BSKY-90002');
  });

  it('rejects a null-url source with no established missing-source-url convention for its type', () => {
    const badSample = {
      sources: [{ id: 'RECORD-90004', objectType: 'archive-record', url: null }],
    };
    assert.throws(
      () => convertPreservationSample(badSample, { createdAt }),
      /no missing-source-url convention exists for objectType archive-record/,
    );
  });

  it('keeps unique object IDs across a mixed fixture and counts missing-url sources correctly', () => {
    const { manifest, stats } = convertPreservationSample(mixedSample, { createdAt });
    assert.equal(validatePreservationManifest(manifest), manifest);
    assert.equal(stats.total, 3);
    assert.equal(stats.missingUrlCount, 1);
    assert.equal(new Set(manifest.objects.map(o => o.objectId)).size, 3);
  });

  it('rejects a sample with no sources array', () => {
    assert.throws(
      () => convertPreservationSample({ sources: [] }, { createdAt }),
      /non-empty sources array/,
    );
    assert.throws(
      () => convertPreservationSample({}, { createdAt }),
      /non-empty sources array/,
    );
  });

  it('rejects a source missing its id', () => {
    assert.throws(
      () => convertPreservationSample({ sources: [{ objectType: 'archive-record', url: 'https://x' }] }, { createdAt }),
      /source\.id is required/,
    );
  });

  it('converts the real data/preservation-sample.json end to end, with exactly the 7 documented missing-url sources', () => {
    const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
    const { manifest, stats } = convertPreservationSample(sample, { createdAt });
    assert.equal(validatePreservationManifest(manifest), manifest);
    assert.equal(stats.total, sample.sources.length);
    assert.equal(stats.missingUrlCount, 7);

    const missingUrlObjects = manifest.objects.filter(o => o.canonicalSourceUrl.startsWith('urn:rosen:social-source:missing-url:'));
    assert.equal(missingUrlObjects.length, 7);
    for (const object of missingUrlObjects) {
      assert.equal(object.objectType, 'social-post');
    }
    assert.equal(new Set(manifest.objects.map(o => o.objectId)).size, sample.sources.length);
  });

  it('runs the CLI --verify check against the real sample file and reports counts', () => {
    const verifyOutput = execFileSync(process.execPath, [scriptPath, '--verify'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.match(verifyOutput, /Verified 100 preservation sample sources \(7 marked missing-url\)/);

    const jsonOutput = execFileSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: 'utf8',
    });
    const manifest = JSON.parse(jsonOutput);
    assert.equal(validatePreservationManifest(manifest), manifest);
    assert.equal(manifest.objects.length, 100);
  });

  it('fails loudly instead of silently on a malformed sample file', () => {
    assert.throws(() => execFileSync(process.execPath, [scriptPath, path.join(root, 'package.json')], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    }), (error) => {
      assert.match(error.stderr, /Preservation sample import failed:.*non-empty sources array/);
      return true;
    });
  });
});
