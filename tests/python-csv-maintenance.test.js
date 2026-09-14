import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';

const awkward = 'id,body,note\r\nR1,plain,first\r\nR2,line one\nline two,second\r\nR3,"has, a comma",third\r\n';
function python(code, args = []) {
  const result = spawnSync('python3', ['-c', code, ...args], {
    encoding: 'utf8', env: { ...process.env, PYTHONPATH: path.resolve('data') }, maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('Python maintenance reads bare LF as field content and preserves untouched bytes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-maintenance-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'records.csv');
  fs.writeFileSync(file, awkward);
  python(`import sys\nfrom csv_safe_write import read_archive_csv, write_archive_csv\ncolumns, rows = read_archive_csv(sys.argv[1])\nassert len(rows) == 3\nassert rows[1]['body'] == 'line one\\nline two'\nwrite_archive_csv(sys.argv[1], columns, [rows[0], rows[2]])`, [file]);
  assert.equal(fs.readFileSync(file, 'utf8'), awkward.replace('R2,line one\nline two,second\r\n', ''));
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), awkward);
});

test('Python reader agrees with the exporter on current source IDs without writing', () => {
  const ids = JSON.parse(python(`import json, sys\nfrom csv_safe_write import read_archive_csv\n_, rows = read_archive_csv(sys.argv[1])\nprint(json.dumps([row['id'] for row in rows]))`, [path.resolve('data/archive_records-public.csv')]));
  const expected = parse(fs.readFileSync('data/archive_records-public.csv', 'utf8'), { columns: true, skip_empty_lines: true }).map(row => row.id);
  assert.deepEqual(ids, expected);
  assert.equal(new Set(ids).size, ids.length);
});

for (const operation of ['dedup', 'remove607']) {
  test(`${operation} entrypoint preserves multiline records and updates references`, t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-entrypoint-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const records = path.join(dir, 'archive_records-public.csv');
    const relationships = path.join(dir, 'extracted_relationships.csv');
    const entities = path.join(dir, 'extracted_entities.csv');
    const kept = 'R1,https://example.com/a,Title one,2020-01-01,,line one\nline two\r\n';
    fs.writeFileSync(records, 'id,url,title,publication_date,related_to,raw_text\r\n' + kept +
      'RECORD-00607,https://example.com/a,Duplicate,2021-01-01,,discard\r\n' +
      'R3,https://example.com/b,Title three,2022-01-01,RECORD-00607,keep this\r\n');
    fs.writeFileSync(relationships, 'source_record_id,source_entity_id,target_entity_id\r\nR1,E1,E2\r\nRECORD-00607,E3,E4\r\n');
    fs.writeFileSync(entities, 'entity_id,first_mention_record_id\r\nE1,R1\r\nE3,RECORD-00607\r\n');
    const importModule = operation === 'dedup'
      ? 'import dedup_records as module\nimport prune_orphan_references as prune\nmodule.prune_orphan_references = lambda: prune.prune_orphan_references(*sys.argv[1:])\nmodule.CSV_PATH = Path(sys.argv[1])'
      : `import importlib.util\nspec = importlib.util.spec_from_file_location('remove607', ${JSON.stringify(path.resolve('data/fixes/remove-record-00607.py'))})\nmodule = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\nmodule.RECORDS_PATH, module.RELATIONSHIPS_PATH, module.ENTITIES_PATH = map(Path, sys.argv[1:])`;
    python(`import sys\nfrom pathlib import Path\n${importModule}\nmodule.main()\nmodule.main()`, [records, relationships, entities]);
    const result = fs.readFileSync(records, 'utf8');
    assert.ok(result.includes(kept), 'untouched multiline row must be byte-identical');
    const rows = parse(result, { columns: true, skip_empty_lines: true });
    assert.deepEqual(rows.map(row => row.id), ['R1', 'R3']);
    assert.equal(rows[1].related_to, '');
    assert.deepEqual(parse(fs.readFileSync(relationships, 'utf8'), { columns: true }).map(row => row.source_record_id), ['R1']);
  });
}

test('safe writer handles header-only results, BOM, edits, and no-op reruns', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-empty-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'records.csv');
  fs.writeFileSync(file, '\ufeff' + awkward);
  python(`import sys\nfrom csv_safe_write import read_archive_csv, write_archive_csv\np = sys.argv[1]\ncolumns, rows = read_archive_csv(p)\nrows[1]['note'] = 'updated, value'\nwrite_archive_csv(p, columns, rows)\nassert read_archive_csv(p)[1][1]['body'] == 'line one\\nline two'\nwrite_archive_csv(p, columns, [])\nassert read_archive_csv(p) == [columns, []]\nwrite_archive_csv(p, columns, [])`, [file]);
  assert.equal(fs.readFileSync(file, 'utf8'), '\ufeffid,body,note\r\n');
});


test('LF-delimited inputs remain readable and editable after a pandas-style rewrite', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-lf-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'records.csv');
  const source = 'id,body\nR1,one\nR2,"line one\nline two"\nR3,three\n';
  fs.writeFileSync(file, source);
  python(`import sys\nfrom csv_safe_write import read_archive_csv, write_archive_csv\np = sys.argv[1]\ncolumns, rows = read_archive_csv(p)\nassert len(rows) == 3\nwrite_archive_csv(p, columns, rows)\nassert open(p).read() == sys.argv[2]\nrows[0]['body'] = 'changed, value'\nwrite_archive_csv(p, columns, rows[:2])\nassert read_archive_csv(p)[1][1]['body'] == 'line one\\nline two'`, [file, source]);
  assert.equal(fs.readFileSync(file, 'utf8'), 'id,body\nR1,"changed, value"\nR2,"line one\nline two"\n');
});
