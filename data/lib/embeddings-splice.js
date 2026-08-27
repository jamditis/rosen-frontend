/**
 * Remove records from the published embeddings pair without re-embedding.
 *
 * data/archive-embeddings.json lists one id per row and data/archive-embeddings.bin
 * holds the rows themselves, each exactly bytesPerVector long, in that order. Row N
 * belongs to ids[N]. Deleting a record therefore cannot be done by editing the JSON
 * alone: drop an id and every later row is read against the wrong record.
 *
 * Rebuilding instead of splicing would be the obvious answer, but the builder needs
 * the bge-small model, so it only runs on a machine that can fetch it. A splice
 * needs nothing: the surviving vectors are copied through byte for byte, so the
 * embedding space is identical to the one the site already serves. That is why the
 * sidecar's version, model, and dim are carried over untouched -- the vectors did
 * not change, only which ones are present.
 *
 * Used by the #867 duplicate migration (see
 * data/fixes/apply-2026-08-27-duplicate-adjudication.py) and by any later record
 * removal. Run it after the source CSV is edited and before the exporter:
 *
 *     node data/lib/embeddings-splice.js RECORD-00830 RECORD-00846
 *
 * Ids that are not in the index are reported and otherwise ignored, so a rerun is
 * a no-op rather than an error.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { sha256Hex } from './embeddings-builder.js';

/**
 * Splice ids out of an in-memory embeddings pair.
 *
 * @param {object} index the parsed archive-embeddings.json sidecar
 * @param {Buffer} binary the archive-embeddings.bin contents
 * @param {Iterable<string>} dropIds record ids to remove
 * @returns {{index: object, binary: Buffer, removed: string[], missing: string[]}}
 */
export function spliceEmbeddings(index, binary, dropIds) {
  const bytesPerVector = index?.bytesPerVector;
  if (!Number.isInteger(bytesPerVector) || bytesPerVector <= 0) {
    throw new Error('spliceEmbeddings: index.bytesPerVector must be a positive integer');
  }
  if (!Array.isArray(index.ids)) {
    throw new Error('spliceEmbeddings: index.ids must be an array');
  }
  if (index.ids.length !== index.count) {
    throw new Error(
      `spliceEmbeddings: index.count ${index.count} does not match ${index.ids.length} ids`,
    );
  }
  if (binary.length !== index.ids.length * bytesPerVector) {
    throw new Error(
      `spliceEmbeddings: binary is ${binary.length} bytes, expected ${index.ids.length * bytesPerVector}`,
    );
  }

  const wanted = new Set(dropIds);
  const keptIds = [];
  const keptRows = [];
  const removed = [];
  for (let row = 0; row < index.ids.length; row++) {
    const id = index.ids[row];
    if (wanted.has(id)) {
      removed.push(id);
      continue;
    }
    keptIds.push(id);
    keptRows.push(binary.subarray(row * bytesPerVector, (row + 1) * bytesPerVector));
  }

  const present = new Set(removed);
  const missing = [...wanted].filter((id) => !present.has(id));

  const splicedBinary = Buffer.concat(keptRows, keptIds.length * bytesPerVector);
  return {
    // Everything but the row set is carried over: the vectors are the same bytes
    // the model produced, so the model, dim, and index version still describe them.
    index: {
      ...index,
      count: keptIds.length,
      binarySha256: sha256Hex(splicedBinary),
      ids: keptIds,
    },
    binary: splicedBinary,
    removed,
    missing,
  };
}

function main(argv) {
  const dropIds = argv.filter((arg) => !arg.startsWith('-'));
  if (dropIds.length === 0) {
    console.error('usage: node data/lib/embeddings-splice.js RECORD-XXXXX [RECORD-YYYYY ...]');
    process.exit(2);
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const jsonPath = path.join(root, 'data', 'archive-embeddings.json');
  const binPath = path.join(root, 'data', 'archive-embeddings.bin');

  const before = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const result = spliceEmbeddings(before, readFileSync(binPath), dropIds);

  if (result.missing.length) {
    console.log(`embeddings: not in the index, skipped: ${result.missing.join(', ')}`);
  }
  if (result.removed.length === 0) {
    console.log('embeddings: nothing to remove, files left untouched');
    return;
  }

  writeFileSync(binPath, result.binary);
  writeFileSync(jsonPath, JSON.stringify(result.index));
  console.log(
    `embeddings: removed ${result.removed.length} vectors (${result.removed.join(', ')}); ` +
      `${before.count} -> ${result.index.count} rows, ${result.binary.length} bytes`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2));
}

export default { spliceEmbeddings };
