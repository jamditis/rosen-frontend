#!/usr/bin/env node
// Pre-launch link-integrity and backlink verification sweep (issue #345).
//
// Never mutates a record. The point is to surface drift before launch, not to
// fix it in place: data repairs belong to the record-repair issues (#294
// re-scrape, #242 / #315 recovery). It is NOT fully read-only on disk, though:
// with --external, it writes the persisted traversal state to --state-file
// (data/link-check-state.json by default, no flag required) so a local sweep
// leaves that one file changed in the working tree. See the "External" bullet
// below and scripts/lib/link-check-state.js.
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
//     Which urls a capped run probes is not the front slice every time: a
//     persisted rotating cursor and per-url revisit cadence (issue #710,
//     scripts/lib/link-check-state.js) pick a different eligible slice each
//     run, so a run past --max eventually reaches every url. State lives in
//     --state-file (default data/link-check-state.json) and must be carried
//     forward between runs -- see .github/workflows/verify-external-links.yml.
//
// Exit code: non-zero when internal-integrity findings exist, so this can gate a
// clean dataset in CI. External liveness never changes the exit code (network
// flakiness must not fail a build). Pass --report-only to force exit 0.
//
// Usage:
//   node scripts/verify-links.js                 # internal checks, human summary
//   node scripts/verify-links.js --out report.json
//   node scripts/verify-links.js --external --max 500   # also probe liveness
//   node scripts/verify-links.js --external --max 500 --state-file data/link-check-state.json
//   node scripts/verify-links.js --external --concurrency 4 --timeout-ms 8000 --delay-ms 250
//   node scripts/verify-links.js --external --max-host-failures 3   # 0 disables the breaker
//   node scripts/verify-links.js --report-only   # never exit non-zero

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FEATURED_WORKS } from '../frontend/constants.js';
import { splitUrlsForLinkify } from '../frontend/utils/linkify.js';
import {
  loadState,
  saveState,
  selectEligibleUrls,
  recordResults,
  diffFindings,
  detectCorpusChanges,
  pruneRemovedUrls
} from './lib/link-check-state.js';

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
  // A protocol-relative URL (`//host/path`) starts with `/` but a browser resolves
  // it as a scheme-relative EXTERNAL link, not a site-local route. Reject it before
  // the single-slash branch so it is neither passed as an internal route here nor
  // missed by the http(s) probe (isWellFormedHttpUrl would also reject it).
  if (value.startsWith('//')) return false;
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
  const recordsById = new Map(records.map((r) => [r.id, r]));
  // archive-entities.json ships its own entity list, and that is the payload
  // fetchEntitiesData()/EntityBrowser actually consume. A map value can resolve
  // in archive-data.json while archive-entities.json has dropped it, so validate
  // against this list too when it is present (absent in the unit fixture -> skip).
  const auxEntityIds = (aux && Array.isArray(aux.entities)) ? new Set(aux.entities.map((e) => e.id)) : null;
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
      // The map lives in archive-entities.json and is consumed from its own entity
      // list, so a value missing there is a dangling reference the entity browser
      // would follow into nothing, even when archive-data.json still has the entity.
      if (auxEntityIds && !auxEntityIds.has(entityRef)) {
        findings.push({
          category: 'internal',
          failureType: 'dangling_record_entity_map_value_aux',
          sourceId: recordId,
          target: entityRef,
          detail: 'recordEntityMap value is not present in archive-entities.json entities'
        });
      }
    }
  }

  // Backlink integrity is two files agreeing: a record's relatedIds (archive-data.json)
  // must equal its recordEntityMap entry (archive-entities.json). Each side can dangle-check
  // clean while they disagree -- INCLUDING when one file drops the entry while the other
  // keeps it -- so compare the UNION of records that carry relatedIds and records that hold
  // a map entry, treating an absent side as the empty set. A map key that is not a record is
  // already reported as a dangling key, so it is left out here.
  const driftIds = new Set();
  for (const r of records) {
    if ((r.relatedIds || []).length) driftIds.add(r.id);
  }
  for (const recordId of Object.keys(recordEntityMap)) {
    if (recordsById.has(recordId)) driftIds.add(recordId);
  }
  for (const recordId of driftIds) {
    const related = new Set(recordsById.get(recordId)?.relatedIds || []);
    const mapped = new Set(recordEntityMap[recordId] || []);
    const equal = related.size === mapped.size && [...related].every((id) => mapped.has(id));
    if (!equal) {
      findings.push({
        category: 'internal',
        failureType: 'record_entity_map_drift',
        sourceId: recordId,
        target: recordId,
        detail: 'record.relatedIds and recordEntityMap entry disagree (cross-file drift between archive-data.json and archive-entities.json)'
      });
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

// The external URLs each FEATURED_WORKS entry hotlinks: its `image` (an
// images.unsplash.com hotlink that a photographer can withdraw, issue #479) and
// its `link`. Both are third-party URLs that rot the same way a record url does,
// and a withdrawn image 404s on a homepage launch card, so they belong in the same
// pre-launch sweep. Returns { id, url } pairs, id tagged with the field so a finding
// names which one to repair. A missing field is emitted with url null (not skipped):
// FeaturedSection renders link/image directly as href=${work.link} / src=${work.image},
// so an absent field ships a card with a broken destination or image, and
// checkFeaturedUrlWellFormedness must fail it rather than let the sweep stay green. A null target
// is not probed for liveness: buildUrlSourceMap drops it, the same as a record with no url.
export function collectFeaturedUrls(featuredWorks) {
  const out = [];
  for (const work of featuredWorks || []) {
    for (const field of ['image', 'link']) {
      out.push({ id: `${work?.id ?? '(unknown)'} (${field})`, url: work?.[field] ?? null });
    }
  }
  return out;
}

// Featured-work urls must be absolute http(s) hotlinks (not site-local routes like a
// record url can be), so a malformed one is a deterministic finding that gates CI,
// the same as a malformed record url. Liveness (a withdrawn-but-well-formed url) is
// the report-only external pass, because network flakiness must not fail a build.
export function checkFeaturedUrlWellFormedness(featuredUrls) {
  const findings = [];
  for (const { id, url } of featuredUrls || []) {
    const missing = url === null || url === undefined;
    if (missing || !isWellFormedHttpUrl(url)) {
      findings.push({
        category: 'featured',
        failureType: 'malformed_featured_url',
        sourceId: id,
        target: url ?? null,
        detail: missing
          ? 'FEATURED_WORKS entry is missing a required image/link field; FeaturedSection renders it directly, so the launch card would have a broken destination or image'
          : 'FEATURED_WORKS image/link is not an absolute http(s) URL'
      });
    }
  }
  return findings;
}

// Every (recordId, url) pair the launched app can navigate to. The record modal
// reads its url from the split archive-details.json (fetchRecordDetails()), not
// from archive-data.json, so a split or stale deploy can leave a dead url in
// details while the core file is clean. Checking only the core file would pass a
// link users still open, so the sweep covers both. Deduped by (id,url): an
// identical pair in both files is one check; a divergent details url is its own
// entry and gets verified. A details entry with no url is "no link", not a broken
// one, so it is skipped; a core record with no url is still flagged downstream.
export function collectUrlRecords(records, details) {
  const seen = new Set();
  const out = [];
  const add = (id, url) => {
    // NUL joins the id and url: it cannot occur in either, so the key is
    // unambiguous where a space or comma could collide. Written as the \u0000
    // escape, not a literal NUL byte, so the source stays plain text for tools.
    const key = `${id}\u0000${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id, url });
  };
  const addLinkified = (id, text) => {
    for (const part of splitUrlsForLinkify(text) || []) {
      if (part.type === 'url') add(id, part.value);
    }
  };
  const addRecordSurfaces = (id, record) => {
    addLinkified(id, record?.summary);
    for (const post of record?.thread_data?.posts || []) {
      // ThreadModal renders this anchor for every post. Preserve a missing value
      // so well-formedness checks flag the same broken href a reader would see.
      add(id, post.url);
      addLinkified(id, post.content);
    }
  };
  for (const r of records || []) {
    add(r.id, r.url);
    addRecordSurfaces(r.id, r);
  }
  for (const [id, d] of Object.entries(details || {})) {
    // The modal merges details over the core record ({ ...record, ...details }), so a
    // url KEY present in details overrides the core url -- even an empty or null value,
    // which hides or breaks the user-facing link. Check any present url (well-formedness
    // flags a bad one); only a MISSING key falls back to core silently, no finding.
    if (d && typeof d === 'object') {
      if (Object.prototype.hasOwnProperty.call(d, 'url')) add(id, d.url);
      addRecordSurfaces(id, d);
    }
  }
  return out;
}

// Map each probeable url back to the record id(s) that carry it. The external
// pass dedups urls, so without this a dead/redirecting url reports sourceId:null
// and the triage output (record id + link + failure type) cannot say which record
// to repair. A url shared by several records keeps all of their ids.
export function buildUrlSourceMap(urlRecords) {
  const map = new Map();
  for (const { id, url } of urlRecords || []) {
    if (!isWellFormedHttpUrl(url)) continue;
    const ids = map.get(url) || [];
    ids.push(id);
    map.set(url, ids);
  }
  return map;
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
// impact); that is a documented limitation, not an oversight. concurrency,
// timeoutMs and delayMs are configurable (CLI: --concurrency, --timeout-ms,
// --delay-ms) rather than fixed, per issue #710's acceptance criteria.
//
// `max` here is only a safety cap, not the progress mechanism (issue #710):
// the caller (main(), via selectEligibleUrls in ./lib/link-check-state.js)
// is expected to already have picked which urls this run should check, using
// a persisted rotating cursor and revisit cadence, so every run advances
// through a different slice of the corpus instead of `[...new
// Set(urls)].slice(0, max)` re-checking the same front slice forever.
//
// maxHostFailures is a per-run circuit breaker: once a host accumulates that
// many consecutive failures/timeouts THIS run, no further probes are sent to
// it for the rest of the run, so one unavailable host cannot burn the whole
// run's time budget (issue #710 acceptance criterion) at the expense of every
// other host's urls. Skipped urls are returned separately from `findings` and
// are NOT considered checked -- the caller must not fold them into the
// persisted per-url state as healthy, since they were never actually probed;
// they simply remain due and get picked up by a later run. Pass 0 to disable
// the breaker entirely.
export async function checkExternalLiveness(urls, opts = {}) {
  const { concurrency = 6, timeoutMs = 10000, delayMs = 150, max = Infinity, sourceMap = null, maxHostFailures = 3 } = opts;
  const targets = [...new Set(urls)].slice(0, max);
  // Record id(s) carrying each url, so a failure names the record(s) to repair.
  const idsFor = (url) => (sourceMap ? sourceMap.get(url) || [] : []);
  const findings = [];
  const skipped = [];
  const hostConsecutiveFailures = new Map();
  const exhaustedHosts = new Set();
  let cursor = 0;
  let nextStart = 0;

  function hostOf(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  function recordHostOutcome(host, failed) {
    if (!host || maxHostFailures <= 0) return;
    if (!failed) {
      hostConsecutiveFailures.delete(host);
      return;
    }
    const count = (hostConsecutiveFailures.get(host) || 0) + 1;
    hostConsecutiveFailures.set(host, count);
    if (count >= maxHostFailures) exhaustedHosts.add(host);
  }

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
      const host = hostOf(url);
      if (host && exhaustedHosts.has(host)) {
        skipped.push(url);
        continue;
      }
      await throttle();
      try {
        const { status, location } = await probe(url, { timeoutMs });
        const failureType = classify(status);
        recordHostOutcome(host, Boolean(failureType));
        if (failureType) {
          const ids = idsFor(url);
          findings.push({ category: 'external', failureType, sourceId: ids[0] ?? null, sourceIds: ids, target: url, status, location: location ?? null, detail: `HTTP ${status}${location ? ` -> ${location}` : ''}` });
        }
      } catch (err) {
        recordHostOutcome(host, true);
        const ids = idsFor(url);
        findings.push({ category: 'external', failureType: 'unreachable_url', sourceId: ids[0] ?? null, sourceIds: ids, target: url, detail: err.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err.message });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return { checked: targets.length - skipped.length, findings, skipped };
}

// ----- external sweep orchestration (issue #710) -----

// Runs one scheduled sweep's worth of external-liveness work against a
// persisted state file: load the last run's state, pick this run's eligible
// urls, probe them, diff and record the results, and save the updated state
// back to disk. Pulled out of main() so the load/select/probe/record/save
// wiring itself is directly testable against a real state file on disk --
// not just the pure functions it calls, hand-threaded, the way earlier tests
// exercised loadState/saveState (never) and selectEligibleUrls/recordResults
// (only by reassigning state.cursor in the test itself).
export async function runExternalLivenessSweep({ featuredUrls, urlRecords, stateFile, max = Infinity, now = Date.now(), liveness = {} }) {
  const sourceMap = buildUrlSourceMap([...featuredUrls, ...urlRecords]);
  const candidateUrls = [...sourceMap.keys()];
  const prevState = loadState(stateFile);

  const corpusChanges = detectCorpusChanges(prevState, candidateUrls);

  // Featured urls are always eligible: they are the launch-critical surface
  // #479 is about (and the only probe that catches a withdrawn-but-well-formed
  // image), so they must never be the ones a rotating tail leaves for later.
  // Everything else is chosen by sweeping forward from the persisted cursor
  // (issue #710) so a capped run advances through a different slice of the
  // corpus each time, instead of always re-checking the same front slice.
  const { selected, nextCursor } = selectEligibleUrls(candidateUrls, prevState, {
    max,
    now,
    alwaysEligible: featuredUrls.map((f) => f.url).filter(Boolean)
  });

  const external = await checkExternalLiveness(selected, { sourceMap, ...liveness });

  // A url the per-host breaker skipped was never actually probed this run, so
  // it must not be folded into the persisted state as healthy -- it stays due
  // and a later run picks it up.
  const skippedSet = new Set(external.skipped);
  const checkedUrls = selected.filter((u) => !skippedSet.has(u));

  const findingsByUrl = new Map(external.findings.map((f) => [f.target, f]));
  const revisit = diffFindings(prevState, checkedUrls, findingsByUrl);

  let nextState = recordResults(prevState, { checkedUrls, findingsByUrl }, now);
  nextState.cursor = nextCursor;
  nextState = pruneRemovedUrls(nextState, candidateUrls);
  saveState(stateFile, nextState);

  return { external, revisit, corpusChanges };
}

// ----- report -----

export function buildReport({ data, internal, url, featured = [], external, revisit = null, corpusChanges = null }) {
  const findings = [...internal, ...url, ...featured, ...(external ? external.findings : [])];
  return {
    generated: new Date().toISOString(),
    dataVersion: data.version ?? null,
    summary: {
      recordsChecked: (data.records || []).length,
      entitiesChecked: (data.entities || []).length,
      internalFailures: internal.length,
      malformedUrls: url.length,
      featuredMalformed: featured.length,
      externalChecked: external ? external.checked : 0,
      // Urls the per-host circuit breaker skipped this run (an unavailable
      // host must not consume the whole run, issue #710) -- not failures,
      // just not-yet-checked; they remain due for a later run.
      externalSkipped: external && external.skipped ? external.skipped.length : 0,
      externalFailures: external ? external.findings.length : 0,
      // issue #710: how this run's external findings compare with the last
      // recorded state, and how the url corpus itself has shifted. Both are
      // null when --external was not requested (no state to compare against).
      revisit: revisit
        ? { new: revisit.new.length, persistent: revisit.persistent.length, recovered: revisit.recovered.length, changed: revisit.changed.length }
        : null,
      corpusChanges: corpusChanges ? { added: corpusChanges.added.length, removed: corpusChanges.removed.length } : null
    },
    revisit,
    corpusChanges,
    findings
  };
}

// ----- CLI -----

function parseArgs(argv) {
  const args = {
    external: false,
    reportOnly: false,
    out: null,
    max: Infinity,
    stateFile: null,
    // Left undefined (not a fixed default here) when the flag is absent, so
    // checkExternalLiveness's own defaults apply -- these are only ever
    // "set" when the caller actually passed the flag.
    concurrency: undefined,
    timeoutMs: undefined,
    delayMs: undefined,
    maxHostFailures: undefined
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--external') args.external = true;
    else if (a === '--report-only') args.reportOnly = true;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--max') args.max = Number(argv[++i]);
    else if (a === '--state-file') args.stateFile = argv[++i];
    else if (a === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (a === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
    else if (a === '--delay-ms') args.delayMs = Number(argv[++i]);
    else if (a === '--max-host-failures') args.maxHostFailures = Number(argv[++i]);
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'archive-data.json'), 'utf-8'));
  const aux = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'archive-entities.json'), 'utf-8'));
  // The record modal reads its url from this split payload, so it is part of the
  // launchable URL surface even though the offline backlink checks only use core.
  const details = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'archive-details.json'), 'utf-8'));

  const internal = checkInternalLinks(data, aux);
  // Well-formedness and liveness cover the core records AND the details payload,
  // deduped by (record, url), so a bad link reachable only through the modal is caught.
  const urlRecords = collectUrlRecords(data.records, details.details);
  const url = checkUrlWellFormedness(urlRecords);
  // The homepage's FEATURED_WORKS cards hotlink third-party image and link URLs (issue #479),
  // a surface the record/details data does not cover. Fold them into the same sweep: a malformed
  // featured url gates CI deterministically, and --external probes their liveness report-only.
  const featuredUrls = collectFeaturedUrls(FEATURED_WORKS);
  const featured = checkFeaturedUrlWellFormedness(featuredUrls);
  let external = null;
  let revisit = null;
  let corpusChanges = null;
  if (args.external) {
    const stateFile = args.stateFile || path.join(DATA_DIR, 'link-check-state.json');
    ({ external, revisit, corpusChanges } = await runExternalLivenessSweep({
      featuredUrls,
      urlRecords,
      stateFile,
      max: args.max,
      liveness: {
        concurrency: args.concurrency,
        timeoutMs: args.timeoutMs,
        delayMs: args.delayMs,
        maxHostFailures: args.maxHostFailures
      }
    }));
  }

  const report = buildReport({ data, internal, url, featured, external, revisit, corpusChanges });
  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  }

  const s = report.summary;
  process.stdout.write(
    `verify-links: ${s.recordsChecked} records, ${s.entitiesChecked} entities\n` +
      `  internal backlink failures: ${s.internalFailures}\n` +
      `  malformed urls: ${s.malformedUrls}\n` +
      `  malformed featured urls: ${s.featuredMalformed}\n` +
      (args.external ? `  external probed: ${s.externalChecked}, failures: ${s.externalFailures}${s.externalSkipped ? `, skipped (host budget): ${s.externalSkipped}` : ''}\n` : '') +
      (s.revisit ? `  revisit: new ${s.revisit.new}, persistent ${s.revisit.persistent}, recovered ${s.revisit.recovered}, changed ${s.revisit.changed}\n` : '') +
      (s.corpusChanges ? `  corpus: +${s.corpusChanges.added} -${s.corpusChanges.removed}\n` : '') +
      (args.out ? `  report written: ${args.out}\n` : '')
  );

  const byType = {};
  for (const f of report.findings) byType[f.failureType] = (byType[f.failureType] || 0) + 1;
  for (const [type, count] of Object.entries(byType)) process.stdout.write(`    ${type}: ${count}\n`);

  const internalFailed = s.internalFailures > 0 || s.malformedUrls > 0 || s.featuredMalformed > 0;
  process.exitCode = internalFailed && !args.reportOnly ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
