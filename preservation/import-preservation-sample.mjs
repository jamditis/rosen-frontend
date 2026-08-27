#!/usr/bin/env node

/**
 * Compatibility projection of the preservation pilot sample (issue #857).
 *
 * data/preservation-sample.json lists the 100 sources chosen for the
 * preservation pilot (issue #704) in its own sample-selection schema
 * (preservation-sample/1.0.0): a plain `id`, `objectType`, and `url` per
 * source. That shape predates preservation-manifest.schema.json's object
 * vocabulary, which requires an `objectId` in urn form and a non-null
 * `canonicalSourceUrl`. This adapter projects the sample's `sources` array
 * into schema v1 objects. It does not change data/preservation-sample.json,
 * data/preservation-sample.sources.json, scripts/select-preservation-sample.mjs,
 * or the preservation-sample/1.0.0 schema itself.
 *
 * The pilot capture has not run yet, so there is no retrieval evidence to
 * package. The projected manifest carries objects only, with empty `events`
 * and `artifacts` arrays (both allowed by the schema). A later stewardship
 * stage can append real source-check and capture-attempt events on top of
 * this projection, the same append-only way import-winer-evidence.mjs and
 * import-social-baseline.mjs let later events build on an earlier baseline.
 *
 * Seven of the sample's 100 sources have no recoverable URL (see
 * data/preservation-sample.md, stratum url_missing). Rather than fabricate
 * one, their canonicalSourceUrl reuses the explicit missing-source-url
 * convention import-social-baseline.mjs already established for
 * data/social_posts.csv: `urn:rosen:social-source:missing-url:<id>`. All
 * seven are `social-post` sources, so the existing convention covers them
 * as-is. A url-less source of any other objectType has no established
 * convention to reuse, so this adapter fails loudly on one rather than
 * inventing a new placeholder scheme for it.
 *
 * Run the compatibility check:
 *   node preservation/import-preservation-sample.mjs --verify
 */

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePreservationManifest } from './validate-preservation-manifests.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSamplePath = path.resolve(moduleDir, '../data/preservation-sample.json');
const MISSING_URL_PREFIX = 'urn:rosen:social-source:missing-url:';
const MISSING_URL_OBJECT_TYPE = 'social-post';

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`preservation sample ${field} is required`);
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

/**
 * Convert an already-parsed preservation-sample.json (or
 * preservation-sample.sources.json, which shares the same `sources` shape)
 * document into a preservation-manifest v1 compatibility projection.
 * Exported separately from the file reader so tests can feed a sample object
 * directly.
 */
export function convertPreservationSample(sample, options = {}) {
  if (!sample || !Array.isArray(sample.sources) || sample.sources.length === 0) {
    throw new TypeError('preservation sample requires a non-empty sources array');
  }
  const createdAt = options.createdAt ?? new Date().toISOString();
  const objects = [];
  let missingUrlCount = 0;

  for (const source of sample.sources) {
    const id = requireText(source?.id, 'source.id');
    const objectType = requireText(source?.objectType, `${id}.objectType`);
    const hasUrl = typeof source.url === 'string' && source.url.length > 0;
    if (!hasUrl && source.url !== null) {
      throw new TypeError(
        `${id}: url must be a non-empty string or null, got ${JSON.stringify(source.url)}`,
      );
    }
    if (!hasUrl && objectType !== MISSING_URL_OBJECT_TYPE) {
      throw new TypeError(
        `${id}: no missing-source-url convention exists for objectType ${objectType}; `
        + 'a canonicalSourceUrl cannot be fabricated for it',
      );
    }
    const canonicalSourceUrl = hasUrl ? source.url : `${MISSING_URL_PREFIX}${id}`;
    if (!hasUrl) missingUrlCount += 1;

    objects.push({
      objectId: `urn:rosen:object:${objectType}:${id}`,
      objectType,
      canonicalSourceUrl,
      sourceRecordId: id,
    });
  }

  const manifest = {
    schemaVersion: '1.0.0',
    vocabularyVersion: '1.0.0',
    manifestId: `urn:rosen-preservation:manifest:preservation-sample:${digest(sample)}`,
    createdAt,
    description:
      'Compatibility projection of the preservation pilot sample '
      + '(data/preservation-sample.json, issue #704) into the preservation-manifest '
      + 'object vocabulary (issue #857). No capture has run yet, so events and '
      + 'artifacts are empty; a later stewardship stage appends real events on top '
      + 'of this projection without changing it.',
    objects,
    events: [],
    artifacts: [],
  };

  return { manifest, stats: { total: sample.sources.length, missingUrlCount } };
}

function main() {
  const args = process.argv.slice(2);
  const verify = args.includes('--verify');
  const inputPath = path.resolve(args.find(argument => argument !== '--verify') ?? defaultSamplePath);
  const sample = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const { manifest, stats } = convertPreservationSample(sample);
  validatePreservationManifest(manifest);

  if (verify) {
    console.log(
      `Verified ${stats.total} preservation sample sources `
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
    console.error(`Preservation sample import failed: ${error.message}`);
    process.exitCode = 1;
  }
}
