import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('documentation truth', () => {
  it('does not hard-code the changing test-file inventory in CLAUDE.md', () => {
    const guide = fs.readFileSync(path.join(rootDir, 'CLAUDE.md'), 'utf8');
    const inventoryLines = guide
      .split('\n')
      .filter((line) => line.includes('tests/') && /test suite|suite under/i.test(line));

    assert.ok(inventoryLines.length > 0, 'CLAUDE.md must still describe the tests/ suite');

    for (const pattern of [
      /\b\d[\d,]*\s+\*\.test\.js files?\b/i,
      /\b\d[\d,]*\s+test files?\b/i,
      /\b\d[\d,]*\s+runnable\/support files?\b/i,
    ]) {
      for (const line of inventoryLines) {
        assert.doesNotMatch(
          line,
          pattern,
          'CLAUDE.md must describe the test suite without a count that drifts whenever coverage changes',
        );
      }
    }
  });

  it('lists every real .github/workflows/*.yml file in CLAUDE.md, with a matching count', () => {
    const guide = fs.readFileSync(path.join(rootDir, 'CLAUDE.md'), 'utf8');
    const workflowsDir = path.join(rootDir, '.github', 'workflows');
    const realWorkflows = fs
      .readdirSync(workflowsDir)
      .filter((name) => name.endsWith('.yml'))
      .sort();

    for (const name of realWorkflows) {
      assert.ok(
        guide.includes(name),
        `CLAUDE.md's workflow list is missing ${name}, which exists in .github/workflows/`,
      );
    }

    const countMatch = guide.match(/CI\/CD \((\d+) workflows\)/);
    assert.ok(countMatch, 'CLAUDE.md must state the workflow count as "CI/CD (N workflows)"');
    assert.strictEqual(
      Number(countMatch[1]),
      realWorkflows.length,
      'CLAUDE.md\'s stated workflow count must match the number of files in .github/workflows/',
    );
  });

  it('does not point agents at the nonexistent backend/tools/backfill/ path', () => {
    const backfillWorker = path.join(rootDir, 'backend', 'scripts', 'backfill', 'backfill_worker.py');
    assert.ok(fs.existsSync(backfillWorker), 'backend/scripts/backfill/backfill_worker.py must exist');

    for (const docPath of [
      'CLAUDE.md',
      path.join('docs', 'agent-personas', 'data-pipeline-engineer.md'),
    ]) {
      const contents = fs.readFileSync(path.join(rootDir, docPath), 'utf8');
      assert.doesNotMatch(
        contents,
        /tools\/backfill\/backfill_worker\.py/,
        `${docPath} must not reference the nonexistent backend/tools/backfill/ path`,
      );
    }
  });

  it('does not document --field flags for backfill_worker.py, which takes no arguments', () => {
    const skillPath = path.join(rootDir, '.claude', 'skills', 'data-pipeline.md');
    const contents = fs.readFileSync(skillPath, 'utf8');
    assert.doesNotMatch(
      contents,
      /backfill_worker\.py\s+--field/,
      '.claude/skills/data-pipeline.md must not document --field flags backfill_worker.py does not implement',
    );

    const workerSource = fs.readFileSync(
      path.join(rootDir, 'backend', 'scripts', 'backfill', 'backfill_worker.py'),
      'utf8',
    );
    assert.doesNotMatch(
      workerSource,
      /argparse/,
      'this test assumes backfill_worker.py takes no CLI arguments; update the doc assertion above if it grows a parser',
    );
  });
});
