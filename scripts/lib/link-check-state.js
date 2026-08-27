// Durable progress tracker for the external-link liveness sweep (issue #710).
//
// The bug this replaces: scripts/verify-links.js selected liveness targets
// with `[...new Set(urls)].slice(0, max)`. Every capped scheduled run started
// at the same front slice of the deduped url list, so anything past index
// `max` was never checked by any run. This module gives the sweep durable,
// resumable progress instead:
//
//   - a persisted rotating cursor (see ./rotating-cursor.js) sweeps forward
//     through the full url list each run, wrapping around, so a bounded run
//     eventually reaches every url instead of looping on the same prefix
//   - a per-url revisit cadence, so a healthy url is rechecked far less often
//     than a failing one (faster recovery detection) without spending budget
//     re-checking urls that were just confirmed fine
//   - enough history per url (last status, redirect destination, failure
//     streak, first/last-seen times) to diff one run's findings against the
//     last one: new / persistent / recovered / changed
//
// The state is a plain JSON object, meant to be committed to the repo (see
// .github/workflows/verify-external-links.yml) rather than kept only in a
// short-lived Actions artifact -- a scheduled run needs last week's cursor
// and per-url cadence to know what is already due, and an artifact with a
// retention window is not durable history.

import fs from 'node:fs';
import { advanceCursor } from './rotating-cursor.js';

export const STATE_VERSION = 1;

// Revisit intervals per status bucket. A live url is the least likely to have
// changed, so it is rechecked the least often; a failing url is rechecked
// soonest so a recovery (or a firm, repeated failure worth reporting) shows
// up quickly; a redirect sits in between, since a redirect destination can
// drift without the status ever becoming an outright failure.
export const DEFAULT_REVISIT_INTERVALS_MS = {
  ok: 7 * 24 * 60 * 60 * 1000, // 7 days
  redirect: 3 * 24 * 60 * 60 * 1000, // 3 days
  failing: 24 * 60 * 60 * 1000 // 1 day
};

export function createEmptyState() {
  return { version: STATE_VERSION, cursor: 0, urls: {} };
}

export function loadState(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.urls !== 'object' || parsed.urls === null) {
      return createEmptyState();
    }
    return { version: STATE_VERSION, cursor: Number.isInteger(parsed.cursor) ? parsed.cursor : 0, urls: parsed.urls };
  } catch {
    // Missing file (first-ever run) or corrupt JSON: start clean rather than
    // fail the whole sweep over a durable-state read.
    return createEmptyState();
  }
}

export function saveState(filePath, state) {
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

// failureType is whatever scripts/verify-links.js's classify() produced
// (null for a healthy 2xx, or one of redirect_url/client_error_url/
// server_error_url/unreachable_url). Collapsing that into three cadence
// buckets keeps the revisit-interval table small and the diff categories
// (new/persistent/recovered/changed) well-defined.
export function classifyStatusBucket(failureType) {
  if (!failureType) return 'ok';
  if (failureType === 'redirect_url') return 'redirect';
  return 'failing';
}

export function isDue(entry, now = Date.now(), intervals = DEFAULT_REVISIT_INTERVALS_MS) {
  if (!entry || !entry.lastCheckedAt) return true;
  const bucket = entry.lastStatus && intervals[entry.lastStatus] != null ? entry.lastStatus : 'ok';
  const interval = intervals[bucket];
  const last = Date.parse(entry.lastCheckedAt);
  if (Number.isNaN(last)) return true;
  return now - last >= interval;
}

// Pick this run's liveness targets: every `alwaysEligible` url (e.g. the
// homepage's featured-work hotlinks, which must never be starved by the
// tail), plus enough of the remaining corpus to fill `max`, chosen by
// sweeping forward from the persisted cursor so different runs cover
// different ground and, given enough runs, the whole corpus. A url in the
// swept range that is not yet due is skipped without spending budget, so a
// url just confirmed healthy does not crowd out one still waiting its first
// check.
export function selectEligibleUrls(allUrls, state, opts = {}) {
  const { max = Infinity, now = Date.now(), alwaysEligible = [], intervals = DEFAULT_REVISIT_INTERVALS_MS } = opts;

  // A stable sort order is what makes the cursor's numeric offset meaningful
  // from one run to the next -- insertion order can shift as records are
  // added or removed between runs, but the sorted order only shifts locally
  // around whatever changed.
  const sorted = [...new Set(allUrls)].sort();
  const alwaysSet = new Set(alwaysEligible.filter((u) => sorted.includes(u)));
  const always = sorted.filter((u) => alwaysSet.has(u)).slice(0, max);
  const rotatable = sorted.filter((u) => !alwaysSet.has(u));

  const urlState = (state && state.urls) || {};
  let budget = Math.max(0, max - always.length);
  const selected = [...always];

  const cursor = Number.isInteger(state?.cursor) ? state.cursor : 0;
  let nextCursor = cursor;

  if (rotatable.length > 0 && budget > 0) {
    const total = rotatable.length;
    let index = ((cursor % total) + total) % total;
    // Sweep at most once fully around the rotatable list per run: past that,
    // nothing left is due, and looping further would just spin.
    for (let seen = 0; seen < total && budget > 0; seen++) {
      const url = rotatable[index];
      if (isDue(urlState[url], now, intervals)) {
        selected.push(url);
        budget--;
      }
      index = (index + 1) % total;
    }
    nextCursor = index;
  }

  return { selected, nextCursor };
}

// Fold this run's findings into the state: last status/failure/redirect
// target, a consecutive-failure streak (reset on recovery), and first/last
// seen timestamps. `findingsByUrl` maps a checked url to its finding (as
// pushed by checkExternalLiveness) when it failed or redirected; a checked
// url absent from the map came back healthy.
export function recordResults(state, { checkedUrls, findingsByUrl }, now = Date.now()) {
  const base = state && typeof state === 'object' ? state : createEmptyState();
  const nextUrls = { ...(base.urls || {}) };
  const nowIso = new Date(now).toISOString();

  for (const url of checkedUrls || []) {
    const finding = findingsByUrl instanceof Map ? findingsByUrl.get(url) : undefined;
    const failureType = finding ? finding.failureType : null;
    const bucket = classifyStatusBucket(failureType);
    const prev = nextUrls[url];
    nextUrls[url] = {
      firstSeenAt: prev?.firstSeenAt ?? nowIso,
      lastCheckedAt: nowIso,
      lastStatus: bucket,
      lastFailureType: failureType,
      lastHttpStatus: finding?.status ?? null,
      lastLocation: finding?.location ?? null,
      consecutiveFailures: bucket === 'failing' ? (prev?.consecutiveFailures ?? 0) + 1 : 0
    };
  }

  return { version: STATE_VERSION, cursor: base.cursor ?? 0, urls: nextUrls };
}

// Compare this run's results against the PREVIOUS state (before recordResults
// folds them in) to produce the four report categories issue #710 asks for.
// "Failing" here means the classifyStatusBucket() bucket, not any single
// failureType, so e.g. a 404 this week and a timeout last week still counts
// as persistent -- the url is still down, just for a different reason.
export function diffFindings(prevState, checkedUrls, findingsByUrl) {
  const diff = { new: [], persistent: [], recovered: [], changed: [] };
  const prevUrls = (prevState && prevState.urls) || {};

  for (const url of checkedUrls || []) {
    const prev = prevUrls[url] || null;
    const finding = findingsByUrl instanceof Map ? findingsByUrl.get(url) : undefined;
    const currentBucket = classifyStatusBucket(finding ? finding.failureType : null);
    const prevBucket = prev ? prev.lastStatus : null;
    const currentLocation = finding?.location ?? null;

    if (currentBucket === 'failing') {
      if (prevBucket === 'failing') diff.persistent.push(url);
      else diff.new.push(url);
    } else if (prevBucket === 'failing') {
      diff.recovered.push(url);
    } else if (prev && (prevBucket !== currentBucket || (currentBucket === 'redirect' && prev.lastLocation !== currentLocation))) {
      diff.changed.push(url);
    }
  }

  return diff;
}

// Urls new to the corpus since the last recorded state (a record was added,
// or gained a link) and urls dropped from it (a record was removed, or its
// url changed) -- issue #710's "detect URL additions, removals, and
// changes". Report-only: pruning the dropped entries out of the saved state
// is the caller's call to make when it writes the file back.
export function detectCorpusChanges(prevState, currentUrls) {
  const prevUrls = new Set(Object.keys((prevState && prevState.urls) || {}));
  const currentSet = new Set(currentUrls || []);
  const added = [...currentSet].filter((u) => !prevUrls.has(u)).sort();
  const removed = [...prevUrls].filter((u) => !currentSet.has(u)).sort();
  return { added, removed };
}

// Drop state entries for urls no longer in the current corpus, so the
// committed state file does not grow forever as records are edited or
// removed over the life of the archive.
export function pruneRemovedUrls(state, currentUrls) {
  const currentSet = new Set(currentUrls || []);
  const nextUrls = {};
  for (const [url, entry] of Object.entries((state && state.urls) || {})) {
    if (currentSet.has(url)) nextUrls[url] = entry;
  }
  return { version: STATE_VERSION, cursor: state?.cursor ?? 0, urls: nextUrls };
}
