import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  formatBlindfoldReport,
  loadBlindfoldScenarios,
  runBlindfoldScenarios
} from '../scripts/okf-blindfold-test.js';

const rootDir = process.cwd();

describe('OKF blindfold test', () => {
  it('has enough scenarios to test real navigation paths', () => {
    const scenarios = loadBlindfoldScenarios({ rootDir });

    assert.ok(scenarios.length >= 5);
    assert.ok(scenarios.every(scenario => scenario.prompt));
    assert.ok(scenarios.every(scenario => scenario.expectedWikiFiles.length > 1));
  });

  it('passes every current scenario from the root wiki index', () => {
    const report = runBlindfoldScenarios({ rootDir });

    assert.equal(report.ok, true, JSON.stringify(report.scenarios.filter(scenario => !scenario.ok), null, 2));
    assert.ok(report.reachableFiles >= report.scenarios.length);
  });

  it('does not let generated reports make scenario targets reachable', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-blindfold-generated-'));
    try {
      const wiki = path.join(tmp, 'wiki');
      fs.mkdirSync(path.join(wiki, 'meta'), { recursive: true });
      fs.mkdirSync(path.join(wiki, 'systems'), { recursive: true });
      fs.writeFileSync(path.join(wiki, 'index.md'), '---\nokf_version: "0.1"\n---\n# test\n\n- [meta/](meta/index.md)\n');
      fs.writeFileSync(path.join(wiki, 'meta', 'index.md'), '# meta\n\n- [Blindfold report](blindfold-test.md)\n');
      fs.writeFileSync(path.join(wiki, 'meta', 'blindfold-test.md'), '# generated\n\nSee [Deploy](../systems/deploy.md).\n');
      fs.writeFileSync(path.join(wiki, 'systems', 'deploy.md'), `---
type: system
title: Deploy
description: Deploy concept.
source: ["test"]
verified: 2026-06-23
tags: [test]
timestamp: 2026-06-23
---

# Deploy

SFTP is required.
`);

      const report = runBlindfoldScenarios({
        rootDir: tmp,
        bundleDir: wiki,
        scenarios: [{
          id: 'generated-only',
          prompt: 'Find deploy.',
          expectedWikiFiles: ['wiki/systems/deploy.md'],
          requiredTerms: ['SFTP'],
          rubric: 'Generated reports should not create the path.'
        }]
      });

      assert.equal(report.ok, false);
      assert.deepEqual(report.scenarios[0].unreachableFiles, ['wiki/systems/deploy.md']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('keeps the committed generated report current', () => {
    const report = runBlindfoldScenarios({ rootDir });
    const expectedMarkdown = formatBlindfoldReport(report);

    assert.equal(fs.readFileSync(path.join(rootDir, 'wiki/meta/blindfold-test.md'), 'utf8'), expectedMarkdown);
  });
});
