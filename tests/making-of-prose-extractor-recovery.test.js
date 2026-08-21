import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'scripts', 'extract-making-of-prose.py');

it('drops stale prose state when malformed markup closes the container', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'making-of-recovery-'));
  const sourcePath = path.join(directory, 'making-of.html');
  const markdownPath = path.join(directory, 'making-of.md');
  const mapPath = path.join(directory, 'anchor-map.json');

  try {
    fs.writeFileSync(sourcePath, `
      <article class="chapter">
        <span class="ch-ref">Chapter 1</span>
        <h2>Chapter title</h2>
        <p class="ch-date">July 2026</p>
        <div class="prose"><span><p>Inside prose.</p></div>
        <p>Outside prose.</p>
      </article>
    `);

    execFileSync('python3', [script, sourcePath, markdownPath, mapPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    const anchorMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    assert.equal(anchorMap['C1.P1'].text, 'Inside prose.');
    assert.equal(anchorMap['C1.P2'], undefined);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
