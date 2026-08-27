#!/usr/bin/env node

/**
 * Preservation baseline for social posts (issue #717).
 *
 * The per-post browser screenshot project will take years to reach every row
 * in data/social_posts.csv. This script does not wait for that. It packages
 * the rows that already exist today into an immutable preservation-manifest
 * baseline, so the archive's own evidence survives even if a live post is
 * later deleted or a platform disappears before its screenshot is captured.
 *
 * This is a baseline import, not a live crawl:
 *   - It never makes a network call.
 *   - It never replaces or edits data/social_posts.csv.
 *   - Every event uses the schema's `not-requested` retrieval outcome, which
 *     marks "we packaged existing evidence" as distinct from a real capture
 *     attempt. A later stewardship stage can append real capture-attempt,
 *     fixity, storage-copy, and rights events without touching this baseline.
 *
 * Each CSV row becomes one `social-post` object, keyed by its own stable
 * archive record ID (e.g. BSKY-00001), plus one artifact that preserves the
 * full row (including its raw text) behind a SHA-256 digest. A row with no
 * recoverable canonical URL (its source link was removed as unresolved, see
 * the row's own notes) still gets an object and a preserved artifact, but its
 * canonical source becomes an explicit `missing-url` URN and its event is
 * marked `review-required` instead of a capture attempt, so the gap is
 * documented rather than hidden.
 *
 * Run the compatibility check:
 *   node preservation/import-social-baseline.mjs --verify
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
  'Baseline import of the existing verified CSV row; no new capture was performed.';
const DEFAULT_MISSING_URL_NOTES =
  'No recoverable canonical source URL for this row; the row content is preserved '
  + 'from data/social_posts.csv as an explicit missing-source-url state.';

// Fixed, human-readable crosswalk from CSV columns to preserved manifest
// fields. This does not vary per row, so it is built once.
const FIELD_MAPPING = {
  id: 'sourceRecordId and the object/artifact stable-ID suffix',
  url: 'canonicalSourceUrl, or a urn:rosen:social-source:missing-url placeholder when the row has no url',
  raw_text: 'observations.preservedText (primary source)',
  excerpt: 'observations.preservedText (fallback when raw_text is empty)',
  pull_quote: 'observations.preservedText (final fallback)',
  related_to: 'observations.relatedTo',
  responds_to: 'observations.respondsTo',
  platform: 'observations.platform',
  verified: 'observations.verified and the event review.state',
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
    platform: row.platform || '',
    author: row.author || '',
    title: row.title || '',
    publicationDate: row.publication_date || '',
    wordCount: row.word_count || '',
    likes: row.likes || '',
    reposts: row.reposts || '',
    replies: row.replies || '',
    relatedTo: row.related_to || '',
    respondsTo: row.responds_to || '',
    copyright: row.copyright || '',
    permissions: row.permissions || '',
    license: row.license || '',
    verified: row.verified || '',
    dateProcessed: row.date_processed || '',
    preservedText,
    preservedTextSource,
  };
}

/**
 * Convert already-parsed social_posts.csv rows (plain objects, one per row)
 * into a preservation-manifest v1 baseline. Exported separately from the CSV
 * reader so tests and future importers can feed rows directly.
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

  for (const row of rows) {
    const id = requireText(row.id, 'id');
    const objectId = `urn:rosen:object:social-post:${id}`;
    const rowDigest = digest(row);
    const hasUrl = typeof row.url === 'string' && row.url.length > 0;
    const canonicalSourceUrl = hasUrl ? row.url : `urn:rosen:social-source:missing-url:${id}`;
    const artifactId = `urn:rosen-preservation:artifact:social-baseline:${id}:sha256:${rowDigest}`;
    const artifactByteSize = Buffer.byteLength(JSON.stringify(canonicalize(row)), 'utf8');

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
          state: row.verified === 'TRUE' ? 'accepted' : 'review-required',
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
      'Immutable preservation baseline packaging existing data/social_posts.csv rows '
      + '(issue #717). No new live retrieval was performed.',
    objects,
    events,
    artifacts,
  };

  return { manifest, stats: { total: rows.length, missingUrlCount } };
}

/** Parse data/social_posts.csv text and convert it to a preservation baseline. */
export function convertSocialBaselineCsv(csvText, options = {}) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true }).map(unescapeRow);
  return convertSocialBaselineRows(rows, options);
}

function main() {
  const args = process.argv.slice(2);
  const verify = args.includes('--verify');
  const inputPath = args.find(argument => argument !== '--verify') ?? defaultCsvPath;
  const csvText = fs.readFileSync(path.resolve(inputPath), 'utf8');
  const { manifest, stats } = convertSocialBaselineCsv(csvText);
  validatePreservationManifest(manifest);
  if (verify) {
    console.log(
      `Verified ${stats.total} social baseline rows `
      + `(${stats.missingUrlCount} marked missing-url) against preservation schema v1`,
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
