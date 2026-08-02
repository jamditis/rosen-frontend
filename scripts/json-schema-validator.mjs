import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export function compileJsonSchema(schema, { source = 'JSON schema' } = {}) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false
  });
  addFormats(ajv);

  try {
    return ajv.compile(schema);
  } catch (error) {
    throw new Error(`${source} could not be compiled: ${error.message}`, { cause: error });
  }
}

export function assertJsonSchemaDocument(
  validate,
  document,
  { source = 'JSON document' } = {}
) {
  if (validate(document)) return;

  const details = (validate.errors ?? [])
    .map(error => `${error.instancePath || '/'} ${error.message}`)
    .join('\n');
  throw new Error(`${source} does not conform to its JSON Schema:\n${details}`);
}
