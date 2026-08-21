/**
 * Dependency migration and accepted-risk contract for issues #395 and #804.
 *
 * The embeddings builder is build-time only, but its abandoned Xenova package
 * pinned a permanently vulnerable ONNX/protobuf chain. These checks keep the
 * maintained successor, its lockfile graph, and the temporary upstream-blocked
 * risk exception from silently regressing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
const riskRegister = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'docs', 'security', 'accepted-risks.json'), 'utf8'),
);
const builderSource = fs.readFileSync(path.join(rootDir, 'data/lib/embeddings-builder.js'), 'utf8');

function lockedPackages(name) {
  return Object.entries(packageLock.packages)
    .filter(([packagePath]) => (
      packagePath === `node_modules/${name}` || packagePath.endsWith(`/node_modules/${name}`)
    ))
    .map(([packagePath, details]) => ({ packagePath, ...details }));
}

function versionAtLeast(version, floor) {
  const parts = (value) => value.split('-')[0].split('.').map(Number);
  const actual = parts(version);
  const minimum = parts(floor);
  for (let index = 0; index < Math.max(actual.length, minimum.length); index += 1) {
    const left = actual[index] || 0;
    const right = minimum[index] || 0;
    if (left !== right) return left > right;
  }
  return true;
}

describe('Transformers.js v4 migration (#395)', () => {
  it('uses the maintained Hugging Face v4 package in source and manifests', () => {
    assert.match(packageJson.devDependencies['@huggingface/transformers'], /^\^4(?:\.|$)/);
    assert.equal(packageJson.devDependencies['@xenova/transformers'], undefined);
    assert.match(builderSource, /import\(['"]@huggingface\/transformers['"]\)/);
    assert.doesNotMatch(builderSource, /@xenova\/transformers/);
  });

  it('keeps the v2 quantized-model behavior explicit under v4', () => {
    assert.match(
      builderSource,
      /pipeline\(['"]feature-extraction['"],\s*MODEL_ID,\s*\{\s*dtype:\s*['"]q8['"]\s*\}\)/,
    );
  });

  it('locks the maintained package and removes the abandoned package', () => {
    const resolved = packageLock.packages['node_modules/@huggingface/transformers'];
    assert.ok(resolved, 'package-lock must contain @huggingface/transformers');
    assert.match(resolved.version, /^4\./);
    assert.equal(packageLock.packages['node_modules/@xenova/transformers'], undefined);
  });

  it('removes onnx-proto and resolves protobufjs above the vulnerable range', () => {
    const lockedEntries = Object.entries(packageLock.packages);
    const onnxProto = lockedEntries.find(([packagePath]) => (
      packagePath === 'node_modules/onnx-proto' || packagePath.endsWith('/node_modules/onnx-proto')
    ));
    assert.equal(onnxProto, undefined);
    const protobuf = lockedEntries.find(([packagePath]) => (
      packagePath === 'node_modules/protobufjs' || packagePath.endsWith('/node_modules/protobufjs')
    ))?.[1];
    assert.ok(protobuf, 'the current onnxruntime-web directly depends on protobufjs');
    const [major, minor, patch] = protobuf.version.split('.').map(Number);
    assert.ok(
      major > 7 || (major === 7 && (minor > 6 || (minor === 6 && patch >= 3))),
      `protobufjs ${protobuf.version} must be newer than the vulnerable <=7.6.2 range`,
    );
  });
});

describe('Transformers.js build-chain exception (#804)', () => {
  const acceptedRisk = riskRegister.risks.find(
    ({ id }) => id === 'transformers-build-chain-2026-08',
  );

  it('keeps the accepted advisory chain development-only', () => {
    assert.ok(acceptedRisk, 'the temporary accepted-risk record must exist');
    assert.equal(acceptedRisk.scope.production_exposure, false);
    assert.equal(packageJson.dependencies?.['@huggingface/transformers'], undefined);
    assert.match(builderSource, /await import\(['"]@huggingface\/transformers['"]\)/);

    for (const name of ['@huggingface/transformers', 'onnxruntime-node', 'adm-zip', 'sharp']) {
      const entries = lockedPackages(name);
      assert.ok(entries.length > 0, `package-lock must contain ${name}`);
      for (const entry of entries) {
        assert.equal(entry.dev, true, `${entry.packagePath} must remain development-only`);
      }
    }
  });

  it('records a bounded exception only while the upstream graph needs it', () => {
    assert.ok(acceptedRisk, 'the temporary accepted-risk record must exist');
    assert.equal(acceptedRisk.issue, 804);
    assert.equal(acceptedRisk.status, 'accepted-temporarily');
    assert.equal(acceptedRisk.scope.direct_dependency, '@huggingface/transformers');

    const acceptedOn = Date.parse(acceptedRisk.accepted_on);
    const reviewBy = Date.parse(acceptedRisk.review_by);
    const reviewWindowDays = (reviewBy - acceptedOn) / (24 * 60 * 60 * 1000);
    assert.ok(Number.isFinite(acceptedOn) && Number.isFinite(reviewBy));
    assert.ok(reviewWindowDays > 0 && reviewWindowDays <= 92);

    const advisories = new Map(
      acceptedRisk.advisories.map((advisory) => [advisory.id, advisory]),
    );
    assert.equal(advisories.get('GHSA-xcpc-8h2w-3j85')?.patched, '0.6.0');
    assert.equal(advisories.get('GHSA-f88m-g3jw-g9cj')?.patched, '0.35.0');

    const vulnerableAdmZip = lockedPackages('adm-zip')
      .some(({ version }) => !versionAtLeast(version, '0.6.0'));
    const vulnerableSharp = lockedPackages('sharp')
      .some(({ version }) => !versionAtLeast(version, '0.35.0'));
    assert.ok(
      vulnerableAdmZip || vulnerableSharp,
      'the lockfile is patched; retire the accepted-risk record and verify the embeddings artifacts',
    );
  });
});
