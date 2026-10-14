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
      .filter((name) => /\.ya?ml$/.test(name))
      .sort();

    // Anchor the scan to the .github/workflows/ tree block itself, not the
    // whole file — a filename mentioned elsewhere in prose (e.g. in the
    // "Preview audit" section) must not satisfy this check.
    const lines = guide.split('\n');
    const headerIndex = lines.findIndex((line) => line.includes('.github/workflows/'));
    assert.ok(headerIndex !== -1, 'CLAUDE.md must have a .github/workflows/ tree entry');

    const treeBlockLines = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
      if (/^│\s+[├└]──/.test(lines[i])) {
        treeBlockLines.push(lines[i]);
      } else {
        break;
      }
    }
    const treeBlock = treeBlockLines.join('\n');

    for (const name of realWorkflows) {
      assert.ok(
        treeBlock.includes(name),
        `CLAUDE.md's .github/workflows/ tree block is missing ${name}, which exists in .github/workflows/`,
      );
    }

    const countMatch = lines[headerIndex].match(/CI\/CD \((\d+) workflows\)/);
    assert.ok(countMatch, 'CLAUDE.md must state the workflow count as "CI/CD (N workflows)" on the tree entry line');
    assert.strictEqual(
      Number(countMatch[1]),
      realWorkflows.length,
      'CLAUDE.md\'s stated workflow count must match the number of files in .github/workflows/',
    );
  });

  it('does not point agents at the nonexistent backend/tools/ path', () => {
    const backfillWorker = path.join(rootDir, 'backend', 'scripts', 'backfill', 'backfill_worker.py');
    assert.ok(fs.existsSync(backfillWorker), 'backend/scripts/backfill/backfill_worker.py must exist');
    assert.ok(!fs.existsSync(path.join(rootDir, 'backend', 'tools')), 'backend/tools/ must not exist');

    for (const docPath of [
      'CLAUDE.md',
      path.join('docs', 'agent-personas', 'data-pipeline-engineer.md'),
    ]) {
      const contents = fs.readFileSync(path.join(rootDir, docPath), 'utf8');
      assert.doesNotMatch(
        contents,
        /tools\/(backfill|diagnostics)\//,
        `${docPath} must not reference the nonexistent backend/tools/ path`,
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
      /\bimport\s+argparse\b|\bArgumentParser\(/,
      'this test assumes backfill_worker.py takes no CLI arguments; update the doc assertion above if it grows a parser',
    );
  });

  it('keeps active backend commands aligned with the maintained Poetry entry points', () => {
    const activeGuides = [
      'AGENTS.md',
      'CLAUDE.md',
      path.join('.claude', 'skills', 'archive-validation.md'),
      path.join('.claude', 'skills', 'data-pipeline.md'),
      path.join('backend', 'docs', 'RATE_LIMITING.md'),
      path.join('docs', 'agent-personas', 'contributor-guide.md'),
      path.join('docs', 'agent-personas', 'data-pipeline-engineer.md'),
      path.join('docs', 'narrative', 'data-pipeline.md'),
    ];
    const guidance = activeGuides
      .map((docPath) => fs.readFileSync(path.join(rootDir, docPath), 'utf8'))
      .join('\n');

    for (const backendPathParts of [
      ['src', 'rosen_scraper', 'workflow.py'],
      ['src', 'rosen_scraper', 'categorizer.py'],
      ['scripts', 'diagnostics', 'data_deduper.py'],
      ['scripts', 'extract_entities_csv_batch.py'],
      ['scripts', 'validate_archive_data.py'],
    ]) {
      const nativeBackendPath = path.join(...backendPathParts);
      const documentedBackendPath = path.posix.join(...backendPathParts);
      const relativePath = path.join('backend', nativeBackendPath);
      assert.ok(fs.existsSync(path.join(rootDir, relativePath)), `${relativePath} must exist`);
      assert.ok(
        guidance.includes(documentedBackendPath),
        `active backend guidance must name ${documentedBackendPath}`,
      );
      assert.equal(
        documentedBackendPath,
        backendPathParts.join('/'),
        'documented paths must use portable POSIX separators',
      );
      assert.equal(
        path.win32.join(...backendPathParts).replaceAll('\\', '/'),
        documentedBackendPath,
        'Windows filesystem paths must normalize to the documented POSIX path',
      );
    }

    assert.doesNotMatch(guidance, /\bsrc\/workflow\.py\b/);
    assert.doesNotMatch(guidance, /\btools\/diagnostics\/data_deduper\.py\b/);
    assert.doesNotMatch(guidance, /\bscripts\/validate_schema\.py\b/);

    const skill = fs.readFileSync(
      path.join(rootDir, '.claude', 'skills', 'data-pipeline.md'),
      'utf8',
    );
    assert.doesNotMatch(skill, /workflow\.py\s+--(?:retry-failed|ids|incremental)\b/);
    assert.doesNotMatch(skill, /extract_entities_csv_batch\.py\s+--(?:workers|missing-only)\b/);
    assert.doesNotMatch(skill, /categorizer\.py\s+--(?:batch-size|delay)\b/);
    assert.doesNotMatch(skill, /python -m venv|pip install poetry|source venv\/bin\/activate/);
    assert.match(skill, /poetry run playwright install/);
    assert.doesNotMatch(skill, /^\s*playwright install\s*$/m);
    assert.match(skill, /csv\/urls_to_scrape\.csv/);
    assert.match(skill, /id,url,processed_on,Notes/);
    assert.match(skill, /csv\/archive_records-public\.csv/);

    for (const sourcePath of [
      path.join('backend', 'src', 'rosen_scraper', 'workflow.py'),
      path.join('backend', 'src', 'rosen_scraper', 'categorizer.py'),
    ]) {
      const source = fs.readFileSync(path.join(rootDir, sourcePath), 'utf8');
      assert.doesNotMatch(source, /\bimport\s+argparse\b|\bArgumentParser\(/);
    }

    const extractor = fs.readFileSync(
      path.join(rootDir, 'backend', 'scripts', 'extract_entities_csv_batch.py'),
      'utf8',
    );
    const longOptions = [...extractor.matchAll(/parser\.add_argument\(\s*['"](--[^'"]+)/g)]
      .map((match) => match[1]);
    assert.deepEqual(longOptions, ['--yes']);
  });
});
