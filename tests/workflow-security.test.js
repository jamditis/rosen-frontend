import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const secretBearingWorkflows = [
  '.github/workflows/submit-record.yml',
  '.github/workflows/submit-prototype.yml',
  '.github/workflows/maintenance.yml',
];

test('secret-bearing workflows install root npm dependencies without lifecycle scripts', () => {
  for (const workflowPath of secretBearingWorkflows) {
    const workflow = readFileSync(workflowPath, 'utf8');

    assert.match(
      workflow,
      /run:\s*npm ci --ignore-scripts\b/,
      `${workflowPath} must use npm ci --ignore-scripts so transitive install scripts cannot run before secrets are used`,
    );
  }
});
