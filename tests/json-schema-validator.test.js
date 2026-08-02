import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertJsonSchemaDocument,
  compileJsonSchema
} from '../scripts/json-schema-validator.mjs';

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', pattern: '^urn:test:' }
  }
};

describe('JSON Schema validation helper', () => {
  it('compiles draft 2020-12 schemas and accepts conforming documents', () => {
    const validate = compileJsonSchema(schema, { source: 'test schema' });
    assert.doesNotThrow(() => {
      assertJsonSchemaDocument(validate, { id: 'urn:test:one' }, { source: 'valid fixture' });
    });
  });

  it('reports the source and validation path for a rejected document', () => {
    const validate = compileJsonSchema(schema, { source: 'test schema' });
    assert.throws(
      () => assertJsonSchemaDocument(validate, { id: 'wrong' }, { source: 'invalid fixture' }),
      error => {
        assert.match(error.message, /^invalid fixture does not conform to its JSON Schema:/);
        assert.match(error.message, /\/id must match pattern/);
        return true;
      }
    );
  });

  it('wraps schema compilation errors with their source', () => {
    assert.throws(
      () => compileJsonSchema({ type: 'not-a-json-schema-type' }, { source: 'broken schema' }),
      /broken schema could not be compiled:/
    );
  });
});
