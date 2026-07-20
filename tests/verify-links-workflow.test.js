import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowUrl = new URL('../.github/workflows/verify-external-links.yml', import.meta.url);

describe('scheduled external link verification (#558)', () => {
  it('runs the report-only external sweep on a schedule and by hand', () => {
    assert.ok(fs.existsSync(workflowUrl), 'external-link workflow is missing');
    const workflow = fs.readFileSync(workflowUrl, 'utf8');
    assert.match(workflow, /schedule:/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /verify-links[^\n]*--external[^\n]*--out\s+verify-links-report\.json/);
  });

  it('retains the report as an artifact even if an offline integrity check fails', () => {
    const workflow = fs.readFileSync(workflowUrl, 'utf8');
    assert.match(workflow, /if:\s*always\(\)/);
    assert.match(workflow, /actions\/upload-artifact@/);
    assert.match(workflow, /path:\s*verify-links-report\.json/);
  });
});
