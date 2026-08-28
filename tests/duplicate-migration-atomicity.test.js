/**
 * The #867 migration edits three canonical CSVs plus two graph-policy files.
 * A validation failure in any planned output must stop the whole migration
 * before the first source byte changes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function writeFixture(root) {
  const dataDir = path.join(root, 'data');
  const fixesDir = path.join(dataDir, 'fixes');
  const libDir = path.join(dataDir, 'lib');
  await Promise.all([
    mkdir(fixesDir, { recursive: true }),
    mkdir(libDir, { recursive: true }),
  ]);

  await Promise.all([
    copyFile(
      path.join(repositoryRoot, 'data/fixes/apply-2026-08-27-duplicate-adjudication.js'),
      path.join(fixesDir, 'apply-2026-08-27-duplicate-adjudication.js'),
    ),
    ...['csv-record-surgery.js', 'csv-unescape.js', 'graph-policy-refresh.js'].map((name) =>
      copyFile(path.join(repositoryRoot, 'data/lib', name), path.join(libDir, name))),
  ]);

  const records = [
    'id,publication_date,related_to,notes\r',
    'RECORD-00077,2011-01-05,,\r',
    'RECORD-00747,2011-01-05,,\r',
    'RECORD-00781,2010-04-18,,\r',
    '',
  ].join('\n');
  const social = 'id,publication_date,related_to,notes\r\nTWTR-00001,2020-01-01,,\r\n';
  const relationships = [
    'relationship_id,source_record_id,source_entity_id,source_entity_name,relationship_type,target_entity_id,target_entity_name\r',
    'RECORD-00077_REL_001,RECORD-00077,P0001,Jay Rosen,Mentions,O0001,NPR\r',
    'RECORD-00747_REL_001,RECORD-00747,P0001,Jay Rosen,Mentions,O0001,NPR\r',
    '',
  ].join('\n');
  const entities = [
    'entity_id,entity_type,entity_name,first_mention_record_id\r',
    'P0001,Person,Jay Rosen,RECORD-00077\r',
    'O0001,Organization,NPR,RECORD-00077\r',
    '',
  ].join('\n');

  // Deliberately invalid for pruneRelationshipTypeHolds: the missing array is
  // detected only after all three CSV edit plans have been built. This is the
  // late failure that used to leave earlier files partially written.
  const invalidHolds = '{\n  "duplicateEdgeExceptions": []\n}\n';

  await Promise.all([
    writeFile(path.join(dataDir, 'archive_records-public.csv'), records),
    writeFile(path.join(dataDir, 'social_posts.csv'), social),
    writeFile(path.join(dataDir, 'extracted_relationships.csv'), relationships),
    writeFile(path.join(dataDir, 'extracted_entities.csv'), entities),
    writeFile(path.join(dataDir, 'graph-validation-holds.json'), invalidHolds),
    writeFile(path.join(dataDir, 'relationship-type-registry.json'), '{\n  "types": {}\n}\n'),
  ]);

  return {
    script: path.join(fixesDir, 'apply-2026-08-27-duplicate-adjudication.js'),
    files: [
      'archive_records-public.csv',
      'extracted_relationships.csv',
      'extracted_entities.csv',
      'graph-validation-holds.json',
      'relationship-type-registry.json',
    ].map((name) => path.join(dataDir, name)),
  };
}

test('validates every #867 migration output before writing any source file', async () => {
  const root = await mkdtemp(path.join(repositoryRoot, 'test-duplicate-migration-'));
  try {
    const fixture = await writeFixture(root);
    const before = await Promise.all(fixture.files.map((file) => readFile(file)));

    const result = spawnSync(process.execPath, [fixture.script], {
      cwd: root,
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0, 'the invalid graph-policy plan must fail the migration');
    assert.match(result.stderr, /aborted without writing|no files were written/i);

    const after = await Promise.all(fixture.files.map((file) => readFile(file)));
    assert.deepStrictEqual(after, before, 'a failed migration must leave every input byte unchanged');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
