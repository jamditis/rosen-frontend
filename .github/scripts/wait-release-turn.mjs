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
  '.github/workflows/deploy.yml',
  '.github/workflows/submit-record.yml',
  '.github/workflows/submit-prototype.yml',
]);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function findBlockingRuns(runs, currentRunId) {
  const active = new Set(ACTIVE_STATUSES);
  const releasePaths = new Set(RELEASE_WORKFLOWS);
  const current = Number(currentRunId);

  return runs
    .filter((run) =>
      Number(run.id) < current &&
      active.has(run.status) &&
      releasePaths.has(run.path),
    )
    .sort((left, right) => Number(left.id) - Number(right.id));
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

async function listRecentRuns(apiUrl, repository, token) {
  const url = new URL(`${apiUrl}/repos/${repository}/actions/runs`);
  url.searchParams.set('per_page', '100');
  url.searchParams.set('exclude_pull_requests', 'true');
  const payload = await fetchJson(url, token);
  return payload.workflow_runs || [];
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
    // One repository-wide query per poll keeps a backlog within the Actions
    // token budget. The interval backs off to five minutes while the same older
    // run remains active, then resets when the head of the queue changes.
    const runs = await listRecentRuns(apiUrl, repository, token);
    const blockers = findBlockingRuns(runs, runId);
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
