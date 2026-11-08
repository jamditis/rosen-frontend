#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

export const ACTIVE_STATUSES = Object.freeze([
  'requested',
  'queued',
  'pending',
  'waiting',
  'in_progress',
]);

export const RELEASE_WORKFLOWS = Object.freeze([
  '.github/workflows/bluesky-stewardship.yml',
  '.github/workflows/pressthink-stewardship.yml',
  '.github/workflows/publisher-feeds-stewardship.yml',
  '.github/workflows/deploy.yml',
  '.github/workflows/submit-record.yml',
  '.github/workflows/submit-prototype.yml',
]);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// A re-run attempt keeps its original run id but starts again at the re-run
// time, so the queue orders by the start of the current attempt and uses the
// run id only to break ties or when a timestamp is missing.
function attemptStartedAt(run) {
  const started = Date.parse(run?.run_started_at || run?.created_at || '');
  return Number.isNaN(started) ? null : started;
}

export function compareReleaseRuns(left, right) {
  const leftStarted = attemptStartedAt(left);
  const rightStarted = attemptStartedAt(right);
  if (leftStarted !== null && rightStarted !== null && leftStarted !== rightStarted) {
    return leftStarted - rightStarted;
  }
  return Number(left.id) - Number(right.id);
}

export function findBlockingRuns(runs, currentRun) {
  const active = new Set(ACTIVE_STATUSES);
  const releasePaths = new Set(RELEASE_WORKFLOWS);
  const currentId = Number(typeof currentRun === 'object' ? currentRun?.id : currentRun);
  const current = typeof currentRun === 'object' && currentRun
    ? currentRun
    : runs.find((run) => Number(run.id) === currentId) || { id: currentId };

  return runs
    .filter((run) =>
      Number(run.id) !== currentId &&
      compareReleaseRuns(run, current) < 0 &&
      active.has(run.status) &&
      releasePaths.has(run.path),
    )
    .sort(compareReleaseRuns);
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`GitHub Actions query failed (${response.status}): ${body}`);
  }
  return response.json();
}

export async function listActiveRuns(apiUrl, repository, token, get = fetchJson) {
  const runs = [];
  for (const status of ACTIVE_STATUSES) {
    for (let page = 1; page <= 10; page += 1) {
      const url = new URL(`${apiUrl}/repos/${repository}/actions/runs`);
      url.searchParams.set('per_page', '100');
      url.searchParams.set('exclude_pull_requests', 'true');
      url.searchParams.set('status', status);
      url.searchParams.set('page', String(page));
      const payload = await get(url, token);
      if (!Array.isArray(payload.workflow_runs)) throw new Error('Invalid active release query');
      runs.push(...payload.workflow_runs);
      if (payload.workflow_runs.length < 100) break;
      if (page === 10) throw new Error('Active release queue exceeds its reviewed bound');
    }
  }
  return runs;
}

/** Resolve this run's own record, so its attempt start time orders the queue. */
export async function currentReleaseRun(apiUrl, repository, token, runId, runs, get = fetchJson) {
  const listed = runs.find((run) => Number(run.id) === Number(runId));
  if (listed) return listed;
  const run = await get(new URL(`${apiUrl}/repos/${repository}/actions/runs/${runId}`), token);
  if (Number(run?.id) !== Number(runId)) throw new Error('Invalid current release run query');
  return run;
}

export async function waitForReleaseTurn({
  apiUrl,
  repository,
  token,
  runId,
  pollMilliseconds = 15_000,
  maxPollMilliseconds = 300_000,
  timeoutMilliseconds = 18_000_000,
}) {
  const started = Date.now();
  let lastBlocker = '';
  let nextPollMilliseconds = pollMilliseconds;

  while (true) {
    // Query active states so unrelated recent CI cannot hide an older writer.
    // Back off to five minutes while the same older run remains active.
    const runs = await listActiveRuns(apiUrl, repository, token);
    const current = await currentReleaseRun(apiUrl, repository, token, runId, runs);
    const blockers = findBlockingRuns(runs, current);
    if (blockers.length === 0) {
      console.log(`Release turn acquired for run ${runId}.`);
      return;
    }

    const blocker = blockers[0];
    const description = `${blocker.id} (${blocker.name || blocker.path}, ${blocker.status})`;
    if (description !== lastBlocker) {
      console.log(`Waiting for older release run ${description}.`);
      lastBlocker = description;
      nextPollMilliseconds = pollMilliseconds;
    }
    if (Date.now() - started >= timeoutMilliseconds) {
      throw new Error(`Timed out waiting for older release run ${description}.`);
    }
    await sleep(nextPollMilliseconds);
    nextPollMilliseconds = Math.min(nextPollMilliseconds * 2, maxPollMilliseconds);
  }
}

async function main() {
  const required = ['GITHUB_API_URL', 'GITHUB_REPOSITORY', 'GITHUB_TOKEN', 'GITHUB_RUN_ID'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  await waitForReleaseTurn({
    apiUrl: process.env.GITHUB_API_URL,
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    runId: process.env.GITHUB_RUN_ID,
    timeoutMilliseconds: Number(process.env.RELEASE_QUEUE_TIMEOUT_SECONDS || 18000) * 1000,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
