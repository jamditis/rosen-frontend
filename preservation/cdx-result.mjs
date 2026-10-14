import { createHash } from 'node:crypto';
import { compileJsonSchema } from '../scripts/json-schema-validator.mjs';

export const CDX_RESULT_VERSION = '1.0.0';
export const CDX_ADAPTER_NAME = 'internet-archive-wayback-cdx-json';
export const CDX_ADAPTER_VERSION = '1.0.0';

const isWebUri = compileJsonSchema({
  type: 'string',
  format: 'uri',
  pattern: '^[hH][tT][tT][pP][sS]?://',
}, { source: 'CDX web URL' });

const REQUIRED_FIELDS = Object.freeze([
  'timestamp',
  'original',
  'statuscode',
  'mimetype',
  'digest',
]);
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const WAYBACK_TIMESTAMP_PATTERN = /^\d{14}$/;
const KNOWN_QUERY_PARAMETERS = new Set([
  'url',
  'matchType',
  'output',
  'fl',
  'showResumeKey',
  'resumeKey',
  'limit',
  'gzip',
  'resolveRevisits',
]);
const RESTRICTING_QUERY_PARAMETERS = new Set([
  'filter',
  'collapse',
  'from',
  'to',
  'offset',
  'fastLatest',
  'closest',
  'page',
  'pageSize',
  'showNumPages',
  'showPagedIndex',
  'showDupeCount',
]);

export class CdxResultError extends Error {
  constructor(message, {
    row = null,
    sourcePosition = null,
    physicalLine = null,
    column = null,
    cause,
  } = {}) {
    super(row == null ? message : `CDX row ${row}: ${message}`, { cause });
    this.name = 'CdxResultError';
    this.row = row;
    this.sourcePosition = sourcePosition;
    this.physicalLine = physicalLine;
    this.column = column;
    this.nextCursor = null;
  }
}

function fail(message, options) {
  throw new CdxResultError(message, options);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, required, optional, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${label} requires ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} has unsupported field ${key}`);
  }
}

function parseUtcTimestamp(value, label) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP_PATTERN.test(value)) {
    fail(`${label} must be a valid UTC timestamp`);
  }
  const normalized = value.includes('.') ? value : value.replace(/Z$/, '.000Z');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== normalized) {
    fail(`${label} must be a valid UTC timestamp`);
  }
}

function waybackTimestampToIso(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    + `T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}.000Z`;
}

function validateWaybackTimestamp(value, row) {
  if (typeof value !== 'string' || !WAYBACK_TIMESTAMP_PATTERN.test(value)) {
    fail('timestamp must be a valid 14-digit UTC capture timestamp', { row });
  }
  const isoTimestamp = waybackTimestampToIso(value);
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== isoTimestamp) {
    fail('timestamp must be a real UTC capture date', { row });
  }
}

function validateWebUrl(value, label) {
  if (!isWebUri(value)) fail(`${label} must be a web URL`);
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') fail(`${label} must be a web URL`);
    return url;
  } catch (error) {
    if (error instanceof CdxResultError) throw error;
    fail(`${label} must be a web URL`, { cause: error });
  }
}

function validateParameters(parameters) {
  if (!Array.isArray(parameters)) fail('query parameters must be an array');
  return parameters.map((parameter, index) => {
    const label = `query parameter ${index + 1}`;
    assertExactKeys(parameter, ['name', 'value'], [], label);
    if (typeof parameter.name !== 'string' || parameter.name.length === 0) {
      fail(`${label} name must be a non-empty string`);
    }
    if (typeof parameter.value !== 'string') fail(`${label} value must be a string`);
    return { name: parameter.name, value: parameter.value };
  });
}

function validateObjectMappings(objectMappings) {
  if (!Array.isArray(objectMappings)) fail('objectMappings must be an array');
  const normalized = objectMappings.map((mapping, index) => {
    const label = `object mapping ${index + 1}`;
    assertExactKeys(mapping, ['objectId', 'sourceUrl', 'sourceRole'], [], label);
    if (typeof mapping.objectId !== 'string'
        || !/^urn:rosen:object:[a-z0-9-]+:[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(mapping.objectId)) {
      fail(`${label} objectId must be a stable Rosen object URN`);
    }
    validateWebUrl(mapping.sourceUrl, `${label} sourceUrl`);
    if (mapping.sourceRole !== 'canonical' && mapping.sourceRole !== 'alternate') {
      fail(`${label} sourceRole must be canonical or alternate`);
    }
    return {
      objectId: mapping.objectId,
      sourceUrl: mapping.sourceUrl,
      sourceRole: mapping.sourceRole,
    };
  });

  const firstIndexByMapping = new Map();
  normalized.forEach((mapping, index) => {
    const identity = JSON.stringify([
      mapping.objectId,
      mapping.sourceUrl,
      mapping.sourceRole,
    ]);
    if (firstIndexByMapping.has(identity)) {
      fail(
        `object mapping ${index + 1} duplicates object mapping ${firstIndexByMapping.get(identity)}`,
      );
    }
    firstIndexByMapping.set(identity, index + 1);
  });
  return normalized;
}

function validateMetadata(metadata) {
  assertExactKeys(
    metadata,
    ['resultVersion', 'adapter', 'query', 'checkedAt'],
    ['objectMappings'],
    'CDX result metadata',
  );
  if (metadata.resultVersion !== CDX_RESULT_VERSION) {
    fail(`unsupported CDX result version ${String(metadata.resultVersion)}`);
  }

  assertExactKeys(metadata.adapter, ['name', 'version'], [], 'CDX adapter');
  if (metadata.adapter.name !== CDX_ADAPTER_NAME) {
    fail(`unsupported CDX adapter ${String(metadata.adapter.name)}`);
  }
  if (metadata.adapter.version !== CDX_ADAPTER_VERSION) {
    fail(`unsupported CDX adapter version ${String(metadata.adapter.version)}`);
  }

  assertExactKeys(metadata.query, ['requestUrl', 'parameters'], [], 'CDX query');
  const requestUrl = validateWebUrl(metadata.query.requestUrl, 'query requestUrl');
  const parameters = validateParameters(metadata.query.parameters);
  const urlParameters = Array.from(requestUrl.searchParams, ([name, value]) => ({ name, value }));
  if (JSON.stringify(parameters) !== JSON.stringify(urlParameters)) {
    fail('query parameters must exactly match requestUrl parameters in order');
  }
  parseUtcTimestamp(metadata.checkedAt, 'checkedAt');

  return {
    resultVersion: metadata.resultVersion,
    adapter: { name: metadata.adapter.name, version: metadata.adapter.version },
    query: { requestUrl: metadata.query.requestUrl, parameters },
    checkedAt: metadata.checkedAt,
    objectMappings: validateObjectMappings(metadata.objectMappings ?? []),
  };
}

function valuesFor(parameters, name) {
  return parameters.filter(parameter => parameter.name === name).map(parameter => parameter.value);
}

function requestCoverage(parameters, nextCursor) {
  if (nextCursor !== null) {
    return { state: 'partial', reason: 'resume-key-present' };
  }
  if (valuesFor(parameters, 'resumeKey').length > 0) {
    return { state: 'partial', reason: 'continuation-page' };
  }
  if (parameters.some(parameter => RESTRICTING_QUERY_PARAMETERS.has(parameter.name))) {
    return { state: 'partial', reason: 'restricted-query' };
  }
  if (parameters.some(parameter => !KNOWN_QUERY_PARAMETERS.has(parameter.name))) {
    return { state: 'unknown', reason: 'request-scope-unproven' };
  }

  const urls = valuesFor(parameters, 'url');
  const outputs = valuesFor(parameters, 'output');
  const resumeFlags = valuesFor(parameters, 'showResumeKey');
  const limits = valuesFor(parameters, 'limit');
  const matchTypes = valuesFor(parameters, 'matchType');
  const hasRequiredControls = urls.length === 1
    && urls[0].length > 0
    && outputs.length === 1
    && outputs[0] === 'json'
    && resumeFlags.length === 1
    && resumeFlags[0] === 'true';
  const hasSafeLimit = limits.length <= 1
    && (limits.length === 0 || /^[1-9]\d*$/.test(limits[0]));
  const hasKnownMatchType = matchTypes.length <= 1
    && (matchTypes.length === 0 || ['exact', 'prefix', 'host', 'domain'].includes(matchTypes[0]));
  if (!hasRequiredControls || !hasSafeLimit || !hasKnownMatchType) {
    return { state: 'unknown', reason: 'request-scope-unproven' };
  }
  return { state: 'complete', reason: 'full-history-exhausted' };
}

function completeCoverage(captures) {
  if (captures.length === 0) {
    return {
      state: 'complete',
      reason: 'full-history-exhausted',
      empty: true,
    };
  }
  const timestamps = captures.map(capture => capture.captureTimestamp).sort();
  return {
    state: 'complete',
    reason: 'full-history-exhausted',
    empty: false,
    earliestCaptureTimestamp: timestamps[0],
    latestCaptureTimestamp: timestamps[timestamps.length - 1],
  };
}

function parseHeader(row) {
  if (!Array.isArray(row) || row.length === 0) {
    fail('header must be a non-empty array', { row: 1 });
  }
  if (row.some(field => typeof field !== 'string' || field.length === 0)) {
    fail('header fields must be non-empty strings', { row: 1 });
  }
  const duplicates = row.filter((field, index) => row.indexOf(field) !== index);
  if (duplicates.length > 0) {
    fail(`header contains duplicate field ${duplicates[0]}`, { row: 1 });
  }
  for (const field of REQUIRED_FIELDS) {
    if (!row.includes(field)) fail(`header is missing required field ${field}`, { row: 1 });
  }
  return new Map(row.map((field, index) => [field, index]));
}

function splitTrailer(rows, parameters) {
  const separatorIndex = rows.findIndex((row, index) => index > 0 && Array.isArray(row) && row.length === 0);
  if (separatorIndex === -1) return { captureRows: rows.slice(1), nextCursor: null };

  const separatorRow = separatorIndex + 1;
  if (separatorIndex !== rows.length - 2) {
    fail('empty continuation separator must be followed by one final resume-key row', {
      row: separatorRow,
    });
  }
  const trailer = rows[separatorIndex + 1];
  if (!Array.isArray(trailer)
      || trailer.length !== 1
      || typeof trailer[0] !== 'string'
      || trailer[0].length === 0) {
    fail('continuation trailer must contain one non-empty resume key', {
      row: separatorRow + 1,
    });
  }
  const resumeFlags = valuesFor(parameters, 'showResumeKey');
  if (resumeFlags.length !== 1 || resumeFlags[0] !== 'true') {
    fail('continuation trailer requires showResumeKey=true in the recorded request', {
      row: separatorRow + 1,
    });
  }
  return {
    captureRows: rows.slice(1, separatorIndex),
    nextCursor: trailer[0],
  };
}

function parseCapture(row, rowNumber, header, width, checkedAt) {
  if (!Array.isArray(row)) fail('capture must be an array', { row: rowNumber });
  if (row.length !== width) {
    fail(`capture width ${row.length} does not match header width ${width}`, { row: rowNumber });
  }
  if (row.some(value => typeof value !== 'string')) {
    fail('capture fields must be strings', { row: rowNumber });
  }

  const captureTimestamp = row[header.get('timestamp')];
  validateWaybackTimestamp(captureTimestamp, rowNumber);
  if (Date.parse(waybackTimestampToIso(captureTimestamp)) > Date.parse(checkedAt)) {
    fail('timestamp cannot be after checkedAt', { row: rowNumber });
  }
  const returnedOriginalUrl = row[header.get('original')];
  const status = row[header.get('statuscode')];
  const mediaType = row[header.get('mimetype')];
  const opaqueDigest = row[header.get('digest')];
  for (const [field, value] of [
    ['original', returnedOriginalUrl],
    ['statuscode', status],
    ['mimetype', mediaType],
    ['digest', opaqueDigest],
  ]) {
    if (value.length === 0) fail(`${field} must not be empty`, { row: rowNumber });
  }

  return {
    captureTimestamp,
    returnedOriginalUrl,
    status,
    mediaType,
    opaqueDigest,
    replayUrl: `https://web.archive.org/web/${captureTimestamp}/${returnedOriginalUrl}`,
  };
}

function decodePageBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('CDX page input must be raw bytes');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    fail('CDX page is not valid UTF-8', { cause: error });
  }
}

function jsonSyntaxLocation(error, text) {
  const message = typeof error?.message === 'string' ? error.message : '';
  const positionMatch = / in JSON at position (\d+)(?: \(line (\d+) column (\d+)\))?$/.exec(message);
  let sourcePosition = positionMatch === null ? null : Number(positionMatch[1]);
  if (sourcePosition === null && /^Unexpected end of JSON input$/.test(message)) {
    sourcePosition = text.length;
  }

  if (!Number.isSafeInteger(sourcePosition)
      || sourcePosition < 0
      || sourcePosition > text.length) {
    return { sourcePosition: null, physicalLine: null, column: null };
  }

  const prefix = text.slice(0, sourcePosition);
  const lastLineBreak = prefix.lastIndexOf('\n');
  return {
    sourcePosition,
    physicalLine: prefix.split('\n').length,
    column: sourcePosition - lastLineBreak,
  };
}

function jsonSyntaxMessage({ sourcePosition, physicalLine, column }) {
  if (sourcePosition !== null && physicalLine !== null && column !== null) {
    return `CDX page is not valid JSON at source position ${sourcePosition}`
      + ` (physical line ${physicalLine}, column ${column})`;
  }
  if (physicalLine !== null && column !== null) {
    return `CDX page is not valid JSON at physical line ${physicalLine}, column ${column}`;
  }
  return 'CDX page is not valid JSON';
}

function parseRows(bytes) {
  const text = decodePageBytes(bytes);
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const location = jsonSyntaxLocation(error, text);
    fail(jsonSyntaxMessage(location), location);
  }
  if (!Array.isArray(value)) fail('CDX page must be a JSON array');
  return value;
}

function queryFingerprint(query) {
  const identity = JSON.stringify({
    requestUrl: query.requestUrl,
    parameters: query.parameters,
  });
  return `sha256:${createHash('sha256').update(identity).digest('hex')}`;
}

/**
 * Parse one recorded CDX JSON page without making a network request.
 *
 * The function returns no captures or cursor when any row is invalid. Callers
 * must persist the returned cursor only with the complete returned result.
 */
export function parseCdxPage(bytes, declaredMetadata) {
  const metadata = validateMetadata(declaredMetadata);
  const rows = parseRows(bytes);
  let captures = [];
  let nextCursor = null;
  if (rows.length > 0) {
    const header = parseHeader(rows[0]);
    const page = splitTrailer(rows, metadata.query.parameters);
    if (page.nextCursor !== null && !header.has('urlkey')) {
      fail('continuation requires the urlkey field in the response header', { row: 1 });
    }
    nextCursor = page.nextCursor;
    captures = page.captureRows.map((row, index) => (
      parseCapture(row, index + 2, header, rows[0].length, metadata.checkedAt)
    ));
  }
  const requestState = requestCoverage(metadata.query.parameters, nextCursor);
  const coverage = requestState.state === 'complete'
    ? completeCoverage(captures)
    : requestState;

  return {
    resultVersion: metadata.resultVersion,
    adapter: metadata.adapter,
    query: {
      requestUrl: metadata.query.requestUrl,
      parameters: metadata.query.parameters,
      fingerprint: queryFingerprint(metadata.query),
    },
    checkedAt: metadata.checkedAt,
    outcome: 'success',
    coverage,
    captures,
    nextCursor,
    objectMappings: metadata.objectMappings,
  };
}

function canonicalizeJson(value, location = 'result') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalizeJson(item, `${location}[${index}]`));
  }
  if (!isPlainObject(value)) fail(`${location} contains a non-JSON value`);

  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) fail(`${location}.${key} is undefined`);
    result[key] = canonicalizeJson(value[key], `${location}.${key}`);
  }
  return result;
}

export function serializeCdxResult(result) {
  if (!isPlainObject(result) || result.resultVersion !== CDX_RESULT_VERSION) {
    fail(`unsupported CDX result version ${String(result?.resultVersion)}`);
  }
  return `${JSON.stringify(canonicalizeJson(result), null, 2)}\n`;
}
