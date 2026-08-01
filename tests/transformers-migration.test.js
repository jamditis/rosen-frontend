/**
 * Dependency migration contract for issue #395.
 *
 * The embeddings builder is build-time only, but its abandoned Xenova package
 * pins a permanently vulnerable ONNX/protobuf chain. These checks keep the
 * maintained successor and its lockfile graph from silently regressing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
const builderSource = fs.readFileSync(path.join(rootDir, 'data/lib/embeddings-builder.js'), 'utf8');

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
