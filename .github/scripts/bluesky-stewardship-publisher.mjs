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
const MAX_RECEIPT_RECORDS = 500;

const RELEASE_DATA_PATHS = new Set([
  'data/archive-analytics.json',
  'data/archive-core.json',
  'data/archive-data.json',
  'data/archive-details.json',
  'data/archive-entities.json',
  'data/archive-social-embeddings.bin',
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

  const decisions = status === 'failed' ? [] : report.decisions.slice(0, MAX_RECEIPT_RECORDS);
  const records = decisions.map((decision) => ({
    uri: text(decision.uri),
    decision: decision.decision === 'admit' ? 'accepted' : 'rejected',
    recordId: text(decision.record_id),
  }));
  for (const record of records) {
    if (!JAY_POST_URI.test(record.uri) || !RECORD_ID.test(record.recordId)) {
      throw new Error('receipt record has an invalid Jay Bluesky URI or record ID');
    }
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

/** Testable publication contract used by the workflow's split prepare/deploy/finalize steps. */
export async function runPublicationLifecycle(input, operations) {
  let report;
  let canonicalCommit = input.startCommit;
  let releaseVersion = input.releaseVersion;
  let errorClass;
  let pushed = false;
  try {
    report = validateReport(await operations.capture());
    if (input.dryRun || report.canonical.rows_appended === 0) {
      await operations.verifyLive();
      const receipt = buildIngestionReceipt({
        ...input,
        report,
        canonicalCommit,
        releaseVersion,
        status: 'no_change',
      });
      await operations.sendReceipt(receipt);
      return receipt;
    }

    const prepared = await operations.prepare(report);
    canonicalCommit = prepared.canonicalCommit;
    releaseVersion = prepared.releaseVersion;
    await operations.runChecks();
    const remoteHead = await operations.getRemoteHead();
    if (remoteHead !== input.startCommit) {
      errorClass = 'stale_remote_head';
      throw new Error('origin/main moved after the tested checkout');
    }
    await operations.push();
    pushed = true;
    await operations.deploy();
    await operations.verifyLive();
    const receipt = buildIngestionReceipt({
      ...input,
      report,
      canonicalCommit,
      releaseVersion,
      status: 'published',
    });
    await operations.sendReceipt(receipt);
    return receipt;
  } catch (error) {
    report ??= input.emptyReport;
    const receipt = buildIngestionReceipt({
      ...input,
      report,
      canonicalCommit: pushed ? canonicalCommit : input.startCommit,
      releaseVersion: pushed ? releaseVersion : input.releaseVersion,
      status: 'failed',
      errorClass: errorClass || text(error.errorClass) || (pushed ? 'deploy_failed' : 'publication_failed'),
    });
    await operations.sendReceipt(receipt);
    error.receipt = receipt;
    throw error;
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
    `// ${next}: The automated Bluesky release adds records and links.\n`
      + '// Invalidate older entity payloads when the release reaches returning readers.\n',
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

function changedPaths(root) {
  return git(root, ['status', '--porcelain=v1', '-z'])
    .split('\0')
    .filter(Boolean)
    .map((entry) => entry.slice(3))
    .map((entry) => entry.includes(' -> ') ? entry.split(' -> ')[1] : entry);
}

function stageReleaseCommit(root, browserPaths) {
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
    newest_source_time: now,
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

function prepare(root) {
  const paths = statePaths();
  const state = fs.existsSync(paths.statePath) ? readJson(paths.statePath) : initialState(root);
  try {
    if (git(root, ['status', '--porcelain'])) throw new Error('starting checkout is not clean');
    fs.copyFileSync(path.join(root, 'data/archive-data.json'), paths.baselinePath);
    const adapterArgs = [
      'backend/scripts/bluesky_batch_update.py',
      '--report', paths.reportPath,
      '--snapshot-dir', paths.snapshotDir,
    ];
    const dryRun = process.env.DRY_RUN === 'true';
    if (dryRun) adapterArgs.push('--dry-run');
    run(root, 'python', adapterArgs);
    const report = validateReport(readJson(paths.reportPath));
    state.report = report;

    if (dryRun || report.canonical.rows_appended === 0) {
      run(root, process.execPath, ['.github/scripts/verify-live-deploy.mjs']);
      state.phase = 'no_change';
      state.liveVerified = true;
      writeJson(paths.statePath, state);
      output('has_changes', 'false');
      output('canonical_commit', state.canonicalCommit);
      return;
    }

    const asOf = safeIso(report.captured_at).slice(0, 10);
    run(root, 'npm', ['run', 'refresh:social-release', '--', '--as-of', asOf]);
    run(root, 'npm', ['run', 'build-social-embeddings', '--', '--incremental', '--previous-archive', paths.baselinePath]);

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
    const censusPaths = ['data/stewardship-census.json', 'data/stewardship-census.md'];
    const nonCensus = changedPaths(root).filter((file) => !censusPaths.includes(file));
    if (nonCensus.length > 0) throw new Error(`census changed an unapproved path: ${nonCensus.join(', ')}`);
    if (changedPaths(root).length > 0) {
      run(root, 'git', ['add', '--', ...censusPaths]);
      run(root, 'git', ['commit', '-m', 'docs: refresh stewardship census']);
    }

    run(root, 'npm', ['test']);
    if (git(root, ['status', '--porcelain'])) throw new Error('final tested tree is not clean');
    git(root, ['fetch', 'origin', 'main']);
    const fetchedHead = git(root, ['rev-parse', 'origin/main']);
    if (fetchedHead !== state.startCommit) {
      const error = new Error('origin/main moved after the tested checkout');
      error.errorClass = 'stale_remote_head';
      throw error;
    }
    run(root, 'git', ['push', 'origin', 'HEAD:main']);
    state.phase = 'pushed';
    state.canonicalCommit = git(root, ['rev-parse', 'HEAD']);
    state.releaseVersion = nextVersion;
    state.errorClass = null;
    writeJson(paths.statePath, state);
    output('has_changes', 'true');
    output('canonical_commit', state.canonicalCommit);
  } catch (error) {
    state.phase = 'failed';
    state.errorClass = text(error.errorClass) || 'prepare_failed';
    writeJson(paths.statePath, state);
    output('has_changes', 'false');
    throw error;
  }
}

function finalize(root) {
  const paths = statePaths();
  const state = fs.existsSync(paths.statePath) ? readJson(paths.statePath) : initialState(root);
  const deployOutcome = text(process.env.DEPLOY_OUTCOME);
  const verifyOutcome = text(process.env.VERIFY_OUTCOME);
  let status = 'failed';
  let errorClass = state.errorClass || 'workflow_failed';

  if (state.phase === 'no_change' && state.liveVerified) {
    status = 'no_change';
    errorClass = null;
  } else if (state.phase === 'pushed' && deployOutcome === 'success' && verifyOutcome === 'success') {
    status = 'published';
    errorClass = null;
  } else if (state.phase === 'pushed') {
    errorClass = deployOutcome === 'success' ? 'live_verification_failed' : 'deploy_failed';
  }

  const receipt = buildIngestionReceipt({
    runId: `${process.env.GITHUB_RUN_ID || 'local'}_${process.env.GITHUB_RUN_ATTEMPT || '1'}`,
    status,
    checkedAt: new Date().toISOString(),
    canonicalCommit: state.canonicalCommit,
    releaseVersion: state.releaseVersion,
    report: state.report,
    errorClass: errorClass || undefined,
  });
  writeJson(paths.receiptPath, receipt);
  output('status', receipt.status);
  output('error_class', receipt.errorClass || '');
  output('receipt_path', paths.receiptPath);
  console.log(`Stewardship receipt ready: ${receipt.status} at ${receipt.canonicalCommit}.`);
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const command = process.argv[2];
  if (command === 'init') {
    const { statePath } = statePaths();
    writeJson(statePath, initialState(root));
    return;
  }
  if (command === 'prepare') return prepare(root);
  if (command === 'finalize') return finalize(root);
  throw new Error('usage: bluesky-stewardship-publisher.mjs init|prepare|finalize');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`Bluesky stewardship publisher: ${error.message}`);
    process.exitCode = 1;
  }
}

