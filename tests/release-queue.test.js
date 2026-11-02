import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVE_STATUSES,
  RELEASE_WORKFLOWS,
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

it('fails closed when active queue pagination exceeds its bound', async () => {
  await assert.rejects(listActiveRuns('https://api.github.com', 'example/archive', 'example-token',
    async () => ({ workflow_runs: Array.from({ length: 100 }, () => ({})) })), /exceeds/);
});
