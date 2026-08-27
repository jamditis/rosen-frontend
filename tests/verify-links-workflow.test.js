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
    assert.match(workflow, /verify-links[^\n]*--external[^\n]*--report-only/);
    assert.match(workflow, /verify-links[^\n]*--max\s+3000[^\n]*--out\s+verify-links-report\.json/);
  });

  it('retains the report as an artifact even if an offline integrity check fails', () => {
    const workflow = fs.readFileSync(workflowUrl, 'utf8');
    assert.match(workflow, /if:\s*always\(\)/);
    assert.match(workflow, /actions\/upload-artifact@/);
    assert.match(workflow, /path:\s*verify-links-report\.json/);
  });
});

describe('durable link-check progress across scheduled runs (#710)', () => {
  it('carries a persisted state file into the sweep instead of only a short-lived Actions artifact', () => {
    const workflow = fs.readFileSync(workflowUrl, 'utf8');
    assert.match(workflow, /verify-links[^\n]*--state-file\s+data\/link-check-state\.json/);
  });

  it('has write access and commits the advanced state back to main', () => {
    const workflow = fs.readFileSync(workflowUrl, 'utf8');
    assert.match(workflow, /permissions:\s*\n\s*contents:\s*write/);
    assert.match(workflow, /git add data\/link-check-state\.json/);
    assert.match(workflow, /git commit -m/);
    assert.match(workflow, /git push origin HEAD:main/);
  });

  it('stages the file before diffing, so an untracked state file is not mistaken for "no change"', () => {
    // git diff --quiet against an untracked path always exits 0 ("no
    // difference"), which is exactly the bug that left the fix inert: the
    // guard must diff the STAGED state (after `git add`), not the working
    // tree, so a brand-new tracked-for-the-first-time file is still seen as
    // a change to commit.
    const workflow = fs.readFileSync(workflowUrl, 'utf8');
    const addIndex = workflow.indexOf('git add data/link-check-state.json');
    const diffIndex = workflow.indexOf('git diff --cached --quiet -- data/link-check-state.json');
    assert.notEqual(addIndex, -1, 'workflow must stage the state file');
    assert.notEqual(diffIndex, -1, 'workflow must diff the STAGED (--cached) state, not the working tree');
    assert.ok(addIndex < diffIndex, '`git add` must run before the `--cached` diff guard');
  });

  it('retries the push with a rebase instead of losing this run\'s cursor on a non-fast-forward rejection', () => {
    // main can advance between checkout and push (another merge, another
    // scheduled workflow); a bare `git push` with no retry throws away this
    // run's advanced cursor and per-url cadence on a rejected push.
    const workflow = fs.readFileSync(workflowUrl, 'utf8');
    assert.match(workflow, /git fetch origin main/);
    assert.match(workflow, /git rebase origin\/main/);
  });
});
