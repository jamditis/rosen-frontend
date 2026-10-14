#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { applyVersion } from '../../scripts/bump-version.mjs';

const RECEIPT_STATUSES = new Set(['published', 'no_change', 'failed']);
const ERROR_CLASS = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SHA = /^[0-9a-f]{40}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;
const RECORD_ID = /^BSKY-\d{5,}$/;
const JAY_POST_URI = /^at:\/\/did:plc:3t37x6vfigdzzp2gjcfnzlz4\/app\.bsky\.feed\.post\/[A-Za-z0-9._~:-]+$/;
const MAX_REPORT_RECORDS = 1_000;
const RECEIPT_ENDPOINT = 'https://rosen-source-discovery.jamditis.workers.dev/ingestion-receipt';

const RELEASE_DATA_PATHS = new Set([
  'data/archive-analytics.json',
  'data/archive-core.json',
  'data/archive-data.json',
  'data/archive-details.json',
  'data/archive-entities.json',
  'data/archive-social-embeddings.bin',
  'data/archive-social-embeddings-build.json',
  'data/archive-social-embeddings.json',
  'data/graph-validation-holds.json',
  'data/relationship-adjacency-manifest.json',
  'data/relationship-review-report.json',
  'data/relationship-type-registry.json',
  'data/search-index.json',
  'data/social-search-index.json',
  'data/social_posts.csv',
]);

function text(value) {
  return value == null ? '' : String(value).trim();
}

function run(root, command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: options.encoding ?? 'utf8',
    stdio: options.stdio ?? 'inherit',
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function git(root, args) {
  return text(run(root, 'git', args, { stdio: ['ignore', 'pipe', 'inherit'] }));
}

function gitRaw(root, args) {
  return run(root, 'git', args, { stdio: ['ignore', 'pipe', 'inherit'] });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function safeIso(value, fallback) {
  const candidate = text(value) || fallback;
  const timestamp = Date.parse(candidate);
  if (Number.isNaN(timestamp)) {
    throw new Error(`invalid receipt timestamp: ${candidate || '(empty)'}`);
  }
  return new Date(timestamp).toISOString();
}

function validateReport(report) {
  if (!report || report.schema_version !== 1 || !report.counts || !report.canonical) {
    throw new Error('Bluesky batch report does not match schema version 1');
  }
  for (const key of ['captured', 'admitted', 'context_only']) {
    if (!Number.isSafeInteger(report.counts[key]) || report.counts[key] < 0) {
      throw new Error(`Bluesky batch report has invalid ${key} count`);
    }
  }
  if (report.counts.admitted + report.counts.context_only !== report.counts.captured) {
    throw new Error('Bluesky batch report decision counts do not add up');
  }
  if (!Number.isSafeInteger(report.canonical.rows_appended) || report.canonical.rows_appended < 0) {
    throw new Error('Bluesky batch report has invalid rows_appended count');
  }
  if (!Array.isArray(report.decisions)) throw new Error('Bluesky batch report has no decisions array');
  if (report.decisions.length > MAX_REPORT_RECORDS) {
    throw new Error(`Bluesky batch report exceeds the ${MAX_REPORT_RECORDS}-record safety bound`);
  }
  if (report.decisions.length !== report.counts.captured) {
    throw new Error('Bluesky batch report decision rows do not match the captured count');
  }
  if (report.decisions.some((decision) => !['admit', 'context_only'].includes(decision.decision))) {
    throw new Error('Bluesky batch report has an invalid decision');
  }
  return report;
}

export function buildIngestionReceipt({
  runId,
  status,
  checkedAt,
  canonicalCommit,
  releaseVersion,
  report,
  errorClass,
}) {
  validateReport(report);
  if (!RUN_ID.test(text(runId))) throw new Error('receipt runId is invalid');
  if (!RECEIPT_STATUSES.has(status)) throw new Error(`invalid receipt status: ${status}`);
  if (!SHA.test(canonicalCommit)) throw new Error('receipt canonicalCommit must be a 40-character SHA');
  if (!SEMVER.test(releaseVersion)) throw new Error('receipt releaseVersion must be semver');
  if (errorClass && !ERROR_CLASS.test(errorClass)) throw new Error('receipt errorClass must be a safe slug');

  const decisions = status === 'failed' ? [] : report.decisions;
  const records = decisions.map((decision) => ({
    uri: text(decision.uri),
    decision: decision.decision === 'admit' ? 'accepted' : 'rejected',
    recordId: text(decision.record_id),
  }));
  const recordUris = new Set();
  const recordIds = new Set();
  for (const record of records) {
    if (!JAY_POST_URI.test(record.uri) || !RECORD_ID.test(record.recordId)) {
      throw new Error('receipt record has an invalid Jay Bluesky URI or record ID');
    }
    if (recordUris.has(record.uri) || recordIds.has(record.recordId)) {
      throw new Error('receipt records must have unique URIs and record IDs');
    }
    recordUris.add(record.uri);
    recordIds.add(record.recordId);
  }

  const receipt = {
    version: 1,
    runId: text(runId),
    status,
    checkedAt: safeIso(checkedAt),
    canonicalCommit,
    releaseVersion,
    captured: report.counts.captured,
    admitted: report.counts.admitted,
    contextOnly: report.counts.context_only,
    sourceLatestAt: report.newest_source_time ? safeIso(report.newest_source_time) : null,
    records,
  };
  if (errorClass) receipt.errorClass = errorClass;
  return receipt;
}

export async function postFailedReceipt(payload, token, {
  fetchFn = globalThis.fetch,
  sleepFn = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (payload?.status !== 'failed' || !Array.isArray(payload.records) || payload.records.length) {
    throw new Error('failure reporting requires a failed receipt with no record decisions');
  }
  if (!text(token)) throw new Error('ROSEN_INGESTION_RECEIPT_TOKEN is required');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetchFn(RECEIPT_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      if (attempt === 2) throw new Error('failed receipt delivery exhausted network retries');
      await sleepFn(1_000 * (2 ** attempt));
      continue;
    }
    await response.body?.cancel();
    if (response.ok) return;
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`failed receipt delivery refused HTTP ${response.status}`);
    }
    if (attempt === 2) throw new Error(`failed receipt delivery exhausted retries: HTTP ${response.status}`);
    const retryAfter = response.headers.get('Retry-After');
    let seconds = retryAfter ? Number(retryAfter) : Number.NaN;
    if (retryAfter && !Number.isFinite(seconds)) seconds = (Date.parse(retryAfter) - Date.now()) / 1_000;
    await sleepFn(Number.isFinite(seconds)
      ? Math.min(Math.max(seconds, 0), 30) * 1_000
      : 1_000 * (2 ** attempt));
  }
}

function incrementPatch(version) {
  if (!SEMVER.test(version)) throw new Error(`release version is not semver: ${version}`);
  const [major, minor, patchVersion] = version.split('.').map(Number);
  return `${major}.${minor}.${patchVersion + 1}`;
}

function incrementDataCache(root) {
  const versionPath = path.join(root, 'version.json');
  const cachePath = path.join(root, 'frontend/services/cacheConfig.js');
  const version = readJson(versionPath);
  const match = /^v(\d+)$/.exec(text(version.cache_version));
  if (!match) throw new Error(`invalid data cache version: ${version.cache_version}`);
  const next = `v${Number(match[1]) + 1}`;
  const before = fs.readFileSync(cachePath, 'utf8');
  let after = before.replace(
    /export const CACHE_VERSION = 'v\d+';/,
    `export const CACHE_VERSION = '${next}';`,
  );
  after = after.replace(
    /\/\/ v\d+:.*\n(?:\/\/ .*\n)?/,
    `// ${next}: Archive payload changes require fresh client-side data caches.\n`,
  );
  if (after === before) throw new Error('frontend data cache version marker was not found');
  version.cache_version = next;
  fs.writeFileSync(versionPath, `${JSON.stringify(version, null, 2)}\n`);
  fs.writeFileSync(cachePath, after);
  return ['version.json', 'frontend/services/cacheConfig.js'];
}

function isReleaseDataPath(file) {
  return RELEASE_DATA_PATHS.has(file)
    || /^data\/relationship-adjacency-[0-9a-f]\.json$/.test(file)
    || file.startsWith('data/feeds/');
}

export function changedPaths(root) {
  const entries = gitRaw(root, ['status', '--porcelain=v1', '-z']).split('\0');
  const paths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    if (entry.length < 4 || entry[2] !== ' ') {
      throw new Error('git status returned an invalid porcelain record');
    }
    const status = entry.slice(0, 2);
    const file = entry.slice(3);
    if (status.includes('R') || status.includes('C')) {
      throw new Error(`publication does not allow renamed or copied paths: ${file}`);
    }
    paths.push(file);
  }
  return paths;
}

export function stageReleaseCommit(root, browserPaths) {
  const allowed = new Set(browserPaths);
  for (const file of changedPaths(root)) {
    if (!allowed.has(file) && !isReleaseDataPath(file)) {
      throw new Error(`publication changed an unapproved path: ${file}`);
    }
  }
  const toStage = [...new Set([...browserPaths, ...RELEASE_DATA_PATHS])]
    .filter((file) => fs.existsSync(path.join(root, file)))
    .filter((file) => git(root, ['status', '--porcelain=v1', '--', file]));
  const feedPaths = changedPaths(root).filter((file) => file.startsWith('data/feeds/'));
  const adjacencyPaths = changedPaths(root).filter((file) => /^data\/relationship-adjacency-[0-9a-f]\.json$/.test(file));
  const explicitPaths = [...new Set([...toStage, ...feedPaths, ...adjacencyPaths])].sort();
  if (explicitPaths.length === 0) throw new Error('publication produced no release changes');
  run(root, 'git', ['add', '--', ...explicitPaths]);
  run(root, 'git', ['commit', '-m', 'data: publish Bluesky stewardship update']);
}

export function stageCensusCommit(root) {
  const censusPaths = ['data/stewardship-census.json', 'data/stewardship-census.md'];
  const changes = changedPaths(root);
  const nonCensus = changes.filter((file) => !censusPaths.includes(file));
  if (nonCensus.length > 0) {
    throw new Error(`census changed an unapproved path: ${nonCensus.join(', ')}`);
  }
  if (changes.length > 0) {
    run(root, 'git', ['add', '--', ...censusPaths]);
    run(root, 'git', ['commit', '-m', 'docs: refresh stewardship census']);
  }
}

function configureJoeIdentity(root) {
  run(root, 'git', ['config', 'user.name', 'Joe Amditis']);
  run(root, 'git', ['config', 'user.email', '6799804+jamditis@users.noreply.github.com']);
}

function statePaths() {
  const temporaryRoot = process.env.RUNNER_TEMP;
  if (!temporaryRoot || !path.isAbsolute(temporaryRoot)) {
    throw new Error('RUNNER_TEMP must be an absolute path');
  }
  return {
    temporaryRoot,
    reportPath: path.join(temporaryRoot, 'bluesky-batch-report.json'),
    snapshotDir: path.join(temporaryRoot, 'bluesky-source-snapshot'),
    baselinePath: path.join(temporaryRoot, 'archive-data-baseline.json'),
    statePath: path.join(temporaryRoot, 'bluesky-stewardship-state.json'),
    receiptPath: path.join(temporaryRoot, 'ingestion-receipt.json'),
  };
}

function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function emptyReport(now) {
  return {
    schema_version: 1,
    captured_at: now,
    newest_source_time: null,
    counts: { captured: 0, admitted: 0, context_only: 0 },
    canonical: { rows_appended: 0 },
    decisions: [],
  };
}

function initialState(root) {
  const now = new Date().toISOString();
  return {
    version: 1,
    phase: 'initialized',
    startCommit: git(root, ['rev-parse', 'HEAD']),
    canonicalCommit: git(root, ['rev-parse', 'HEAD']),
    releaseVersion: readJson(path.join(root, 'version.json')).version,
    report: emptyReport(now),
    errorClass: null,
    liveVerified: false,
  };
}

function emitPreparationOutputs(state, emit) {
  emit('has_changes', state.phase === 'pushed' ? 'true' : 'false');
  emit('needs_deploy', ['pushed', 'recovery_ready'].includes(state.phase) ? 'true' : 'false');
  emit('mode', state.phase);
  emit('canonical_commit', state.canonicalCommit);
}

/** The preparation state machine used directly by the CLI and its regression tests. */
export function runPreparation({
  dryRun,
  state,
  capture,
  verifyLive,
  publishChangedRelease,
  validateRecoveryRelease,
  persist,
  emit = () => {},
}) {
  state.dryRun = dryRun;
  try {
    const report = validateReport(capture());
    state.report = report;

    if (dryRun) {
      verifyLive();
      state.phase = 'dry_run';
      state.liveVerified = true;
    } else if (report.canonical.rows_appended === 0) {
      try {
        verifyLive();
        state.phase = 'no_change';
        state.liveVerified = true;
      } catch (liveError) {
        validateRecoveryRelease(liveError);
        state.phase = 'recovery_ready';
        state.liveVerified = false;
      }
    } else {
      const release = publishChangedRelease(report);
      state.phase = 'pushed';
      state.canonicalCommit = release.canonicalCommit;
      state.releaseVersion = release.releaseVersion;
      state.liveVerified = false;
    }

    state.errorClass = null;
    persist(state);
    emitPreparationOutputs(state, emit);
    return state;
  } catch (error) {
    state.phase = dryRun ? 'dry_run_failed' : 'failed';
    state.errorClass = text(error.errorClass) || (dryRun ? 'dry_run_failed' : 'prepare_failed');
    persist(state);
    emitPreparationOutputs(state, emit);
    throw error;
  }
}

function captureBatch(root, paths, dryRun) {
  if (git(root, ['status', '--porcelain'])) throw new Error('starting checkout is not clean');
  fs.copyFileSync(path.join(root, 'data/archive-data.json'), paths.baselinePath);
  const adapterArgs = [
    'backend/scripts/bluesky_batch_update.py',
    '--report', paths.reportPath,
    '--snapshot-dir', paths.snapshotDir,
    '--overlap-hours', '2160',
  ];
  if (dryRun) adapterArgs.push('--dry-run');
  run(root, 'python', adapterArgs);
  return readJson(paths.reportPath);
}

function assertRemoteHeadUnchanged(root, startCommit, gitCommand = git) {
  gitCommand(root, ['fetch', 'origin', 'main']);
  if (gitCommand(root, ['rev-parse', 'origin/main']) !== startCommit) {
    const error = new Error('origin/main moved after the tested checkout');
    error.errorClass = 'stale_remote_head';
    throw error;
  }
}

export function validateRecoveryRelease(root, state, {
  execute = run,
  gitCommand = git,
} = {}) {
  if (gitCommand(root, ['status', '--porcelain'])) {
    throw new Error('zero-row recovery checkout contains uncommitted changes');
  }
  execute(root, 'npm', ['test']);
  if (gitCommand(root, ['status', '--porcelain'])) {
    throw new Error('recovery tests changed the checkout');
  }
  assertRemoteHeadUnchanged(root, state.startCommit, gitCommand);
}

function publishChangedRelease(root, paths, state, report) {
  const asOf = safeIso(report.captured_at).slice(0, 10);
  run(root, 'npm', [
    'run', 'refresh:social-release', '--', '--as-of', asOf,
    '--report', paths.reportPath,
  ]);
  run(root, 'npm', [
    'run', 'build-social-embeddings', '--', '--incremental',
    '--previous-archive', paths.baselinePath,
  ]);

  const currentVersion = readJson(path.join(root, 'version.json')).version;
  const nextVersion = incrementPatch(currentVersion);
  const stamped = applyVersion(root, {
    argVersion: nextVersion,
    verify: () => run(root, process.execPath, ['--test', 'tests/version-consistency.test.js']),
  });
  const browserPaths = [...stamped.changedFiles, ...incrementDataCache(root)];

  run(root, 'npm', ['test']);
  configureJoeIdentity(root);
  stageReleaseCommit(root, browserPaths);

  if (git(root, ['status', '--porcelain'])) throw new Error('release commit left uncommitted changes');
  run(root, 'npm', ['run', 'census:stewardship']);
  stageCensusCommit(root);

  run(root, 'npm', ['test']);
  if (git(root, ['status', '--porcelain'])) throw new Error('final tested tree is not clean');
  assertRemoteHeadUnchanged(root, state.startCommit);
  run(root, 'git', ['push', 'origin', 'HEAD:main']);
  return {
    canonicalCommit: git(root, ['rev-parse', 'HEAD']),
    releaseVersion: nextVersion,
  };
}

function prepare(root) {
  const paths = statePaths();
  const state = fs.existsSync(paths.statePath) ? readJson(paths.statePath) : initialState(root);
  const dryRun = process.env.DRY_RUN === 'true';
  return runPreparation({
    dryRun,
    state,
    capture: () => captureBatch(root, paths, dryRun),
    verifyLive: () => run(root, process.execPath, ['.github/scripts/verify-live-deploy.mjs']),
    publishChangedRelease: (report) => publishChangedRelease(root, paths, state, report),
    validateRecoveryRelease: () => validateRecoveryRelease(root, state),
    persist: (nextState) => writeJson(paths.statePath, nextState),
    emit: output,
  });
}

export function finalizePublication(state, {
  deployOutcome,
  verifyOutcome,
  runId,
  checkedAt,
}) {
  if (state.phase === 'dry_run' || state.phase === 'dry_run_failed') {
    return {
      status: state.phase,
      errorClass: state.errorClass || null,
      receipt: null,
    };
  }

  let status = 'failed';
  let errorClass = state.errorClass || 'workflow_failed';

  if (state.phase === 'no_change' && state.liveVerified) {
    status = 'no_change';
    errorClass = null;
  } else if (
    ['pushed', 'recovery_ready'].includes(state.phase)
    && deployOutcome === 'success'
    && verifyOutcome === 'success'
  ) {
    status = 'published';
    errorClass = null;
  } else if (['pushed', 'recovery_ready'].includes(state.phase)) {
    errorClass = deployOutcome === 'success' ? 'live_verification_failed' : 'deploy_failed';
  }

  const receipt = buildIngestionReceipt({
    runId,
    status,
    checkedAt,
    canonicalCommit: state.canonicalCommit,
    releaseVersion: state.releaseVersion,
    report: state.report,
    errorClass: errorClass || undefined,
  });
  return { status, errorClass, receipt };
}

function finalize(root) {
  const paths = statePaths();
  const state = fs.existsSync(paths.statePath) ? readJson(paths.statePath) : initialState(root);
  const result = finalizePublication(state, {
    deployOutcome: text(process.env.DEPLOY_OUTCOME),
    verifyOutcome: text(process.env.VERIFY_OUTCOME),
    runId: `${process.env.GITHUB_RUN_ID || 'local'}_${process.env.GITHUB_RUN_ATTEMPT || '1'}`,
    checkedAt: new Date().toISOString(),
  });
  if (result.receipt) {
    writeJson(paths.receiptPath, result.receipt);
  } else if (fs.existsSync(paths.receiptPath)) {
    fs.rmSync(paths.receiptPath);
  }
  output('status', result.status);
  output('error_class', result.errorClass || '');
  output('receipt_path', result.receipt ? paths.receiptPath : '');
  console.log(result.receipt
    ? `Stewardship receipt ready: ${result.status} at ${result.receipt.canonicalCommit}.`
    : `Stewardship ${result.status}; no ingestion receipt will be sent.`);
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const command = process.argv[2];
  if (command === 'init') {
    const { statePath } = statePaths();
    writeJson(statePath, initialState(root));
    return;
  }
  if (command === 'prepare') return prepare(root);
  if (command === 'finalize') return finalize(root);
  if (command === 'send-failed-receipt') {
    await postFailedReceipt(readJson(process.argv[3]), process.env.ROSEN_INGESTION_RECEIPT_TOKEN);
    console.log('Failed ingestion receipt accepted.');
    return;
  }
  throw new Error('usage: bluesky-stewardship-publisher.mjs init|prepare|finalize|send-failed-receipt');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(`Bluesky stewardship publisher: ${error.message}`);
    process.exitCode = 1;
  }
}

