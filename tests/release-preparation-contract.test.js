import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { publishChangedRelease } from '../.github/scripts/bluesky-stewardship-publisher.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('real preparation CLI and publisher preserve reports, versions and final Git state', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'release-contract-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const remote = path.join(temporary, 'remote.git');
  const root = path.join(temporary, 'work');
  const runtime = path.join(temporary, 'runtime');
  const bin = path.join(temporary, 'bin');
  fs.mkdirSync(runtime);
  fs.mkdirSync(bin);
  const env = { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', RUNNER_TEMP: runtime,
    PATH: bin + path.delimiter + process.env.PATH,
    ROSEN_RELEASE_CONTRACT_LOG: path.join(temporary, 'commands.jsonl') };
  // Descendant test runners must start outside the parent Node test context.
  delete env.NODE_TEST_CONTEXT;
  const execute = (command, args, cwd = repository) => execFileSync(command, args, {
    cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024,
  }).trim();
  const git = (args, cwd = root) => execute('git', args, cwd);
  const starting = git(['rev-parse', 'HEAD'], repository);
  // Independent object stores keep local push verification self-contained.
  git(['clone', '--quiet', '--bare', '--no-local', repository, remote], repository);
  git(['update-ref', 'refs/heads/main', starting], remote);
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'], remote);
  git(['clone', '--quiet', '--no-local', remote, root], repository);
  git(['config', 'user.name', 'Joe Amditis']);
  git(['config', 'user.email', '6799804+jamditis@users.noreply.github.com']);
  fs.symlinkSync(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  fs.appendFileSync(path.join(root, '.git/info/exclude'), '\nnode_modules\n');

  // Keep canonical records unchanged and replace model/export commands.
  // Report reads, version guards, census generation/checks and Git run for real.
  // This contract does not test vector inference or publication of a new row.
  fs.writeFileSync(path.join(bin, 'npm'), `#!/usr/bin/env node
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.ROSEN_RELEASE_CONTRACT_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'run' && args[1] === 'refresh:social-release') {
  const report = JSON.parse(fs.readFileSync(args[args.indexOf('--report') + 1], 'utf8'));
  if (report.schema_version !== 1) throw new Error('missing source report contract');
} else if (args[0] === 'run' && ['build-embeddings', 'build-social-embeddings'].includes(args[1])) {
  // The fixture keeps canonical data unchanged; the current vectors stay valid.
} else if (args[0] === 'run' && args[1] === 'census:stewardship') {
  execFileSync(process.execPath, ['scripts/build-stewardship-census.mjs'], { stdio: 'inherit' });
} else if (args[0] === 'test') {
  execFileSync(process.execPath, ['--test', 'tests/stewardship-census.test.js'], { stdio: 'inherit' });
} else { throw new Error('unexpected release command: ' + JSON.stringify(args)); }
`, { mode: 0o755 });

  const before = JSON.parse(fs.readFileSync(path.join(root, 'version.json'))).version;
  const pathsReport = path.join(runtime, 'paths.json');
  execute(process.execPath, ['.github/scripts/bluesky-stewardship-publisher.mjs', 'prepare-record-release', pathsReport], root);
  const prepared = JSON.parse(fs.readFileSync(pathsReport));
  assert.ok(prepared.paths.includes('version.json'));
  assert.ok(prepared.paths.includes('frontend/services/cacheConfig.js'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(runtime, 'bluesky-batch-report.json'))).schema_version, 1);
  git(['add', '--', ...prepared.paths]);
  git(['commit', '-qm', 'Record prepared fixture version']);
  git(['push', '--quiet', 'origin', 'HEAD:main']);

  const state = { startCommit: git(['rev-parse', 'HEAD']) };
  const report = JSON.parse(fs.readFileSync(path.join(runtime, 'bluesky-batch-report.json')));
  const previousEnvironment = { PATH: process.env.PATH, ROSEN_RELEASE_CONTRACT_LOG: process.env.ROSEN_RELEASE_CONTRACT_LOG,
    NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT };
  Object.assign(process.env, { PATH: env.PATH, ROSEN_RELEASE_CONTRACT_LOG: env.ROSEN_RELEASE_CONTRACT_LOG });
  delete process.env.NODE_TEST_CONTEXT;
  let result;
  try {
    result = publishChangedRelease(root, {
      reportPath: path.join(runtime, 'bluesky-batch-report.json'),
      baselinePath: path.join(runtime, 'archive-data-baseline.json'),
    }, state, report);
  } finally {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  const expected = before.split('.').map(Number);
  expected[2] += 2;
  assert.equal(result.releaseVersion, expected.join('.'));
  assert.equal(result.canonicalCommit, git(['rev-parse', 'refs/heads/main'], remote));
  assert.equal(git(['status', '--porcelain']), '');
  const commands = fs.readFileSync(env.ROSEN_RELEASE_CONTRACT_LOG, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(commands.some(args => args[1] === 'build-embeddings'));
  assert.ok(commands.findIndex(args => args[1] === 'census:stewardship') < commands.findIndex(args => args[0] === 'test'));
});
