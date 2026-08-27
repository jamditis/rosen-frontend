import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

import {
  convertSocialBaselineCsv,
  convertSocialBaselineRows,
} from '../preservation/import-social-baseline.mjs';
import { validatePreservationManifest } from '../preservation/validate-preservation-manifests.mjs';
import { unescapeRow } from '../data/lib/csv-unescape.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(root, 'preservation', 'import-social-baseline.mjs');
const socialPostsPath = path.join(root, 'data', 'social_posts.csv');
const importedAt = '2026-08-27T00:00:00.000Z';

// A hand-built fixture, not a slice of the real CSV, so each behavior below is
// exercised by exactly one deliberate row.
const verifiedRow = {
  id: 'BSKY-90001',
  title: 'Reply by Jay Rosen',
  url: 'https://bsky.app/profile/jayrosen.bsky.social/post/test1',
  author: 'Jay Rosen',
  publication_date: '2026-01-01 12:00:00',
  platform: 'Bluesky',
  word_count: '3',
  likes: '2',
  reposts: '0',
  replies: '1',
  related_to: '',
  responds_to: 'at://did:plc:example/app.bsky.feed.post/parent',
  copyright: 'Jay Rosen',
  permissions: 'Public Post',
  license: '',
  verified: 'TRUE',
  date_processed: '2026-01-02 09:30:00',
  excerpt: 'Yes, exactly.',
  raw_text: 'Yes, exactly.',
  pull_quote: 'Yes, exactly.',
  notes: 'Primary source checked 2026-01-02.',
};

const unverifiedRow = {
  ...verifiedRow,
  id: 'TWTR-90002',
  title: 'Thanks, John',
  url: 'https://x.com/jayrosen_nyu/status/900002',
  platform: 'Twitter/X',
  responds_to: '',
  verified: 'FALSE',
  excerpt: 'Thanks, John.',
  raw_text: 'Thanks, John.',
  pull_quote: '',
  notes: '',
};

const missingUrlRow = {
  ...verifiedRow,
  id: 'BSKY-90003',
  title: 'Quote by Someone Else',
  url: '',
  author: 'Someone Else',
  responds_to: '',
  copyright: '',
  verified: 'FALSE',
  excerpt: 'Some content preserved without a resolvable source link.',
  raw_text: 'Some content preserved without a resolvable source link.',
  pull_quote: '',
  notes: 'Source URL cleanup 2026-07-23: removed false jayrosen.bsky.social post URL; '
    + 'original author URL unresolved.',
};

const imageOnlyRow = {
  ...verifiedRow,
  id: 'BSKY-90004',
  title: 'Reply by Jay Rosen',
  url: 'https://bsky.app/profile/jayrosen.bsky.social/post/test4',
  word_count: '0',
  responds_to: 'at://did:plc:example/app.bsky.feed.post/parent2',
  excerpt: '',
  raw_text: '',
  pull_quote: '',
  notes: 'Source has no text; image-only post verified via the public Bluesky API.',
};

const fixtureRows = [verifiedRow, unverifiedRow, missingUrlRow, imageOnlyRow];

function convertOne(row) {
  return convertSocialBaselineRows([row], { importedAt });
}

describe('social baseline preservation (#717)', () => {
  it('packages a verified row into an accepted capture-attempt with a preserved-text artifact', () => {
    const { manifest } = convertOne(verifiedRow);
    assert.equal(validatePreservationManifest(manifest), manifest);

    const [object] = manifest.objects;
    const [event] = manifest.events;
    const [artifact] = manifest.artifacts;

    assert.equal(object.objectId, 'urn:rosen:object:social-post:BSKY-90001');
    assert.equal(object.objectType, 'social-post');
    assert.equal(object.canonicalSourceUrl, verifiedRow.url);
    assert.equal(object.sourceRecordId, 'BSKY-90001');

    assert.equal(event.eventType, 'capture-attempt');
    assert.equal(event.review.state, 'accepted');
    assert.equal(event.retrieval.httpOutcome, 'not-requested');
    assert.equal(event.retrieval.semanticOutcome, 'uncertain');
    assert.equal(event.retrieval.requestedUrl, verifiedRow.url);
    assert.equal(event.artifactId, artifact.artifactId);
    assert.equal(event.normalizationEvidence.observations.preservedText, verifiedRow.raw_text);
    assert.equal(event.normalizationEvidence.observations.preservedTextSource, 'raw_text');
    assert.equal(event.normalizationEvidence.observations.respondsTo, verifiedRow.responds_to);
    assert.equal(event.normalizationEvidence.runtimeNetworkAccess, false);

    assert.equal(artifact.artifactType, 'metadata');
    assert.equal(artifact.captureEventId, event.eventId);
    assert.equal(artifact.uri, `urn:sha256:${artifact.sha256}`);
    assert.deepEqual(artifact.storageCopies, []);
  });

  it('marks an unverified row review-required instead of inventing acceptance', () => {
    const { manifest } = convertOne(unverifiedRow);
    assert.equal(validatePreservationManifest(manifest), manifest);
    assert.equal(manifest.events[0].review.state, 'review-required');
    assert.equal(
      manifest.events[0].review.notes,
      'Baseline import of the existing verified CSV row; no new capture was performed.',
    );
  });

  it('documents a missing canonical source URL instead of fabricating one', () => {
    const { manifest, stats } = convertOne(missingUrlRow);
    assert.equal(validatePreservationManifest(manifest), manifest);
    assert.equal(stats.missingUrlCount, 1);

    const [object] = manifest.objects;
    const [event] = manifest.events;
    assert.equal(object.canonicalSourceUrl, 'urn:rosen:social-source:missing-url:BSKY-90003');
    assert.equal(event.eventType, 'artifact-created');
    assert.equal(event.review.state, 'review-required');
    assert.match(event.review.notes, /Source URL cleanup/);
    assert.equal(event.retrieval, undefined, 'artifact-created events cannot carry a retrieval payload');
    assert.equal(event.normalizationEvidence, undefined, 'artifact-created events cannot carry normalizationEvidence');
  });

  it('preserves an image-only post with no text as a normal capture, not a missing state', () => {
    const { manifest, stats } = convertOne(imageOnlyRow);
    assert.equal(validatePreservationManifest(manifest), manifest);
    assert.equal(stats.missingUrlCount, 0);

    const [object] = manifest.objects;
    const [event] = manifest.events;
    assert.equal(object.canonicalSourceUrl, imageOnlyRow.url);
    assert.equal(event.eventType, 'capture-attempt');
    assert.equal(event.normalizationEvidence.observations.preservedText, '');
    assert.equal(event.normalizationEvidence.observations.preservedTextSource, 'none');
  });

  it('keeps every object, event, and artifact ID unique across a mixed fixture set', () => {
    const { manifest, stats } = convertSocialBaselineRows(fixtureRows, { importedAt });
    assert.equal(validatePreservationManifest(manifest), manifest);
    assert.equal(stats.total, fixtureRows.length);
    assert.equal(stats.missingUrlCount, 1);
    assert.equal(new Set(manifest.objects.map(o => o.objectId)).size, fixtureRows.length);
    assert.equal(new Set(manifest.events.map(e => e.eventId)).size, fixtureRows.length);
    assert.equal(new Set(manifest.artifacts.map(a => a.artifactId)).size, fixtureRows.length);
  });

  it('round-trips through the CSV reader the same as converting rows directly', () => {
    const csvText = stringify(fixtureRows, { header: true, columns: Object.keys(verifiedRow) });
    const fromCsv = convertSocialBaselineCsv(csvText, { importedAt });
    const fromRows = convertSocialBaselineRows(
      parse(csvText, { columns: true, skip_empty_lines: true }).map(unescapeRow),
      { importedAt },
    );
    assert.deepEqual(fromCsv.manifest, fromRows.manifest);
    assert.equal(validatePreservationManifest(fromCsv.manifest), fromCsv.manifest);
  });

  it('rejects a row missing its stable id', () => {
    assert.throws(
      () => convertSocialBaselineRows([{ ...verifiedRow, id: '' }], { importedAt }),
      /is missing id/,
    );
  });

  it('rejects an empty row set instead of emitting an empty manifest', () => {
    assert.throws(
      () => convertSocialBaselineRows([], { importedAt }),
      /at least one row/,
    );
  });

  it('runs the CLI --verify check against a small fixture file and reports counts', () => {
    const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-baseline-'));
    try {
      const csvPath = path.join(temporaryDir, 'fixture.csv');
      fs.writeFileSync(csvPath, stringify(fixtureRows, { header: true, columns: Object.keys(verifiedRow) }));

      const verifyOutput = execFileSync(process.execPath, [scriptPath, csvPath, '--verify'], {
        cwd: root,
        encoding: 'utf8',
      });
      assert.match(verifyOutput, /Verified 4 social baseline rows \(1 marked missing-url\)/);

      const jsonOutput = execFileSync(process.execPath, [scriptPath, csvPath], {
        cwd: root,
        encoding: 'utf8',
      });
      const manifest = JSON.parse(jsonOutput);
      assert.equal(validatePreservationManifest(manifest), manifest);
      assert.equal(manifest.objects.length, 4);
    } finally {
      fs.rmSync(temporaryDir, { recursive: true, force: true });
    }
  });

  it('fails loudly on a row with no id instead of silently dropping it', () => {
    const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-baseline-bad-'));
    try {
      const csvPath = path.join(temporaryDir, 'broken.csv');
      fs.writeFileSync(csvPath, stringify(
        [{ ...verifiedRow, id: '' }],
        { header: true, columns: Object.keys(verifiedRow) },
      ));

      assert.throws(() => execFileSync(process.execPath, [scriptPath, csvPath, '--verify'], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      }), (error) => {
        assert.match(error.stderr, /Social baseline import failed:.*is missing id/);
        return true;
      });
    } finally {
      fs.rmSync(temporaryDir, { recursive: true, force: true });
    }
  });

  it('validates a real, edge-case-bearing prefix of data/social_posts.csv end to end', () => {
    const csvText = fs.readFileSync(socialPostsPath, 'utf8');
    const allRows = parse(csvText, { columns: true, skip_empty_lines: true }).map(unescapeRow);
    const slice = allRows.slice(0, 2000);
    const expectedMissingUrl = slice.filter(row => !row.url).length;
    assert.ok(expectedMissingUrl > 0, 'the real prefix should already exercise the missing-url branch');

    const { manifest, stats } = convertSocialBaselineRows(slice, { importedAt });
    assert.equal(validatePreservationManifest(manifest), manifest);
    assert.equal(stats.total, slice.length);
    assert.equal(stats.missingUrlCount, expectedMissingUrl);
  });

  it('keeps stable, unique IDs across the complete real social_posts.csv corpus', () => {
    const csvText = fs.readFileSync(socialPostsPath, 'utf8');
    const allRows = parse(csvText, { columns: true, skip_empty_lines: true }).map(unescapeRow);
    const expectedMissingUrl = allRows.filter(row => !row.url).length;

    const { manifest, stats } = convertSocialBaselineRows(allRows, { importedAt });
    assert.equal(manifest.objects.length, allRows.length);
    assert.equal(manifest.events.length, allRows.length);
    assert.equal(manifest.artifacts.length, allRows.length);
    assert.equal(new Set(manifest.objects.map(o => o.objectId)).size, allRows.length);
    assert.equal(new Set(manifest.events.map(e => e.eventId)).size, allRows.length);
    assert.equal(new Set(manifest.artifacts.map(a => a.artifactId)).size, allRows.length);
    assert.equal(stats.missingUrlCount, expectedMissingUrl);

    const artifactIdsByObject = new Map(manifest.artifacts.map(a => [a.objectId, a.artifactId]));
    for (const object of manifest.objects) {
      assert.ok(artifactIdsByObject.has(object.objectId), `${object.objectId} is missing its preserved artifact`);
    }
  });

  it('rejects converting rows that are not an array', () => {
    assert.throws(
      () => convertSocialBaselineRows(null, { importedAt }),
      /at least one row/,
    );
  });
});
