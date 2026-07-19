import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { RECORDS } from '../features/winer-method/data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureDir = path.join(root, 'features', 'winer-method');
const ingestion = JSON.parse(fs.readFileSync(path.join(featureDir, 'ingestion-log.json'), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(featureDir, 'retrieval-evidence.json'), 'utf8'));
const sourceManifest = JSON.parse(fs.readFileSync(path.join(featureDir, 'source-manifest.json'), 'utf8'));

describe('Winer method ingestion evidence', () => {
  it('preserves exact page titles for sources whose editorial record titles differ', () => {
    const sourceTitles = new Map(RECORDS.map(({ id, sourceTitle }) => [id, sourceTitle]));
    assert.equal(sourceTitles.get('direct-2004-bloggers-sources'), 'Archive: August 2004');
    assert.equal(sourceTitles.get('direct-2009-tech-heroes'), 'Tech heroes who blog?');
    assert.equal(sourceTitles.get('direct-2026-community-news'), 'The reboot that news needs');
  });

  it('joins every frozen record to an actual response digest and supervised normalization mapping', () => {
    const expectedIds = RECORDS.map(({ id }) => id);
    assert.deepEqual(ingestion.records.map(({ id }) => id), expectedIds);
    assert.deepEqual(evidence.records.map(({ id }) => id), expectedIds);
    assert.equal(evidence.captureTool, ingestion.captureTool);
    assert.equal(ingestion.evidenceArtifact, 'retrieval-evidence.json');
    assert.equal(evidence.runtimeNetworkAccess, false);

    for (const item of evidence.records) {
      assert.equal(item.retrieval.httpStatus, 200, `${item.id} retrieval must have succeeded`);
      assert.ok(item.retrieval.byteLength > 0, `${item.id} retrieval must retain a byte count`);
      assert.match(item.retrieval.responseSha256, /^[a-f0-9]{64}$/, `${item.id} needs a response digest`);
      assert.match(item.normalizedRecordSha256, /^[a-f0-9]{64}$/, `${item.id} needs a normalized digest`);
      assert.ok(Date.parse(item.retrieval.capturedAt), `${item.id} needs a capture timestamp`);
      assert.ok(item.observations.sourceTitle);
      assert.ok(item.observations.dateObserved);
      assert.ok(item.observations.creatorObserved);
      assert.match(item.fieldMapping.editorialFields, /curator-authored/);
    }
  });

  it('preserves primary-source titles separately from curator-authored record titles', () => {
    const evidenceById = new Map(evidence.records.map((item) => [item.id, item]));
    const manifestById = new Map(sourceManifest.records.map((item) => [item.id, item]));
    for (const record of RECORDS) {
      const sourceTitle = evidenceById.get(record.id).observations.sourceTitle;
      assert.equal(record.sourceTitle, sourceTitle, `${record.id} data source title drifted`);
      assert.equal(manifestById.get(record.id).sourceTitle, sourceTitle, `${record.id} manifest source title drifted`);
      assert.equal(manifestById.get(record.id).recordTitle, record.title, `${record.id} curator title drifted`);
      assert.notEqual(record.sourceTitle, record.title, `${record.id} titles should have distinct roles`);
    }
  });

  it('verifies stored normalized-record digests without making network requests', () => {
    const output = execFileSync(process.execPath, [
      path.join(featureDir, 'capture-ingestion-evidence.mjs'),
      '--verify',
    ], { cwd: root, encoding: 'utf8' });
    assert.match(output, /Verified 11 stored retrieval and normalization evidence records/);
  });

  it('rejects drift in the stored supervised-normalization envelope', () => {
    const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winer-evidence-'));
    try {
      for (const filename of ['capture-ingestion-evidence.mjs', 'data.js', 'ingestion-log.json', 'retrieval-evidence.json']) {
        fs.copyFileSync(path.join(featureDir, filename), path.join(temporaryDir, filename));
      }
      const temporaryEvidencePath = path.join(temporaryDir, 'retrieval-evidence.json');
      const temporaryEvidence = JSON.parse(fs.readFileSync(temporaryEvidencePath, 'utf8'));
      temporaryEvidence.records[0].retrievalUrl = 'https://example.invalid/drifted';
      fs.writeFileSync(temporaryEvidencePath, `${JSON.stringify(temporaryEvidence, null, 2)}\n`);

      assert.throws(() => execFileSync(process.execPath, [
        path.join(temporaryDir, 'capture-ingestion-evidence.mjs'),
        '--verify',
      ], { cwd: root, encoding: 'utf8', stdio: 'pipe' }), (error) => {
        assert.match(error.stderr, /Normalization evidence field "retrievalUrl" drifted/);
        return true;
      });
    } finally {
      fs.rmSync(temporaryDir, { recursive: true, force: true });
    }
  });

  it('reproduces the downloadable manifest and SQLite database from the frozen records', () => {
    const output = execFileSync(process.execPath, [
      path.join(featureDir, 'build-data-artifacts.mjs'),
      '--verify',
    ], { cwd: root, encoding: 'utf8' });
    assert.match(output, /Verified 11 manifest and SQLite records/);
  });
});
