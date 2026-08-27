#!/usr/bin/env node

/**
 * Preservation baseline for social posts (issue #717).
 *
 * The per-post browser screenshot project will take years to reach every row
 * in data/social_posts.csv. This script does not wait for that. It packages
 * the rows that already exist today into a preservation-manifest baseline, so
 * the archive's own evidence survives even if a live post is later deleted or
 * a platform disappears before its screenshot is captured.
 *
 * This is a baseline import, not a live crawl:
 *   - It never makes a network call.
 *   - It never replaces or edits data/social_posts.csv.
 *   - Every event uses the schema's `not-requested` retrieval outcome, which
 *     marks "we packaged existing evidence" as distinct from a real capture
 *     attempt. A later stewardship stage can append real capture-attempt,
 *     fixity, storage-copy, and rights events without touching this baseline.
 *   - Its `review.state` is always `not-reviewed` on a normal row: nothing
 *     was actually captured or reviewed here, so nothing is asserted as
 *     `accepted`. A real capture or an explicit `review-decision` event can
 *     assert that later.
 *
 * Each CSV row becomes one `social-post` object, keyed by its own stable
 * archive record ID (e.g. BSKY-00001). The row's own fields — every column
 * that carries content, including `raw_text`, `excerpt`, `pull_quote`,
 * `related_to`, `responds_to`, and every taxonomy field — are copied verbatim
 * into that row's event as `normalizationEvidence.observations`, so nothing in
 * the row is silently dropped. The manifest also records one `metadata`
 * artifact per row: a SHA-256 digest of the row, used as a fixity anchor, not
 * a byte store — the artifact's `uri` is a content hash, not a resolvable
 * location, and `storageCopies` is empty because this baseline keeps no
 * separate copy of the row. The row's actual content lives in
 * `normalizationEvidence.observations` (for rows with a canonical URL) and,
 * unconditionally, in data/social_posts.csv itself.
 *
 * A row with no recoverable canonical URL (its source link was removed as
 * unresolved, see the row's own notes) still gets an object and a digest
 * artifact, but its canonical source becomes an explicit `missing-url` URN
 * and its event is an `artifact-created` event marked `review-required`
 * instead of a capture attempt. The schema's event vocabulary does not allow
 * `normalizationEvidence` on an `artifact-created` event, so those rows carry
 * no observations at all in the manifest — no preserved text, no author, no
 * relationships. The row's own data is untouched in data/social_posts.csv;
 * only the manifest-level record of it is thinner for these rows. See
 * preservation/README.md for the current count and disclosure.
 *
 * This script derives its manifest fresh from the CSV on every run, so
 * running it twice on an unchanged CSV verifies nothing about drift by
 * itself — the digests would simply match themselves again. A compact,
 * committed checksum pin (preservation/social-baseline-checksums.json) is
 * what lets `--verify` detect a row changing between runs. See "Detecting
 * drift" below.
 *
 * Run the compatibility check (also compares against the checksum pin):
 *   node preservation/import-social-baseline.mjs --verify
 *
 * Refresh the checksum pin after an intentional data change:
 *   node preservation/import-social-baseline.mjs --write-checksums
 */

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { unescapeRow } from '../data/lib/csv-unescape.js';
import { validatePreservationManifest } from './validate-preservation-manifests.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultCsvPath = path.resolve(moduleDir, '../data/social_posts.csv');
const TASK_VERSION = 'social-baseline-import@1.0.0';
const DEFAULT_CAPTURE_NOTES =
  'Baseline import of the existing CSV row; no new capture was performed.';
const DEFAULT_MISSING_URL_NOTES =
  'No recoverable canonical source URL for this row; the row content is preserved '
  + 'from data/social_posts.csv as an explicit missing-source-url state.';

// Fixed, human-readable crosswalk from every social_posts.csv column to where
// it lands in the preserved manifest. This does not vary per row, so the
// object itself is built once — but it is still serialized into every event's
// normalizationEvidence, once per row (see preservation/README.md for why).
const FIELD_MAPPING = {
  id: 'sourceRecordId and the object/artifact stable-ID suffix',
  title: 'observations.title',
  url: 'canonicalSourceUrl, or a urn:rosen:social-source:missing-url placeholder when the row has no url',
  author: 'observations.author',
  publication_date: 'observations.publicationDate',
  original_publication: 'observations.originalPublication',
  publisher: 'observations.publisher',
  platform: 'observations.platform',
  content_type: 'observations.contentType',
  format: 'observations.format',
  word_count: 'observations.wordCount',
  length_in_seconds: 'observations.lengthInSeconds',
  excerpt: 'observations.excerpt, and observations.preservedText when raw_text is empty',
  summary: 'observations.summary',
  thematic_categories: 'observations.thematicCategories',
  key_concepts: 'observations.keyConcepts',
  series: 'observations.series',
  era: 'observations.era',
  scope: 'observations.scope',
  tags: 'observations.tags',
  likes: 'observations.likes',
  reposts: 'observations.reposts',
  replies: 'observations.replies',
  related_to: 'observations.relatedTo',
  responds_to: 'observations.respondsTo',
  influence: 'observations.influence',
  copyright: 'observations.copyright',
  license: 'observations.license',
  permissions: 'observations.permissions',
  date_processed: 'observations.dateProcessed',
  gdrive_pdf_link: 'observations.gdrivePdfLink',
  gdrive_raw_file_link: 'observations.gdriveRawFileLink',
  gdrive_transcript_link: 'observations.gdriveTranscriptLink',
  pull_quote: 'observations.pullQuote, and observations.preservedText when raw_text and excerpt are empty',
  raw_text: 'observations.preservedText (primary source)',
  verified: 'observations.verified',
  notes: 'event review.notes',
};

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`social_posts.csv row is missing ${field}`);
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function buildObservations(row) {
  const preservedText = firstNonEmpty(row.raw_text, row.excerpt, row.pull_quote);
  const preservedTextSource = row.raw_text
    ? 'raw_text'
    : row.excerpt
      ? 'excerpt'
      : row.pull_quote
        ? 'pull_quote'
        : 'none';
  return {
    // Every social_posts.csv column that carries row content, mapped
    // verbatim (see FIELD_MAPPING). `id`, `url`, and `notes` are not
    // repeated here: `id` and `url` already identify the object, and
    // `notes` already becomes the event's review notes.
    title: row.title || '',
    author: row.author || '',
    publicationDate: row.publication_date || '',
    originalPublication: row.original_publication || '',
    publisher: row.publisher || '',
    platform: row.platform || '',
    contentType: row.content_type || '',
    format: row.format || '',
    wordCount: row.word_count || '',
    lengthInSeconds: row.length_in_seconds || '',
    excerpt: row.excerpt || '',
    summary: row.summary || '',
    thematicCategories: row.thematic_categories || '',
    keyConcepts: row.key_concepts || '',
    series: row.series || '',
    era: row.era || '',
    scope: row.scope || '',
    tags: row.tags || '',
    likes: row.likes || '',
    reposts: row.reposts || '',
    replies: row.replies || '',
    relatedTo: row.related_to || '',
    respondsTo: row.responds_to || '',
    influence: row.influence || '',
    copyright: row.copyright || '',
    license: row.license || '',
    permissions: row.permissions || '',
    dateProcessed: row.date_processed || '',
    gdrivePdfLink: row.gdrive_pdf_link || '',
    gdriveRawFileLink: row.gdrive_raw_file_link || '',
    gdriveTranscriptLink: row.gdrive_transcript_link || '',
    pullQuote: row.pull_quote || '',
    verified: row.verified || '',
    // Derived, not a direct column copy: the best available text plus which
    // column it came from, so a reader does not have to re-run the fallback
    // logic to know where preservedText originated.
    preservedText,
    preservedTextSource,
  };
}

/**
 * Build a compact id -> row-digest checksum pin. This is what makes
 * `--verify` able to detect drift instead of just re-deriving the same
 * digest it is about to compare against itself (see the module doc comment).
 * Digests here must be computed the same way as the per-row digest in
 * convertSocialBaselineRows (raw, pre-unescape row) so a pin built by
 * --write-checksums matches what a later --verify run recomputes.
 */
export function buildChecksumPin(rawRows, options = {}) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new TypeError('checksum pin requires at least one row');
  }
  const checksums = {};
  for (const rawRow of rawRows) {
    // Key by the same (unescaped) ID the manifest uses as sourceRecordId,
    // even though the digest itself is computed on the raw row — see
    // convertSocialBaselineRows for why the two differ.
    const id = requireText(unescapeRow(rawRow).id, 'id');
    checksums[id] = digest(rawRow);
  }
  return {
    schemaVersion: '1.0.0',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    source: 'data/social_posts.csv',
    rowCount: rawRows.length,
    checksums,
  };
}

/**
 * Compare a previously written checksum pin against the current rows.
 * `mismatched` is the actionable signal: a pinned row whose digest changed,
 * meaning its CSV content changed since the pin was written. `added` and
 * `removed` just describe corpus growth or shrinkage and are not failures by
 * themselves.
 */
export function diffChecksumPin(pin, rawRows) {
  const current = buildChecksumPin(rawRows, { generatedAt: pin.generatedAt });
  const mismatched = [];
  const removed = [];
  for (const [id, sha256] of Object.entries(pin.checksums)) {
    if (!Object.hasOwn(current.checksums, id)) {
      removed.push(id);
    } else if (current.checksums[id] !== sha256) {
      mismatched.push(id);
    }
  }
  const added = Object.keys(current.checksums).filter(id => !Object.hasOwn(pin.checksums, id));
  return { mismatched, added, removed };
}

/**
 * Convert already-parsed social_posts.csv rows (plain objects, one per row)
 * into a preservation-manifest v1 baseline. Exported separately from the CSV
 * reader so tests and future importers can feed rows directly.
 *
 * `rows` are treated as raw, pre-unescape CSV rows: the row digest (and so
 * every artifact/event ID and the checksum pin) is computed on the row
 * exactly as parsed, before data/lib/csv-unescape.js's formula-injection
 * unescape runs. That digest is therefore a fixity check on the row's own
 * bytes, not on a derived form of them. The formula-safe apostrophe is
 * stripped only when building the human-facing text in
 * normalizationEvidence.observations.
 */
export function convertSocialBaselineRows(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError('social baseline import requires at least one row');
  }
  const importedAt = options.importedAt ?? new Date().toISOString();
  const objects = [];
  const events = [];
  const artifacts = [];
  let missingUrlCount = 0;

  for (const rawRow of rows) {
    const row = unescapeRow(rawRow);
    const id = requireText(row.id, 'id');
    const objectId = `urn:rosen:object:social-post:${id}`;
    const rowDigest = digest(rawRow);
    const hasUrl = typeof row.url === 'string' && row.url.length > 0;
    const canonicalSourceUrl = hasUrl ? row.url : `urn:rosen:social-source:missing-url:${id}`;
    const artifactId = `urn:rosen-preservation:artifact:social-baseline:${id}:sha256:${rowDigest}`;
    const artifactByteSize = Buffer.byteLength(JSON.stringify(canonicalize(rawRow)), 'utf8');

    objects.push({
      objectId,
      objectType: 'social-post',
      canonicalSourceUrl,
      sourceRecordId: id,
      ...(row.title ? { label: row.title } : {}),
    });

    if (hasUrl) {
      const eventId = `urn:rosen-preservation:event:social-baseline:${id}:${digest([id, rowDigest, 'capture-attempt'])}`;
      events.push({
        eventId,
        eventType: 'capture-attempt',
        objectId,
        taskVersion: TASK_VERSION,
        inputHash: rowDigest,
        actor: {
          actorType: 'automation',
          actorId: 'social-baseline-import-tool',
        },
        occurredAt: importedAt,
        review: {
          // Never 'accepted' here: no capture was attempted, so nothing has
          // been reviewed and accepted yet. The CSV's own verified column is
          // preserved honestly as observations.verified above, not folded
          // into this event's review state.
          state: 'not-reviewed',
          notes: firstNonEmpty(row.notes, DEFAULT_CAPTURE_NOTES),
        },
        artifactId,
        retrieval: {
          requestedUrl: row.url,
          httpStatus: null,
          httpOutcome: 'not-requested',
          mediaType: null,
          bytesReceived: 0,
          client: {
            name: 'not-requested',
            version: TASK_VERSION,
          },
          semanticOutcome: 'uncertain',
        },
        normalizationEvidence: {
          sourceLocator: row.url,
          observations: buildObservations(row),
          fieldMapping: FIELD_MAPPING,
          normalizedObjectSha256: rowDigest,
          captureMode: 'baseline-import',
          recordSource: 'data/social_posts.csv',
          runtimeNetworkAccess: false,
        },
      });
      artifacts.push({
        artifactId,
        objectId,
        captureEventId: eventId,
        artifactType: 'metadata',
        uri: `urn:sha256:${rowDigest}`,
        sha256: rowDigest,
        byteSize: artifactByteSize,
        mediaType: 'application/json',
        storageCopies: [],
      });
    } else {
      missingUrlCount += 1;
      const eventId = `urn:rosen-preservation:event:social-baseline:${id}:${digest([id, rowDigest, 'artifact-created'])}`;
      events.push({
        eventId,
        eventType: 'artifact-created',
        objectId,
        taskVersion: TASK_VERSION,
        inputHash: rowDigest,
        actor: {
          actorType: 'automation',
          actorId: 'social-baseline-import-tool',
        },
        occurredAt: importedAt,
        review: {
          state: 'review-required',
          notes: firstNonEmpty(row.notes, DEFAULT_MISSING_URL_NOTES),
        },
        artifactId,
      });
      artifacts.push({
        artifactId,
        objectId,
        artifactType: 'metadata',
        uri: `urn:sha256:${rowDigest}`,
        sha256: rowDigest,
        byteSize: artifactByteSize,
        mediaType: 'application/json',
        storageCopies: [],
      });
    }
  }

  const manifest = {
    schemaVersion: '1.0.0',
    vocabularyVersion: '1.0.0',
    manifestId: `urn:rosen-preservation:manifest:social-baseline:${digest(rows)}`,
    createdAt: importedAt,
    description:
      'Preservation baseline packaging existing data/social_posts.csv rows '
      + '(issue #717). No new live retrieval was performed. Regenerated fresh from '
      + 'the CSV on every run; see social-baseline-checksums.json for drift detection.',
    objects,
    events,
    artifacts,
  };

  return { manifest, stats: { total: rows.length, missingUrlCount } };
}

/** Parse data/social_posts.csv text and convert it to a preservation baseline. */
export function convertSocialBaselineCsv(csvText, options = {}) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true });
  return convertSocialBaselineRows(rows, options);
}

const checksumsPath = path.join(moduleDir, 'social-baseline-checksums.json');
const KNOWN_FLAGS = new Set(['--verify', '--write-checksums']);

function readRawRows(inputPath) {
  const csvText = fs.readFileSync(path.resolve(inputPath), 'utf8');
  return parse(csvText, { columns: true, skip_empty_lines: true });
}

function main() {
  const args = process.argv.slice(2);
  const unknownFlag = args.find(argument => argument.startsWith('--') && !KNOWN_FLAGS.has(argument));
  if (unknownFlag) {
    throw new Error(`unknown flag ${unknownFlag}`);
  }
  const verify = args.includes('--verify');
  const writeChecksums = args.includes('--write-checksums');
  const inputPath = path.resolve(args.find(argument => !KNOWN_FLAGS.has(argument)) ?? defaultCsvPath);
  const isDefaultCorpus = inputPath === path.resolve(defaultCsvPath);
  const rawRows = readRawRows(inputPath);

  if (writeChecksums) {
    if (!isDefaultCorpus) {
      throw new Error(
        '--write-checksums only runs against the real data/social_posts.csv, '
        + 'so a test or scratch CSV can never overwrite the committed checksum pin',
      );
    }
    const pin = buildChecksumPin(rawRows);
    fs.writeFileSync(checksumsPath, JSON.stringify(pin));
    console.log(`Wrote checksum pin for ${pin.rowCount} rows to ${path.relative(process.cwd(), checksumsPath)}`);
    return;
  }

  const { manifest, stats } = convertSocialBaselineRows(rawRows);
  validatePreservationManifest(manifest);

  if (verify) {
    let driftNote = '';
    if (isDefaultCorpus && fs.existsSync(checksumsPath)) {
      const pin = JSON.parse(fs.readFileSync(checksumsPath, 'utf8'));
      const { mismatched, added, removed } = diffChecksumPin(pin, rawRows);
      if (mismatched.length > 0) {
        const shown = mismatched.slice(0, 10).join(', ');
        const more = mismatched.length > 10 ? `, and ${mismatched.length - 10} more` : '';
        throw new Error(
          `${mismatched.length} row(s) changed since the checksum pin was written: ${shown}${more}. `
          + 'If this change is intended, run --write-checksums to update the pin.',
        );
      }
      driftNote = ` (checksum pin matched: ${pin.rowCount} pinned rows, `
        + `${added.length} new since pin, ${removed.length} removed since pin)`;
    }
    console.log(
      `Verified ${stats.total} social baseline rows `
      + `(${stats.missingUrlCount} marked missing-url) against preservation schema v1${driftNote}`,
    );
  } else {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Social baseline import failed: ${error.message}`);
    process.exitCode = 1;
  }
}
