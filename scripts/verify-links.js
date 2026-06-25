#!/usr/bin/env node
// Pre-launch link-integrity and backlink verification sweep (issue #345).
//
// Read-only. Emits a triage report and never mutates a record. The point is to
// surface drift before launch, not to fix it in place: data repairs belong to
// the record-repair issues (#294 re-scrape, #242 / #315 recovery).
//
// Two layers:
//   - Internal (offline, deterministic, always run): every internal reference
//     resolves to something that exists in the shipped data.
//       * records[].relatedIds      -> entity ids   (a record's related entities)
//       * entities[].firstMentionRecordId -> record ids
//       * recordEntityMap keys      -> record ids,  values -> entity ids
//     Plus URL well-formedness: every record.url is an absolute http(s) URL.
//   - External (network, opt-in via --external): a gentle HEAD liveness probe of
//     each unique external URL, rate-limited and classified. Report-only.
//
// Exit code: non-zero when internal-integrity findings exist, so this can gate a
// clean dataset in CI. External liveness never changes the exit code (network
// flakiness must not fail a build). Pass --report-only to force exit 0.
//
// Usage:
//   node scripts/verify-links.js                 # internal checks, human summary
//   node scripts/verify-links.js --out report.json
//   node scripts/verify-links.js --external --max 500   # also probe liveness
//   node scripts/verify-links.js --report-only   # never exit non-zero

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const USER_AGENT = 'rosen-archive-linkcheck/1.0 (+https://github.com/jamditis/rosen-frontend)';

// ----- pure checks (no I/O, unit-tested) -----

export function isWellFormedHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
}

// A record URL is valid if it is an absolute http(s) URL, or a site-root-relative
// internal route. The archive injects one such record (the dissertation reader at
// /j/rosen-archive/dissertation/reader/), whose URL the app resolves per environment
// in export-archive-data.js and archiveService.js. Those routes are intentional, not drift.
export function isValidRecordUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.startsWith('/')) return value.length > 1;
  return isWellFormedHttpUrl(value);
}

// Validate every internal reference against the id space it points into.
// `data` is archive-data.json (records + entities); `aux` is archive-entities.json
// (recordEntityMap). Returns a flat list of findings; an empty list means clean.
export function checkInternalLinks(data, aux) {
  const records = data.records || [];
  const entities = data.entities || [];
  const recordIds = new Set(records.map((r) => r.id));
  const entityIds = new Set(entities.map((e) => e.id));
  const findings = [];

  for (const record of records) {
    for (const ref of record.relatedIds || []) {
      if (!entityIds.has(ref)) {
        findings.push({
          category: 'internal',
          failureType: 'dangling_related_entity',
          sourceId: record.id,
          target: ref,
          detail: 'record.relatedIds points to an entity id that is not in the dataset'
        });
      }
    }
  }

  for (const entity of entities) {
    // An absent or empty firstMentionRecordId is "no first mention recorded", not a
    // reference, so it is intentionally skipped rather than flagged as dangling.
    const ref = entity.firstMentionRecordId;
    if (ref && !recordIds.has(ref)) {
      findings.push({
        category: 'internal',
        failureType: 'dangling_first_mention_record',
        sourceId: entity.id,
        target: ref,
        detail: 'entity.firstMentionRecordId points to a record id that is not in the dataset'
      });
    }
  }

  const recordEntityMap = (aux && aux.recordEntityMap) || {};
  for (const [recordId, entityRefs] of Object.entries(recordEntityMap)) {
    if (!recordIds.has(recordId)) {
      findings.push({
        category: 'internal',
        failureType: 'dangling_record_entity_map_key',
        sourceId: recordId,
        target: recordId,
        detail: 'recordEntityMap key is not a record id in the dataset'
      });
    }
    for (const entityRef of entityRefs || []) {
      if (!entityIds.has(entityRef)) {
        findings.push({
          category: 'internal',
          failureType: 'dangling_record_entity_map_value',
          sourceId: recordId,
          target: entityRef,
          detail: 'recordEntityMap value is not an entity id in the dataset'
        });
      }
    }
  }

  return findings;
}

export function checkUrlWellFormedness(records) {
  const findings = [];
  for (const record of records || []) {
    if (!isValidRecordUrl(record.url)) {
      findings.push({
        category: 'url',
        failureType: 'malformed_url',
        sourceId: record.id,
        target: record.url ?? null,
        detail: 'record.url is missing or is neither an absolute http(s) URL nor a site-local route'
      });
    }
  }
  return findings;
}

// ----- external liveness (opt-in, network) -----

async function probe(url, { timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal, headers: { 'user-agent': USER_AGENT } });
    // Some hosts reject HEAD (405/501); fall back to a ranged GET.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { 'user-agent': USER_AGENT, range: 'bytes=0-0' } });
    }
    return { status: res.status, location: res.headers.get('location') };
  } finally {
    clearTimeout(timer);
  }
}

function classify(status) {
  if (status >= 200 && status < 300) return null;
  if (status >= 300 && status < 400) return 'redirect_url';
  if (status >= 400 && status < 500) return 'client_error_url';
  return 'server_error_url';
}

// Gentle by design: a small concurrency pool, a per-request timeout, and a delay
// between starts so a single source host is not hammered. robots.txt is not
// fetched per host (probing already-published source URLs with HEAD is low
// impact); that is a documented limitation, not an oversight.
export async function checkExternalLiveness(urls, opts = {}) {
  const { concurrency = 6, timeoutMs = 10000, delayMs = 150, max = Infinity } = opts;
  const targets = [...new Set(urls)].slice(0, max);
  const findings = [];
  let cursor = 0;
  let nextStart = 0;

  // Shared throttle: space request STARTS by delayMs across all workers, not
  // per-worker, so a pool of N workers cannot fire N probes at once. The slot is
  // reserved synchronously (no await between reading and updating nextStart), so
  // concurrent callers each get a distinct, ordered start time.
  async function throttle() {
    if (!delayMs) return;
    const now = Date.now();
    const wait = Math.max(0, nextStart - now);
    nextStart = Math.max(now, nextStart) + delayMs;
    if (wait) await new Promise((r) => setTimeout(r, wait));
  }

  async function worker() {
    while (cursor < targets.length) {
      const url = targets[cursor++];
      await throttle();
      try {
        const { status, location } = await probe(url, { timeoutMs });
        const failureType = classify(status);
        if (failureType) {
          findings.push({ category: 'external', failureType, sourceId: null, target: url, detail: `HTTP ${status}${location ? ` -> ${location}` : ''}` });
        }
      } catch (err) {
        findings.push({ category: 'external', failureType: 'unreachable_url', sourceId: null, target: url, detail: err.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err.message });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return { checked: targets.length, findings };
}

// ----- report -----

export function buildReport({ data, internal, url, external }) {
  const findings = [...internal, ...url, ...(external ? external.findings : [])];
  return {
    generated: new Date().toISOString(),
    dataVersion: data.version ?? null,
    summary: {
      recordsChecked: (data.records || []).length,
      entitiesChecked: (data.entities || []).length,
      internalFailures: internal.length,
      malformedUrls: url.length,
      externalChecked: external ? external.checked : 0,
      externalFailures: external ? external.findings.length : 0
    },
    findings
  };
}

// ----- CLI -----

function parseArgs(argv) {
  const args = { external: false, reportOnly: false, out: null, max: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--external') args.external = true;
    else if (a === '--report-only') args.reportOnly = true;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--max') args.max = Number(argv[++i]);
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'archive-data.json'), 'utf-8'));
  const aux = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'archive-entities.json'), 'utf-8'));

  const internal = checkInternalLinks(data, aux);
  const url = checkUrlWellFormedness(data.records);
  let external = null;
  if (args.external) {
    const urls = (data.records || []).map((r) => r.url).filter(isWellFormedHttpUrl);
    external = await checkExternalLiveness(urls, { max: args.max });
  }

  const report = buildReport({ data, internal, url, external });
  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  }

  const s = report.summary;
  process.stdout.write(
    `verify-links: ${s.recordsChecked} records, ${s.entitiesChecked} entities\n` +
      `  internal backlink failures: ${s.internalFailures}\n` +
      `  malformed urls: ${s.malformedUrls}\n` +
      (args.external ? `  external probed: ${s.externalChecked}, failures: ${s.externalFailures}\n` : '') +
      (args.out ? `  report written: ${args.out}\n` : '')
  );

  const byType = {};
  for (const f of report.findings) byType[f.failureType] = (byType[f.failureType] || 0) + 1;
  for (const [type, count] of Object.entries(byType)) process.stdout.write(`    ${type}: ${count}\n`);

  const internalFailed = s.internalFailures > 0 || s.malformedUrls > 0;
  process.exitCode = internalFailed && !args.reportOnly ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
