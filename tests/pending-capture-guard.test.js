/**
 * JS CSV writers respect the capture journal (state machine map follow-up 13).
 *
 * A crashed PressThink or publisher-feed capture leaves
 * preservation/<source>/versions.jsonl.pending.json. Its recovery rolls the CSV
 * forward only when the CSV still matches the recorded bytes, so a CSV write
 * in between blocks every RECORD-* writer. The Python writers refuse to write
 * while a journal is pending (backend/scripts/record_id_sequence.py); the JS
 * writers must refuse too.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guardPath = path.join(rootDir, 'data', 'lib', 'pending-capture.js');
const bridgePath = path.join(rootDir, 'data', 'lib', 'python-csv-maintenance.js');
const fixesDir = path.join(rootDir, 'data', 'fixes');

let tree;
let csvPath;

beforeEach(() => {
  tree = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-capture-'));
  fs.mkdirSync(path.join(tree, 'data'));
  csvPath = path.join(tree, 'data', 'archive_records-public.csv');
  fs.writeFileSync(csvPath, 'id,title\nRECORD-00001,First\n');
});

afterEach(() => {
  fs.rmSync(tree, { recursive: true, force: true });
});

function leavePendingJournal(source) {
  const dir = path.join(tree, 'preservation', source);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'versions.jsonl.pending.json'), '{}');
}

describe('pending capture guard', () => {
  it('allows a write with no pending journal', async () => {
    const { assertNoPendingCapture } = await import(guardPath);
    assert.doesNotThrow(() => assertNoPendingCapture(csvPath));
  });

  for (const source of ['pressthink', 'publisher-feeds']) {
    it(`refuses a write while the ${source} journal is pending`, async () => {
      const { assertNoPendingCapture } = await import(guardPath);
      leavePendingJournal(source);
      assert.throws(() => assertNoPendingCapture(csvPath), /Recover the pending source transaction/);
    });
  }

  it('makes the Python bridge refuse to render while a journal is pending', () => {
    leavePendingJournal('pressthink');
    const result = spawnSync(process.execPath, [bridgePath, 'render', csvPath], {
      input: JSON.stringify([['id', 'title'], [{ id: 'RECORD-00001', title: 'Changed' }]]),
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, 'render must fail');
    assert.match(result.stderr, /Recover the pending source transaction/);
    assert.equal(result.stdout, '', 'no rendered bytes reach the Python writer');
  });

  it('lets the Python bridge read while a journal is pending', () => {
    leavePendingJournal('pressthink');
    const result = spawnSync(process.execPath, [bridgePath, 'read', csvPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });

  it('guards every write in the data/fixes JS scripts', () => {
    const scripts = fs.readdirSync(fixesDir).filter(name => name.endsWith('.js'));
    for (const name of scripts) {
      const source = fs.readFileSync(path.join(fixesDir, name), 'utf-8');
      const writes = source.split('\n').filter(line => /\bwriteFileSync\(/.test(line));
      if (writes.length === 0) continue;
      assert.match(source, /from '\.\.\/lib\/pending-capture\.js'/, `${name} imports the guard`);
      const lines = source.split('\n');
      lines.forEach((line, index) => {
        if (!/\bwriteFileSync\(/.test(line)) return;
        const window = lines.slice(Math.max(0, index - 6), index).join('\n');
        assert.match(window, /assertNoPendingCapture\(/, `${name}:${index + 1} checks the journal before writing`);
      });
    }
  });
});
