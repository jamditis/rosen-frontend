import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

  it('keeps the committed generated report current', () => {
    const report = runBlindfoldScenarios({ rootDir });
    const expectedMarkdown = formatBlindfoldReport(report);

    assert.equal(fs.readFileSync(path.join(rootDir, 'wiki/meta/blindfold-test.md'), 'utf8'), expectedMarkdown);
  });
});
