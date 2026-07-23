import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVE_STATUSES,
  RELEASE_WORKFLOWS,
  findBlockingRuns,
} from '../.github/scripts/wait-release-turn.mjs';

describe('release workflow queue', () => {
  it('waits for every older active release workflow in run-id order', () => {
    const runs = [
      { id: 105, status: 'queued', path: '.github/workflows/deploy.yml' },
      { id: 104, status: 'in_progress', path: '.github/workflows/submit-record.yml' },
      { id: 103, status: 'waiting', path: '.github/workflows/submit-prototype.yml' },
      { id: 102, status: 'completed', path: '.github/workflows/deploy.yml' },
      { id: 101, status: 'queued', path: '.github/workflows/ci.yml' },
      { id: 106, status: 'queued', path: '.github/workflows/deploy.yml' },
    ];

    assert.deepEqual(
      findBlockingRuns(runs, 105).map(({ id }) => id),
      [103, 104],
    );
  });

  it('tracks every GitHub active state and the three release workflows', () => {
    assert.deepEqual(
      [...ACTIVE_STATUSES],
      ['requested', 'queued', 'pending', 'waiting', 'in_progress'],
    );
    assert.deepEqual(
      [...RELEASE_WORKFLOWS],
      [
        '.github/workflows/deploy.yml',
        '.github/workflows/submit-record.yml',
        '.github/workflows/submit-prototype.yml',
      ],
    );
  });
});
