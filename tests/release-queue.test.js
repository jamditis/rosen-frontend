import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVE_STATUSES,
  RELEASE_WORKFLOWS,
  currentReleaseRun,
  findBlockingRuns,
  listActiveRuns,
} from '../.github/scripts/wait-release-turn.mjs';

describe('release workflow queue', () => {
  it('waits for every older active release workflow in run-id order', () => {
    const runs = [
      { id: 105, status: 'queued', path: '.github/workflows/deploy.yml' },
      { id: 104, status: 'in_progress', path: '.github/workflows/submit-record.yml' },
      { id: 103, status: 'waiting', path: '.github/workflows/submit-prototype.yml' },
      { id: 100, status: 'requested', path: '.github/workflows/bluesky-stewardship.yml' },
      { id: 102, status: 'completed', path: '.github/workflows/deploy.yml' },
      { id: 101, status: 'queued', path: '.github/workflows/ci.yml' },
      { id: 106, status: 'queued', path: '.github/workflows/deploy.yml' },
    ];

    assert.deepEqual(
      findBlockingRuns(runs, 105).map(({ id }) => id),
      [100, 103, 104],
    );
  });

  it('tracks every GitHub active state and all release workflows', () => {
    assert.deepEqual(
      [...ACTIVE_STATUSES],
      ['requested', 'queued', 'pending', 'waiting', 'in_progress'],
    );
    assert.deepEqual(
      [...RELEASE_WORKFLOWS],
      [
        '.github/workflows/bluesky-stewardship.yml',
        '.github/workflows/pressthink-stewardship.yml',
        '.github/workflows/publisher-feeds-stewardship.yml',
        '.github/workflows/deploy.yml',
        '.github/workflows/submit-record.yml',
        '.github/workflows/submit-prototype.yml',
      ],
    );
  });
});


it('finds an older writer beyond the first page of active runs', async () => {
  const calls = [];
  const get = async url => {
    calls.push(url.toString());
    if (url.searchParams.get('status') !== 'in_progress') return { workflow_runs: [] };
    return { workflow_runs: url.searchParams.get('page') === '1'
      ? Array.from({ length: 100 }, (_, i) => ({ id: 1000 + i, status: 'in_progress', path: '.github/workflows/ci.yml' }))
      : [{ id: 10, status: 'in_progress', path: '.github/workflows/pressthink-stewardship.yml' }] };
  };
  const runs = await listActiveRuns('https://api.github.com', 'example/archive', 'example-token', get);
  assert.deepEqual(findBlockingRuns(runs, 20).map(run => run.id), [10]);
  assert.equal(calls.length, ACTIVE_STATUSES.length + 1);
});

it('makes a re-run of an old release wait for a newer run that started first', () => {
  // A re-run keeps its original run id but restarts at the re-run time.
  const runs = [
    { id: 50, status: 'in_progress', path: '.github/workflows/deploy.yml',
      created_at: '2026-11-07T10:00:00Z', run_started_at: '2026-11-08T12:30:00Z' },
    { id: 90, status: 'in_progress', path: '.github/workflows/submit-record.yml',
      created_at: '2026-11-08T12:00:00Z', run_started_at: '2026-11-08T12:00:00Z' },
  ];

  assert.deepEqual(findBlockingRuns(runs, 50).map(({ id }) => id), [90]);
  assert.deepEqual(findBlockingRuns(runs, 90).map(({ id }) => id), []);
});

it('orders blockers by attempt start time, breaking ties by run id', () => {
  const at = '2026-11-08T12:00:00Z';
  const runs = [
    { id: 70, status: 'queued', path: '.github/workflows/deploy.yml', run_started_at: '2026-11-08T11:00:00Z' },
    { id: 30, status: 'queued', path: '.github/workflows/deploy.yml', run_started_at: '2026-11-08T11:30:00Z' },
    { id: 40, status: 'queued', path: '.github/workflows/deploy.yml', run_started_at: at },
    { id: 60, status: 'queued', path: '.github/workflows/deploy.yml', run_started_at: at },
    { id: 50, status: 'in_progress', path: '.github/workflows/deploy.yml', run_started_at: at },
  ];

  assert.deepEqual(findBlockingRuns(runs, 50).map(({ id }) => id), [70, 30, 40]);
});

it('looks up the current run when the active listing does not include it', async () => {
  const current = {
    id: 50, status: 'in_progress', path: '.github/workflows/deploy.yml',
    run_started_at: '2026-11-08T12:30:00Z',
  };
  const newer = {
    id: 90, status: 'in_progress', path: '.github/workflows/submit-record.yml',
    run_started_at: '2026-11-08T12:00:00Z',
  };
  const get = async url => (url.pathname.endsWith('/actions/runs/50')
    ? current
    : { workflow_runs: url.searchParams.get('status') === 'in_progress' ? [newer] : [] });
  const runs = await listActiveRuns('https://api.github.com', 'example/archive', 'example-token', get);
  const resolved = await currentReleaseRun('https://api.github.com', 'example/archive', 'example-token', 50, runs, get);
  assert.equal(resolved.run_started_at, current.run_started_at);
  assert.deepEqual(findBlockingRuns(runs, resolved).map(({ id }) => id), [90]);
});

it('fails closed when active queue pagination exceeds its bound', async () => {
  await assert.rejects(listActiveRuns('https://api.github.com', 'example/archive', 'example-token',
    async () => ({ workflow_runs: Array.from({ length: 100 }, () => ({})) })), /exceeds/);
});
