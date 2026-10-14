/**
 * Self-hosted semantic encoder asset contract (#860).
 *
 * The large binary files are stored with Git LFS. These tests deliberately
 * read and hash their materialized bytes so CI cannot pass with pointer files.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(root, 'frontend', 'vendor', 'semantic', 'v1');
const manifestPath = path.join(assetRoot, 'manifest.json');
const worker = fs.readFileSync(path.join(root, 'frontend', 'services', 'semantic-search-worker.js'), 'utf8');

const workflowSource = (filename) =>
  fs.readFileSync(path.join(root, '.github', 'workflows', filename), 'utf8');

const EXPECTED_FILES = [
  'NOTICE.md',
  'licenses/BAAI-bge-small-en-v1.5-MIT.txt',
  'licenses/onnxruntime-MIT.txt',
  'licenses/transformers-Apache-2.0.txt',
  'models/Xenova/bge-small-en-v1.5/config.json',
  'models/Xenova/bge-small-en-v1.5/onnx/model_quantized.onnx',
  'models/Xenova/bge-small-en-v1.5/tokenizer.json',
  'models/Xenova/bge-small-en-v1.5/tokenizer_config.json',
  'runtime/ort-wasm-simd-threaded.asyncify.mjs',
  'runtime/ort-wasm-simd-threaded.asyncify.wasm',
  'runtime/ort-wasm-simd-threaded.mjs',
  'runtime/ort-wasm-simd-threaded.wasm',
  'runtime/ort.webgpu.bundle.min.mjs',
  'runtime/transformers.web.min.js',
];

test('semantic asset manifest pins the model and runtime sources', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.model, {
    id: 'Xenova/bge-small-en-v1.5',
    revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3',
    baseModel: 'BAAI/bge-small-en-v1.5',
    baseModelRevision: '5c38ec7c405ec4b44b94cc5a9bb96e735b38267a',
    license: 'MIT',
  });
  assert.equal(manifest.runtime.transformers.version, '4.2.0');
  assert.equal(manifest.runtime.transformers.license, 'Apache-2.0');
  assert.equal(
    manifest.runtime.transformers.upstreamSha256,
    '0a96dcf4c48981b7d05f53827e6975ec239132606ad0d526bbc2db0fcdbc4ded',
  );
  assert.equal(manifest.runtime.onnxRuntime.version, '1.26.0-dev.20260416-b7804b056c');
  assert.equal(manifest.runtime.onnxRuntime.license, 'MIT');
});

test('every declared asset is materialized and matches its size and SHA-256', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(Object.keys(manifest.files).sort(), EXPECTED_FILES);

  for (const [relativePath, expected] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(assetRoot, relativePath));
    assert.ok(
      !bytes.subarray(0, 64).toString().startsWith('version https://git-lfs.github.com/spec/v1'),
      `${relativePath} is an LFS pointer instead of materialized bytes`,
    );
    assert.equal(bytes.length, expected.bytes, `${relativePath} size`);
    assert.equal(
      crypto.createHash('sha256').update(bytes).digest('hex'),
      expected.sha256,
      `${relativePath} SHA-256`,
    );
  }
});

test('large model and WASM assets are tracked through Git LFS and materialized in validation CI', () => {
  const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.match(attributes, /frontend\/vendor\/semantic\/\*\*\/\*\.onnx filter=lfs diff=lfs merge=lfs -text/);
  assert.match(attributes, /frontend\/vendor\/semantic\/\*\*\/\*\.wasm filter=lfs diff=lfs merge=lfs -text/);

  const workflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'frontend-validation.yml'),
    'utf8',
  );
  assert.match(
    workflow,
    /git lfs pull --include="frontend\/vendor\/semantic\/v1\/\*\*"/,
    'validation must materialize the current semantic binaries before hashing them',
  );
  assert.ok(
    workflow.indexOf('git lfs pull --include=') < workflow.indexOf('Run complete Node test suite'),
    'LFS materialization must precede the checksum tests',
  );
});

test('data-writing workflows materialize semantic binaries after their final checkout', () => {
  const pipelines = [
    {
      filename: 'submit-record.yml',
      checkout: '- name: Checkout current main with write token',
      consumer: '- name: Process submission',
    },
    {
      filename: 'submit-prototype.yml',
      checkout: '- name: Checkout current main with write token',
      consumer: '- name: Process submission',
    },
    {
      filename: 'maintenance.yml',
      checkout: '- name: Checkout main',
      consumer: '- name: Run maintenance job',
      condition: "if: ${{ inputs.job == 'sync_to_archive' }}",
    },
  ];

  for (const { filename, checkout, consumer, condition } of pipelines) {
    const workflow = workflowSource(filename);
    const checkoutIndex = workflow.indexOf(checkout);
    const materializeIndex = workflow.indexOf('- name: Materialize semantic search binaries');
    const consumerIndex = workflow.indexOf(consumer);

    assert.notEqual(checkoutIndex, -1, `${filename} must keep its final checkout`);
    assert.notEqual(materializeIndex, -1, `${filename} must materialize semantic binaries`);
    assert.notEqual(consumerIndex, -1, `${filename} must keep its data writer`);
    assert.ok(
      checkoutIndex < materializeIndex && materializeIndex < consumerIndex,
      `${filename} must materialize LFS binaries after checkout and before its test-running writer`,
    );
    assert.match(
      workflow.slice(materializeIndex, consumerIndex),
      /run: git lfs pull --include="frontend\/vendor\/semantic\/v1\/\*\*"/,
      `${filename} must materialize the scoped current semantic assets`,
    );
    if (condition) {
      assert.ok(
        workflow.slice(materializeIndex, consumerIndex).includes(condition),
        `${filename} must limit LFS materialization to sync_to_archive`,
      );
    }
  }

  const submissionWriter = fs.readFileSync(
    path.join(root, 'backend', 'scripts', 'process_submission.py'),
    'utf8',
  );
  const sheetWriter = fs.readFileSync(
    path.join(root, 'backend', 'scripts', 'sync_sheet_to_archive.py'),
    'utf8',
  );
  assert.match(submissionWriter, /subprocess\.run\(\['npm', 'test'\]/);
  assert.match(sheetWriter, /_run\(\["npm", "test"\]/);
});

test('the worker loads only archive-local model and runtime URLs', () => {
  assert.doesNotMatch(worker, /https:\/\/(?:huggingface\.co|[^'"\s]*\.hf\.co|cdn\.jsdelivr\.net)/);
  assert.match(worker, /env\.allowRemoteModels\s*=\s*false/);
  assert.match(worker, /env\.allowLocalModels\s*=\s*true/);
  assert.match(worker, /env\.localModelPath\s*=\s*SEMANTIC_MODEL_BASE_URL/);
  assert.match(worker, /env\.useBrowserCache\s*=\s*false/);
  assert.match(worker, /env\.useWasmCache\s*=\s*false/);
  assert.match(worker, /env\.backends\.onnx\.wasm\.wasmPaths\s*=\s*selectLocalWasmAssets\(\)/);
  assert.match(worker, /revision:\s*QUERY_MODEL_REVISION/);
});

test('Apache serves local semantic modules, WASM, and ONNX with usable content types', () => {
  const htaccess = fs.readFileSync(path.join(root, '.htaccess'), 'utf8');
  assert.match(htaccess, /AddType application\/javascript \.js \.mjs/);
  assert.match(htaccess, /AddType application\/wasm \.wasm/);
  assert.match(htaccess, /AddType application\/octet-stream \.onnx/);
});

test('the full-site frontend walk deploys every semantic asset over the existing FTPS path', () => {
  const deploy = fs.readFileSync(
    path.join(root, 'backend', 'scripts', 'deploy_full_site.py'),
    'utf8',
  );
  assert.match(deploy, /_DEPLOY_DIRS:[\s\S]*?'frontend'/);
  assert.doesNotMatch(deploy, /_EXCLUDE_SUFFIXES[^\n]*(?:\.onnx|\.wasm|\.mjs)/);
  const deploymentDoc = fs.readFileSync(path.join(root, 'DEPLOYMENT.md'), 'utf8');
  assert.match(
    deploymentDoc,
    /vendor\/[\s\S]{0,200}semantic\/v1\/.*model, runtime, checksums, and license notices/,
  );
});
