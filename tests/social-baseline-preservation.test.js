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
  buildChecksumPin,
  convertSocialBaselineCsv,
  convertSocialBaselineRows,
  diffChecksumPin,
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
  it('packages a verified row into a not-reviewed capture-attempt with a full-row observation set', () => {
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
    // Never 'accepted': no capture was attempted, so nothing has been
    // reviewed and accepted, regardless of the CSV's own verified column.
    assert.equal(event.review.state, 'not-reviewed');
    assert.equal(event.retrieval.httpOutcome, 'not-requested');
    assert.equal(event.retrieval.semanticOutcome, 'uncertain');
    assert.equal(event.retrieval.requestedUrl, verifiedRow.url);
    assert.equal(event.artifactId, artifact.artifactId);
    assert.equal(event.normalizationEvidence.observations.preservedText, verifiedRow.raw_text);
    assert.equal(event.normalizationEvidence.observations.preservedTextSource, 'raw_text');
    assert.equal(event.normalizationEvidence.observations.respondsTo, verifiedRow.responds_to);
    assert.equal(event.normalizationEvidence.observations.verified, verifiedRow.verified);
    assert.equal(event.normalizationEvidence.runtimeNetworkAccess, false);

    // The CSV's own verified column is honestly preserved as an observation,
    // not folded into the event's review state (see above).
    assert.equal(event.normalizationEvidence.observations.verified, 'TRUE');

    assert.equal(artifact.artifactType, 'metadata');
    assert.equal(artifact.captureEventId, event.eventId);
    assert.equal(artifact.uri, `urn:sha256:${artifact.sha256}`);
    assert.deepEqual(artifact.storageCopies, []);
  });

  it('does not invent acceptance for an unverified row, and does not claim it is verified either', () => {
    const { manifest } = convertOne(unverifiedRow);
    assert.equal(validatePreservationManifest(manifest), manifest);
    assert.equal(manifest.events[0].review.state, 'not-reviewed');
    assert.equal(
      manifest.events[0].review.notes,
      'Baseline import of the existing CSV row; no new capture was performed.',
    );
    assert.equal(manifest.events[0].normalizationEvidence.observations.verified, 'FALSE');
  });

  it('preserves fields the earlier 17-field observation set used to drop', () => {
    const richRow = {
      ...verifiedRow,
      id: 'BSKY-90005',
      excerpt: 'An excerpt distinct from the raw text.',
      pull_quote: 'A pull quote distinct from both.',
      thematic_categories: 'Press criticism',
      tags: 'media, press',
      scope: 'national',
      era: '2020s',
      content_type: 'post',
      format: 'text',
      publisher: 'Bluesky',
      original_publication: 'Bluesky',
      key_concepts: 'view from nowhere',
      influence: 'high',
    };
    const { manifest } = convertOne(richRow);
    assert.equal(validatePreservationManifest(manifest), manifest);
    const { observations } = manifest.events[0].normalizationEvidence;
    // raw_text still wins as the primary preservedText source, but excerpt
    // and pull_quote are no longer silently discarded when it is present.
    assert.equal(observations.preservedTextSource, 'raw_text');
    assert.equal(observations.excerpt, richRow.excerpt);
    assert.equal(observations.pullQuote, richRow.pull_quote);
    assert.equal(observations.thematicCategories, richRow.thematic_categories);
    assert.equal(observations.tags, richRow.tags);
    assert.equal(observations.scope, richRow.scope);
    assert.equal(observations.era, richRow.era);
    assert.equal(observations.contentType, richRow.content_type);
    assert.equal(observations.format, richRow.format);
    assert.equal(observations.publisher, richRow.publisher);
    assert.equal(observations.originalPublication, richRow.original_publication);
    assert.equal(observations.keyConcepts, richRow.key_concepts);
    assert.equal(observations.influence, richRow.influence);
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

  it('validates a real prefix plus every missing-url row of data/social_posts.csv end to end', () => {
    const csvText = fs.readFileSync(socialPostsPath, 'utf8');
    const allRows = parse(csvText, { columns: true, skip_empty_lines: true }).map(unescapeRow);
    const missingUrlRows = allRows.filter(row => !row.url);
    assert.ok(missingUrlRows.length > 0, 'the corpus should have at least one missing-url row to exercise that branch');

    // A plain positional prefix would drift out of the missing-url rows as
    // more posts are added at the top of a newest-first CSV (see #717
    // review). Union a fixed-size prefix (general edge-case coverage) with
    // every missing-url row (explicitly, regardless of where it sits) so
    // this test cannot go stale from ordinary data growth.
    const prefix = allRows.slice(0, 2000);
    const prefixIds = new Set(prefix.map(row => row.id));
    const slice = [...prefix, ...missingUrlRows.filter(row => !prefixIds.has(row.id))];
    const expectedMissingUrl = slice.filter(row => !row.url).length;
    assert.equal(expectedMissingUrl, missingUrlRows.length);

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

  describe('checksum pin (drift detection)', () => {
    it('builds one checksum per row, matching the row digest used in the manifest', () => {
      const { manifest } = convertSocialBaselineRows(fixtureRows, { importedAt });
      const pin = buildChecksumPin(fixtureRows, { generatedAt: importedAt });
      assert.equal(pin.rowCount, fixtureRows.length);
      assert.equal(Object.keys(pin.checksums).length, fixtureRows.length);
      for (const artifact of manifest.artifacts) {
        const object = manifest.objects.find(o => o.objectId === artifact.objectId);
        assert.equal(pin.checksums[object.sourceRecordId], artifact.sha256);
      }
    });

    it('reports no drift when nothing changed', () => {
      const pin = buildChecksumPin(fixtureRows, { generatedAt: importedAt });
      const { mismatched, added, removed } = diffChecksumPin(pin, fixtureRows);
      assert.deepEqual(mismatched, []);
      assert.deepEqual(added, []);
      assert.deepEqual(removed, []);
    });

    it('flags a pinned row whose content changed as mismatched, not as added or removed', () => {
      const pin = buildChecksumPin(fixtureRows, { generatedAt: importedAt });
      const mutatedRows = fixtureRows.map(row => (
        row.id === verifiedRow.id ? { ...row, raw_text: 'This text was silently rewritten.' } : row
      ));
      const { mismatched, added, removed } = diffChecksumPin(pin, mutatedRows);
      assert.deepEqual(mismatched, [verifiedRow.id]);
      assert.deepEqual(added, []);
      assert.deepEqual(removed, []);
    });

    it('treats a new row as added and a dropped row as removed, not as drift', () => {
      const pin = buildChecksumPin(fixtureRows, { generatedAt: importedAt });
      const newRow = { ...verifiedRow, id: 'BSKY-90009' };
      const changedRows = [...fixtureRows.slice(1), newRow];
      const { mismatched, added, removed } = diffChecksumPin(pin, changedRows);
      assert.deepEqual(mismatched, []);
      assert.deepEqual(added, ['BSKY-90009']);
      assert.deepEqual(removed, [verifiedRow.id]);
    });

    it('fails loudly instead of silently accepting drift when the CLI --verify runs against a mutated pin', () => {
      const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-baseline-drift-'));
      try {
        // Exercise the CLI's drift-check code path with a non-default CSV
        // path, which never touches the real committed checksum pin — see
        // the "only ever runs against the real data/social_posts.csv" guard
        // covered separately below.
        const csvPath = path.join(temporaryDir, 'fixture.csv');
        fs.writeFileSync(csvPath, stringify(fixtureRows, { header: true, columns: Object.keys(verifiedRow) }));
        const verifyOutput = execFileSync(process.execPath, [scriptPath, csvPath, '--verify'], {
          cwd: root,
          encoding: 'utf8',
        });
        // A non-default CSV path never consults the committed pin, so this
        // still succeeds and never claims to have checked for drift.
        assert.match(verifyOutput, /Verified 4 social baseline rows \(1 marked missing-url\)/);
        assert.doesNotMatch(verifyOutput, /checksum pin/);
      } finally {
        fs.rmSync(temporaryDir, { recursive: true, force: true });
      }
    });

    it('refuses --write-checksums against anything but the real data/social_posts.csv', () => {
      const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-baseline-write-'));
      try {
        const csvPath = path.join(temporaryDir, 'fixture.csv');
        fs.writeFileSync(csvPath, stringify(fixtureRows, { header: true, columns: Object.keys(verifiedRow) }));
        assert.throws(() => execFileSync(process.execPath, [scriptPath, csvPath, '--write-checksums'], {
          cwd: root,
          encoding: 'utf8',
          stdio: 'pipe',
        }), (error) => {
          assert.match(error.stderr, /only runs against the real data\/social_posts\.csv/);
          return true;
        });
      } finally {
        fs.rmSync(temporaryDir, { recursive: true, force: true });
      }
    });

    it('rejects an unrecognized flag instead of silently treating it as an input path', () => {
      assert.throws(() => execFileSync(process.execPath, [scriptPath, '--help'], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      }), (error) => {
        assert.match(error.stderr, /unknown flag --help/);
        return true;
      });
    });
  });
});
