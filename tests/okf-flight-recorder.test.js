import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildFlightRecorderInventory,
  formatFlightRecorderJson,
  formatFlightRecorderMarkdown
} from '../scripts/okf-flight-recorder.js';

const rootDir = process.cwd();

describe('OKF flight recorder', () => {
  it('builds a typed inventory with drift-risk labels for every concept', () => {
    const inventory = buildFlightRecorderInventory({ rootDir });

    assert.equal(inventory.schemaVersion, 1);
    assert.ok(inventory.summary.concepts >= 30);
    assert.equal(inventory.concepts.length, inventory.summary.concepts);
    assert.ok(inventory.concepts.every(concept => concept.driftRisk));
    assert.ok(inventory.concepts.every(concept => concept.freshness?.badge));
    assert.ok(inventory.concepts.every(concept => concept.localGraph?.defaultHops === 1));
    assert.ok(inventory.concepts.every(concept => Array.isArray(concept.outboundLinks)));
    assert.equal(inventory.graphPolicy.globalView, 'filterable opt-in');
    assert.ok(inventory.summary.totalInternalLinks > 0);
  });

  it('flags known high-change project surfaces as high drift', () => {
    const inventory = buildFlightRecorderInventory({ rootDir });
    const highDriftPaths = new Set(
      inventory.concepts
        .filter(concept => concept.driftRisk === 'high')
        .map(concept => concept.path)
    );

    assert.ok(highDriftPaths.has('wiki/project/launch-status.md'));
    assert.ok(highDriftPaths.has('wiki/systems/deploy-and-hosting.md'));
    assert.ok(highDriftPaths.has('wiki/systems/cache-and-versioning.md'));
  });

  it('keeps the committed generated inventory current', () => {
    const inventory = buildFlightRecorderInventory({ rootDir });
    const expectedJson = formatFlightRecorderJson(inventory);
    const expectedMarkdown = formatFlightRecorderMarkdown(inventory);

    assert.equal(fs.readFileSync(path.join(rootDir, 'wiki/meta/bundle-inventory.json'), 'utf8'), expectedJson);
    assert.equal(fs.readFileSync(path.join(rootDir, 'wiki/meta/bundle-inventory.md'), 'utf8'), expectedMarkdown);
  });
});
