import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertJsonSchemaDocument,
  compileJsonSchema
} from '../scripts/json-schema-validator.mjs';

const rootDir = process.cwd();
const preservationDir = path.join(rootDir, 'preservation');
const examplesDir = path.join(preservationDir, 'examples');
const schema = JSON.parse(
  fs.readFileSync(path.join(preservationDir, 'preservation-manifest.schema.json'), 'utf8')
);

describe('preservation manifest schema', () => {
  const validate = compileJsonSchema(schema, {
    source: 'preservation/preservation-manifest.schema.json'
  });
  const exampleFiles = fs.readdirSync(examplesDir)
    .filter(file => file.endsWith('.json'))
    .sort();

  it('has at least one canonical example', () => {
    assert.ok(exampleFiles.length > 0);
  });

  for (const file of exampleFiles) {
    it(`validates ${file}`, () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(examplesDir, file), 'utf8'));
      assert.doesNotThrow(() => {
        assertJsonSchemaDocument(validate, manifest, { source: `preservation/examples/${file}` });
      });
    });
  }
});
