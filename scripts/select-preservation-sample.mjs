#!/usr/bin/env node
// Select the 100-source preservation pilot sample (issue #704, epic #696).
//
// Reads the source CSVs plus the deterministic stewardship census (#703) and
// picks a fixed-size, stratified, reproducible sample of source IDs for the
// preservation pilot. The pilot exists to find the archive's likely capture
// failures before a full run, so the sample deliberately covers every major
// platform, several URL outcomes, verified/unverified records, records with
// and without raw text or graph links, a few notable sources, and a seeded
// random slice to catch whatever the named strata miss.
//
// Determinism matches the census's own contract: given the same inputs and
// the same --seed, this script produces byte-identical output. No wall-clock
// timestamp is written to the tracked JSON; the input commit is the only
// provenance stamp (see scripts/build-stewardship-census.mjs for precedent).
//
// Blind-worker split (acceptance criterion: "expected success is not encoded
// into the sample labels used by the worker"). The manifest has two parallel
// arrays, same IDs, same order:
//   - `sources`    -- id, objectType, url only. This is what the pilot worker
//                     should see. It carries no hint about why a source was
//                     picked or what outcome is expected.
//   - `selection`  -- id, stratum, group, reason, and the audit fields behind
//                     the pick (platform, url_status, verified, ...). This is
//                     for curator/reviewer eyes -- it must never be handed to
//                     whoever runs the blind capture pass.
// A `url_status` of "known_difficult" or "redirector" is a documented,
// domain-level heuristic (no network probe: the stewardship census keeps
// liveness out of its own deterministic contract, and this script follows
// the same rule) -- it says a host is known to challenge automated capture in
// general, not that any specific URL is currently down. See computeUrlStatus.
//
// Usage:
//   node scripts/select-preservation-sample.mjs
//   node scripts/select-preservation-sample.mjs --seed my-seed --output-dir /tmp/out
//   node scripts/select-preservation-sample.mjs --sample-size 20 --data-dir tests/fixtures/preservation-sample

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parse } from 'csv-parse/sync';
import { unescapeRow } from '../data/lib/csv-unescape.js';
import { isWellFormedHttpUrl } from './verify-links.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_ID = 'preservation-sample/1.0.0';
const DEFAULT_SEED = 'rosen-preservation-pilot-v1';
const DEFAULT_SAMPLE_SIZE = 100;

const INPUT_FILES = [
  'archive_records-public.csv',
  'social_posts.csv',
  'extracted_relationships.csv',
  'stewardship-census.json'
];

// Empirically grounded against the 2026-08 corpus (877 curated records carry
// at least one relationship assertion; the median count is 10). A threshold
// of 25 selects roughly the top decile -- a meaningful minority, not most of
// the corpus -- as "heavily cross-referenced" for the notable/high-value bucket.
const HIGH_VALUE_RELATIONSHIP_THRESHOLD = 25;
// A host used by two or fewer records site-wide is a rare, likely personal or
// small-publication domain; combined with no gdrive backup link, that is a
// single point of failure worth exercising deliberately.
const AT_RISK_HOST_FREQUENCY_MAX = 2;

// Hosts documented (CLAUDE.md "Known issues") to challenge automated capture
// in a way narrow enough to still be a minority of the corpus: a standing TLS
// certificate problem on archive.pressthink.org that fails an HTTPS fetch even
// though browsers load the page fine, and newspapers.com's subscription
// paywall in front of the scanned clippings. This is a domain-level policy
// proxy, not a per-URL liveness check.
//
// x.com is deliberately NOT on this list even though it is well known to serve
// login/bot walls to unauthenticated automated clients: it is also ~85% of the
// whole corpus by row count, so tagging it "known_difficult" here would make
// that url_status describe most of the archive rather than a distinct,
// deliberately-sampled minority -- exactly what "known failures do not crowd
// out ordinary pages" rules out. The platform_twitter_x quota already
// guarantees X/Twitter coverage; whether a given post hits a wall is for the
// pilot capture itself to discover, not for this manifest to presume.
const KNOWN_DIFFICULT_HOSTS = new Set(['archive.pressthink.org', 'newspapers.com']);
// Hosts that are themselves link-shorteners/redirectors: the URL on record is
// never the final destination.
const KNOWN_REDIRECTOR_HOSTS = new Set(['tmblr.co', 'huffingtonpost.com', 'youtu.be']);

const MEDIA_CONTENT_TYPES = new Set(['Video', 'Interview (Audio/Video)', 'Panel Discussion', 'Speech/Lecture']);
const MEDIA_PLATFORM_FIELDS = new Set(['YouTube', 'Podcast', 'SoundCloud', 'Radio', 'Television']);

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function stableObject(entries) {
  return Object.fromEntries(Object.entries(entries).sort(([left], [right]) => compareCodeUnits(left, right)));
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || 'Unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return stableObject(counts);
}

function isPresent(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
}

function isVerified(value) {
  if (value === true) return true;
  return ['true', 'yes', '1'].includes(String(value || '').trim().toLowerCase());
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readCsv(filePath) {
  return parse(fs.readFileSync(filePath), { bom: true, columns: true, skip_empty_lines: true }).map(unescapeRow);
}

function relativeInputPath(rootDir, dataDir, filename) {
  const absolute = path.join(dataDir, filename);
  const relative = path.relative(rootDir, absolute);
  return normalizePath(relative.startsWith('..') ? filename : relative);
}

function git(rootDir, args) {
  return execFileSync('git', ['-C', rootDir, ...args], { encoding: 'utf8' }).trim();
}

export function inspectPreservationSampleInputGitState({ rootDir = ROOT_DIR, files }) {
  const paths = files.map(file => file.path);
  const commit = git(rootDir, ['log', '-1', '--format=%H', '--', ...paths]);
  const dirtyPaths = git(rootDir, ['status', '--porcelain', '--', ...paths]);
  const shallow = git(rootDir, ['rev-parse', '--is-shallow-repository']) === 'true';
  return { commit, dirty: Boolean(dirtyPaths), shallow };
}

function describeInput(rootDir, files) {
  const state = inspectPreservationSampleInputGitState({ rootDir, files });
  // A shallow-marked clone is only a real problem when it actually prevented
  // finding the commit that last touched these input files (an empty `commit`
  // from `git log -1 -- <paths>`). Some worktrees report `--is-shallow-repository`
  // as true (e.g. a stale/empty `.git/shallow` marker) while still holding
  // complete history for every tracked path, so refusing on the flag alone
  // would reject a perfectly good, fully-traceable run.
  if (state.shallow && !state.commit) {
    throw new Error(
      'Preservation sample input provenance requires complete Git history. Fetch with --unshallow or clone with full history.'
    );
  }
  if (state.dirty) {
    throw new Error(
      'Preservation sample inputs have uncommitted changes. Commit the source CSVs and stewardship census before regenerating the stamped sample.'
    );
  }
  return { commit: state.commit, dirty: false, files };
}

export function loadPreservationSampleInputs({ dataDir, rootDir = ROOT_DIR } = {}) {
  const resolvedDataDir = dataDir || path.join(rootDir, 'data');
  for (const filename of INPUT_FILES) {
    const filePath = path.join(resolvedDataDir, filename);
    if (!fs.existsSync(filePath)) throw new Error(`Missing preservation sample input: ${filePath}`);
  }
  const files = INPUT_FILES.map(filename => {
    const filePath = path.join(resolvedDataDir, filename);
    return { path: relativeInputPath(rootDir, resolvedDataDir, filename), sha256: sha256(fs.readFileSync(filePath)) };
  });
  return {
    curated: readCsv(path.join(resolvedDataDir, 'archive_records-public.csv')),
    social: readCsv(path.join(resolvedDataDir, 'social_posts.csv')),
    relationships: readCsv(path.join(resolvedDataDir, 'extracted_relationships.csv')),
    census: JSON.parse(fs.readFileSync(path.join(resolvedDataDir, 'stewardship-census.json'), 'utf8')),
    files
  };
}

// ----- seeded PRNG (mulberry32) -----
// A small string seed is hashed to a 32-bit int (FNV-1a), which seeds a
// mulberry32 generator. Same seed -> same number stream -> same picks.

function hashSeed(seed) {
  let h = 0x811c9dc5;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ----- per-source classification (pure, deterministic, no network) -----

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function platformGroupOf({ source, id, contentType, platformField }) {
  if (source === 'social') {
    if (platformField === 'Twitter/X') return 'twitter_x';
    if (platformField === 'Bluesky') return 'bluesky';
    if (platformField === 'Mastodon') return 'mastodon';
    return 'social_other';
  }
  if (id.startsWith('TUMBLR-') || platformField === 'Tumblr') return 'tumblr';
  if (id.startsWith('THREAD-') || contentType === 'Social Media Thread' || contentType === 'Tweet/Thread') return 'thread';
  if (id.startsWith('CLIP-') || contentType === 'Newspaper Clipping') return 'newspaper_clipping';
  return 'pressthink_longform';
}

function urlStatusOf({ url, host }) {
  if (!url) return 'missing';
  if (KNOWN_DIFFICULT_HOSTS.has(host)) return 'known_difficult';
  if (KNOWN_REDIRECTOR_HOSTS.has(host)) return 'redirector';
  return 'likely_live';
}

function pageTypeOf({ source, contentType, platformField, url, host, row }) {
  const isPdfUrl = typeof url === 'string' && /\.pdf(?:$|\?)/i.test(url);
  // Newspaper clippings are scanned print pages, reached through newspapers.com's
  // JS image viewer -- a PDF/OCR-shaped capture path, not a rendered web article.
  // Keyed on platform/host (both consistently "Newspaper" / "newspapers.com" for
  // every clipping row) rather than the CSV's content_type column, which only
  // reads "Newspaper Clipping" for 26 of the corpus's 82 clipping rows and
  // "Article" for the other 56 -- content_type alone would miss most of them.
  // row.gdrive_pdf_link is deliberately NOT part of this check: it is an
  // internal Drive backup the pilot worker never sees (it is not carried into
  // the `sources` view), so it says nothing about the shape of the page the
  // worker will actually fetch.
  const isNewspaperClipping = platformField === 'Newspaper' || host === 'newspapers.com';
  if (isPdfUrl || isNewspaperClipping) return 'pdf';
  if (MEDIA_CONTENT_TYPES.has(contentType) || MEDIA_PLATFORM_FIELDS.has(platformField) || isPresent(row.length_in_seconds)) {
    return 'media';
  }
  if (source === 'social') return 'dynamic';
  // A redirector host (see KNOWN_REDIRECTOR_HOSTS) is never the final page: the
  // URL on record is a short link or a retired domain that forwards elsewhere,
  // so this script has no way to know the destination's rendered shape. Calling
  // that "static HTML" would be a guess it cannot back up.
  if (host && KNOWN_REDIRECTOR_HOSTS.has(host)) return 'redirect';
  return 'static';
}

function buildEntries({ curated, social, relationships }) {
  const relationshipCounts = new Map();
  for (const row of relationships) {
    const id = row.source_record_id;
    if (!id) continue;
    relationshipCounts.set(id, (relationshipCounts.get(id) || 0) + 1);
  }

  const rows = [
    ...curated.map(row => ({ row, source: 'curated' })),
    ...social.map(row => ({ row, source: 'social' }))
  ];

  const hostFrequency = new Map();
  for (const { row } of rows) {
    const host = isWellFormedHttpUrl(row.url) ? hostnameOf(row.url) : null;
    if (host) hostFrequency.set(host, (hostFrequency.get(host) || 0) + 1);
  }

  return rows.map(({ row, source }) => {
    const id = row.id;
    const url = isWellFormedHttpUrl(row.url) ? row.url : null;
    const host = url ? hostnameOf(url) : null;
    const contentType = String(row.content_type || '').trim();
    const platformField = String(row.platform || '').trim();
    const hasBackup = isPresent(row.gdrive_pdf_link) || isPresent(row.gdrive_raw_file_link) || isPresent(row.gdrive_transcript_link);
    const relationshipCount = relationshipCounts.get(id) || 0;
    return {
      id,
      source,
      objectType: source === 'curated' ? 'archive-record' : 'social-post',
      url,
      host,
      verified: isVerified(row.verified),
      hasRawText: isPresent(row.raw_text),
      hasGraphLinks: relationshipCount > 0,
      relationshipCount,
      platformGroup: platformGroupOf({ source, id, contentType, platformField }),
      urlStatus: urlStatusOf({ url, host }),
      pageType: pageTypeOf({ source, contentType, platformField, url, host, row }),
      highValue: relationshipCount >= HIGH_VALUE_RELATIONSHIP_THRESHOLD,
      atRisk: Boolean(url) && !hasBackup && (hostFrequency.get(host) || 0) <= AT_RISK_HOST_FREQUENCY_MAX
    };
  });
}

// ----- quota table -----

function quota(id, group, target, predicate, reason) {
  const reasonFn = typeof reason === 'function' ? reason : () => reason;
  return { id, group, target, predicate, reason: reasonFn };
}

export const DEFAULT_QUOTAS = [
  quota('platform_pressthink_longform', 'platform', 8, e => e.platformGroup === 'pressthink_longform',
    'Curated long-form PressThink/journal writing -- the core editorial voice of the archive.'),
  quota('platform_newspaper_clipping', 'platform', 3, e => e.platformGroup === 'newspaper_clipping',
    'Scanned newspaper clipping (PDF/OCR) -- a different capture path than a rendered web page.'),
  quota('platform_tumblr', 'platform', 5, e => e.platformGroup === 'tumblr',
    "Tumblr post, reached through Tumblr's tmblr.co short-link redirector."),
  quota('platform_thread', 'platform', 3, e => e.platformGroup === 'thread',
    'Multi-post thread record; the pilot must resolve it into its component posts.'),
  quota('platform_twitter_x', 'platform', 8, e => e.platformGroup === 'twitter_x',
    'Twitter/X post -- the largest single platform in the archive.'),
  quota('platform_bluesky', 'platform', 6, e => e.platformGroup === 'bluesky', 'Bluesky post.'),
  quota('platform_mastodon', 'platform', 5, e => e.platformGroup === 'mastodon', 'Mastodon post.'),
  quota('url_missing', 'url_status', 3, e => e.urlStatus === 'missing',
    'No source URL on record -- the pilot must handle a source with nothing to fetch.'),
  quota('url_known_difficult', 'url_status', 5, e => e.urlStatus === 'known_difficult',
    "Host is documented to challenge unauthenticated capture (login/bot wall, or a certificate issue) -- exercises the pilot's failure handling; not a claim that this specific URL is down right now."),
  quota('url_redirector', 'url_status', 3, e => e.urlStatus === 'redirector',
    'Host is a known link-shortener/redirector; the URL on record is not the final destination.'),
  quota('verification_unverified', 'verification', 4, e => !e.verified,
    'Record is marked unverified in the curation pipeline.'),
  quota('text_missing_raw_text', 'raw_text', 4, e => !e.hasRawText,
    'Record has no captured raw_text -- a gap the pilot capture should be able to close.'),
  quota('graph_has_links', 'graph_links', 4, e => e.hasGraphLinks,
    'Record already carries extracted entity/relationship links; worth confirming the source survives alongside its graph context.'),
  quota('notable_high_value', 'notable', 3, e => e.highValue,
    `Heavily cross-referenced in the entity graph (>= ${HIGH_VALUE_RELATIONSHIP_THRESHOLD} extracted relationship assertions) -- a source whose loss would be costly.`),
  quota('notable_at_risk', 'notable', 3, e => e.atRisk,
    `Hosted on a rarely-used domain (<= ${AT_RISK_HOST_FREQUENCY_MAX} records site-wide) with no gdrive backup on file -- a single point of failure.`),
  quota('page_pdf', 'page_type', 3, e => e.pageType === 'pdf', 'PDF-shaped capture rather than a rendered web page.'),
  quota('page_media', 'page_type', 3, e => e.pageType === 'media', 'Audio/video-heavy page (interview, panel, podcast, broadcast).'),
  quota('page_dynamic', 'page_type', 2, e => e.pageType === 'dynamic', 'Client-rendered social timeline rather than static HTML.'),
  quota('page_static', 'page_type', 2, e => e.pageType === 'static', 'Plain static HTML page.')
];

function auditFields(entry) {
  return {
    source: entry.source,
    platform_group: entry.platformGroup,
    url_status: entry.urlStatus,
    page_type: entry.pageType,
    verified: entry.verified,
    has_raw_text: entry.hasRawText,
    has_graph_links: entry.hasGraphLinks,
    host: entry.host
  };
}

export function buildPreservationSample({
  inputs,
  seed = DEFAULT_SEED,
  sampleSize = DEFAULT_SAMPLE_SIZE,
  quotas = DEFAULT_QUOTAS,
  input,
  rootDir = ROOT_DIR
} = {}) {
  if (!inputs) inputs = loadPreservationSampleInputs({ rootDir, dataDir: path.join(rootDir, 'data') });

  const entries = buildEntries(inputs);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  // Sort by id first so the only source of randomness is the seeded shuffle,
  // never CSV row order or Map/Set iteration order.
  const sortedEntries = [...entries].sort((a, b) => compareCodeUnits(a.id, b.id));

  const rng = mulberry32(hashSeed(seed));
  const selectedIds = new Set();
  const picked = [];
  const quotaReport = [];

  for (const q of quotas) {
    const slotsLeft = sampleSize - selectedIds.size;
    if (slotsLeft <= 0) {
      quotaReport.push({ id: q.id, group: q.group, target: q.target, selected: 0, shortfall: q.target });
      continue;
    }
    const pool = sortedEntries.filter(entry => !selectedIds.has(entry.id) && q.predicate(entry));
    const shuffled = seededShuffle(pool, rng);
    const take = Math.min(q.target, slotsLeft, shuffled.length);
    const picks = shuffled.slice(0, take);
    for (const entry of picks) {
      selectedIds.add(entry.id);
      picked.push({ id: entry.id, stratum: q.id, group: q.group, reason: q.reason(entry), ...auditFields(entry) });
    }
    quotaReport.push({ id: q.id, group: q.group, target: q.target, selected: picks.length, shortfall: q.target - picks.length });
  }

  const randomTarget = sampleSize - selectedIds.size;
  if (randomTarget > 0) {
    const pool = sortedEntries.filter(entry => !selectedIds.has(entry.id));
    const shuffled = seededShuffle(pool, rng);
    const picks = shuffled.slice(0, randomTarget);
    for (const entry of picks) {
      selectedIds.add(entry.id);
      picked.push({
        id: entry.id,
        stratum: 'random_seed_slice',
        group: 'random',
        reason: `Uniform random draw from the remaining eligible universe under seed "${seed}", to catch failure modes the named strata do not anticipate.`,
        ...auditFields(entry)
      });
    }
    quotaReport.push({ id: 'random_seed_slice', group: 'random', target: randomTarget, selected: picks.length, shortfall: randomTarget - picks.length });
  }

  if (selectedIds.size < sampleSize) {
    throw new Error(
      `Not enough eligible sources to build a sample of ${sampleSize}: only ${selectedIds.size} unique sources selected from ${sortedEntries.length} eligible rows.`
    );
  }

  // Final output is sorted by id -- easy for a runner to iterate and for a
  // reviewer to look up a specific ID -- while `stratum`/`reason` still say
  // why each one is here. `sources` and `selection` share this order and id set.
  const orderedPicked = [...picked].sort((a, b) => compareCodeUnits(a.id, b.id));

  const sources = orderedPicked.map(item => {
    const entry = byId.get(item.id);
    return { id: entry.id, objectType: entry.objectType, url: entry.url };
  });
  const selection = orderedPicked.map(item => ({
    id: item.id,
    stratum: item.stratum,
    group: item.group,
    reason: item.reason,
    source: item.source,
    platform_group: item.platform_group,
    url_status: item.url_status,
    page_type: item.page_type,
    verified: item.verified,
    has_raw_text: item.has_raw_text,
    has_graph_links: item.has_graph_links,
    host: item.host
  }));

  const randomCount = picked.filter(item => item.stratum === 'random_seed_slice').length;

  const manifest = {
    schema: {
      id: SCHEMA_ID,
      compatibility: 'additive changes within version 1; semantic changes require a new major version'
    },
    input: {
      ...(input || describeInput(rootDir, inputs.files)),
      census_schema_id: inputs.census?.schema?.id ?? null
    },
    seed,
    sample_size: sampleSize,
    quotas: quotaReport,
    summary: {
      total_selected: orderedPicked.length,
      random_count: randomCount,
      random_percentage: Math.round((randomCount / sampleSize) * 1000) / 10,
      by_source: countBy(selection, s => s.source),
      by_platform_group: countBy(selection, s => s.platform_group),
      by_url_status: countBy(selection, s => s.url_status),
      by_page_type: countBy(selection, s => s.page_type)
    },
    // Blind view: hand only this (or a projection of just id + url) to whoever
    // runs the pilot capture pass. See header comment.
    sources,
    // Audit view: curator/reviewer eyes only. Never give this to the blind worker.
    selection
  };

  return manifest;
}

export function formatPreservationSampleJson(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function markdownTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  return [head, rule, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
}

export function formatPreservationSampleMarkdown(manifest) {
  const lines = [
    '# Preservation pilot sample',
    '',
    `Schema \`${manifest.schema.id}\`. Seed \`${manifest.seed}\`. Sample size ${manifest.sample_size}.`,
    '',
    `Input commit: \`${manifest.input.commit}\` (${manifest.input.dirty ? 'input files dirty' : 'input files clean'}), stewardship census \`${manifest.input.census_schema_id}\`.`,
    '',
    'This file is a human-readable summary. The versioned manifest is `preservation-sample.json`.',
    'Only `sources` there is meant for the blind pilot worker -- `selection` (and the tables below) are for curator review.',
    '',
    '## Coverage',
    '',
    markdownTable(
      ['Stratum', 'Group', 'Target', 'Selected', 'Shortfall'],
      manifest.quotas.map(q => [q.id, q.group, q.target, q.selected, q.shortfall])
    ),
    '',
    `Random component: ${manifest.summary.random_count} of ${manifest.sample_size} (${manifest.summary.random_percentage}%).`,
    '',
    '## By source',
    '',
    markdownTable(['Source', 'Count'], Object.entries(manifest.summary.by_source)),
    '',
    '## By platform',
    '',
    markdownTable(['Platform group', 'Count'], Object.entries(manifest.summary.by_platform_group)),
    '',
    '## By URL status',
    '',
    markdownTable(['URL status', 'Count'], Object.entries(manifest.summary.by_url_status)),
    '',
    '## By page type',
    '',
    markdownTable(['Page type', 'Count'], Object.entries(manifest.summary.by_page_type)),
    ''
  ];
  return `${lines.join('\n')}\n`;
}

// ----- CLI -----

function parseArgs(argv) {
  const args = {
    dataDir: path.join(ROOT_DIR, 'data'),
    outputDir: path.join(ROOT_DIR, 'data'),
    seed: DEFAULT_SEED,
    sampleSize: DEFAULT_SAMPLE_SIZE
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--data-dir') args.dataDir = path.resolve(argv[++index]);
    else if (arg === '--output-dir') args.outputDir = path.resolve(argv[++index]);
    else if (arg === '--seed') args.seed = argv[++index];
    else if (arg === '--sample-size') args.sampleSize = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export function writePreservationSample({ rootDir = ROOT_DIR, dataDir, outputDir, seed, sampleSize } = {}) {
  const resolvedDataDir = dataDir || path.join(rootDir, 'data');
  const resolvedOutputDir = outputDir || resolvedDataDir;
  const inputs = loadPreservationSampleInputs({ rootDir, dataDir: resolvedDataDir });
  const manifest = buildPreservationSample({ inputs, seed, sampleSize, rootDir });
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  fs.writeFileSync(path.join(resolvedOutputDir, 'preservation-sample.json'), formatPreservationSampleJson(manifest));
  fs.writeFileSync(path.join(resolvedOutputDir, 'preservation-sample.md'), formatPreservationSampleMarkdown(manifest));
  return manifest;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifest = writePreservationSample(args);
    console.log(
      `Wrote preservation sample of ${manifest.summary.total_selected} sources ` +
        `(${manifest.summary.random_count} random, seed "${manifest.seed}").`
    );
  } catch (error) {
    console.error(`Preservation sample selection failed: ${error.message}`);
    process.exitCode = 1;
  }
}
