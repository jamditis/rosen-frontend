import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CDX_ADAPTER_NAME,
  CDX_ADAPTER_VERSION,
  CDX_RESULT_VERSION,
  CdxResultError,
  parseCdxPage,
  serializeCdxResult,
} from '../preservation/cdx-result.mjs';
import { compileJsonSchema } from '../scripts/json-schema-validator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(root, 'tests', 'fixtures', 'cdx');
const schema = JSON.parse(fs.readFileSync(
  path.join(root, 'preservation', 'cdx-result.schema.json'),
  'utf8',
));
const validateSchema = compileJsonSchema(schema, {
  source: 'preservation/cdx-result.schema.json',
});
const defaultParameters = [
  { name: 'url', value: 'archive.org' },
  { name: 'output', value: 'json' },
  {
    name: 'fl',
    value: 'urlkey,timestamp,original,mimetype,statuscode,digest,length',
  },
  { name: 'showResumeKey', value: 'true' },
];
const defaultMappings = [{
  objectId: 'urn:rosen:object:archive-record:RECORD-00001',
  sourceUrl: 'https://Archive.org/?edition=Print',
  sourceRole: 'canonical',
}];

function fixture(name) {
  return fs.readFileSync(path.join(fixtureDir, name));
}

function metadata({ parameters = defaultParameters, objectMappings = defaultMappings } = {}) {
  const requestUrl = `https://web.archive.org/cdx/search/cdx?${new URLSearchParams(
    parameters.map(parameter => [parameter.name, parameter.value]),
  )}`;
  return {
    resultVersion: CDX_RESULT_VERSION,
    adapter: {
      name: CDX_ADAPTER_NAME,
      version: CDX_ADAPTER_VERSION,
    },
    query: {
      requestUrl,
      parameters,
    },
    checkedAt: '2026-10-14T20:30:00.000Z',
    objectMappings,
  };
}

function assertSchemaAccepts(result, label) {
  assert.equal(validateSchema(result), true, `${label}: ${JSON.stringify(validateSchema.errors)}`);
}

function assertParseError(name, expectedRow, messagePattern) {
  assert.throws(
    () => parseCdxPage(fixture(name), metadata()),
    error => {
      assert.ok(error instanceof CdxResultError);
      assert.equal(error.row, expectedRow);
      assert.equal(error.nextCursor, null);
      assert.equal(Object.hasOwn(error, 'captures'), false);
      assert.match(error.message, messagePattern);
      return true;
    },
  );
}

describe('offline Wayback CDX result contract (#903)', () => {
  it('parses an official one-capture shape and validates the published schema', () => {
    const result = parseCdxPage(fixture('one.json'), metadata());

    assert.deepEqual(result.captures, [{
      captureTimestamp: '19970126045828',
      returnedOriginalUrl: 'http://www.archive.org:80/',
      status: '200',
      mediaType: 'text/html',
      opaqueDigest: 'Q4YULN754FHV2U6Q5JUT6Q2P57WEWNNY',
      replayUrl: 'https://web.archive.org/web/19970126045828/http://www.archive.org:80/',
    }]);
    assert.deepEqual(result.coverage, {
      state: 'complete',
      reason: 'full-history-exhausted',
      empty: false,
      earliestCaptureTimestamp: '19970126045828',
      latestCaptureTimestamp: '19970126045828',
    });
    assert.equal(result.nextCursor, null);
    assert.match(result.query.fingerprint, /^sha256:[a-f0-9]{64}$/);
    assertSchemaAccepts(result, 'one capture');
  });

  it('distinguishes a proven complete empty result from failure and exclusion', () => {
    const empty = parseCdxPage(fixture('zero.json'), metadata());
    const one = parseCdxPage(fixture('one.json'), metadata());
    assert.deepEqual(empty.coverage, {
      state: 'complete',
      reason: 'full-history-exhausted',
      empty: true,
    });
    assert.deepEqual(empty.captures, []);

    const common = {
      resultVersion: empty.resultVersion,
      adapter: empty.adapter,
      query: empty.query,
      checkedAt: empty.checkedAt,
      objectMappings: empty.objectMappings,
    };
    const failure = {
      ...common,
      outcome: 'query-failure',
      coverage: { state: 'unknown', reason: 'query-failure' },
      failure: { code: 'http-error', message: 'The CDX query failed.' },
    };
    const excluded = {
      ...common,
      outcome: 'excluded',
      coverage: { state: 'unknown', reason: 'excluded' },
      exclusion: { code: 'policy-exclusion', source: 'rights-policy@1.0.0' },
    };

    for (const [label, result] of [
      ['empty complete result', empty],
      ['query failure', failure],
      ['explicit exclusion', excluded],
    ]) {
      assertSchemaAccepts(result, label);
    }
    assert.deepEqual(
      [empty.outcome, failure.outcome, excluded.outcome],
      ['success', 'query-failure', 'excluded'],
    );

    const falseEmpty = structuredClone(empty);
    falseEmpty.captures = one.captures;
    assert.equal(validateSchema(falseEmpty), false);

    const successWithFailureCoverage = structuredClone(one);
    successWithFailureCoverage.coverage = { state: 'unknown', reason: 'query-failure' };
    assert.equal(validateSchema(successWithFailureCoverage), false);
  });

  it('validates every capture before returning the documented resume key', () => {
    const result = parseCdxPage(fixture('many-with-resume.json'), metadata());

    assert.equal(result.captures.length, 3);
    assert.equal(result.nextCursor, 'org%2Carchive%29%2F+19971211122953%21');
    assert.deepEqual(result.coverage, {
      state: 'partial',
      reason: 'resume-key-present',
    });
    assert.equal(Object.hasOwn(result.coverage, 'empty'), false);
    assert.equal(Object.hasOwn(result.coverage, 'earliestCaptureTimestamp'), false);
    assertSchemaAccepts(result, 'continued result');

    const missingCursor = structuredClone(result);
    missingCursor.nextCursor = null;
    assert.equal(validateSchema(missingCursor), false);
  });

  it('uses header names instead of fixed positions', () => {
    const result = parseCdxPage(fixture('reordered-header.json'), metadata());

    assert.equal(result.captures[0].captureTimestamp, '19970126045828');
    assert.equal(result.captures[0].returnedOriginalUrl, 'http://www.archive.org:80/');
    assert.equal(result.captures[0].status, '200');
    assert.equal(result.captures[0].mediaType, 'text/html');
    assert.equal(result.captures[0].opaqueDigest, 'Q4YULN754FHV2U6Q5JUT6Q2P57WEWNNY');
  });

  it('preserves returned originals and keeps object mappings outside query identity', () => {
    const first = parseCdxPage(fixture('one.json'), metadata());
    const second = parseCdxPage(fixture('one.json'), metadata({
      objectMappings: [{
        objectId: 'urn:rosen:object:archive-record:RECORD-00002',
        sourceUrl: 'https://archive.org/?edition=Web',
        sourceRole: 'alternate',
      }],
    }));

    assert.equal(first.captures[0].returnedOriginalUrl, 'http://www.archive.org:80/');
    assert.equal(first.objectMappings[0].sourceUrl, 'https://Archive.org/?edition=Print');
    assert.equal(first.query.requestUrl, metadata().query.requestUrl);
    assert.equal(first.query.fingerprint, second.query.fingerprint);
    assert.notDeepEqual(first.objectMappings, second.objectMappings);
  });

  it('retains equal opaque digests at distinct capture timestamps', () => {
    const result = parseCdxPage(
      fixture('equal-digest-distinct-timestamps.json'),
      metadata(),
    );

    assert.equal(result.captures.length, 2);
    assert.equal(result.captures[0].opaqueDigest, result.captures[1].opaqueDigest);
    assert.notEqual(
      result.captures[0].captureTimestamp,
      result.captures[1].captureTimestamp,
    );
  });

  it('withholds complete and absolute bounds for restricted or uncertain requests', () => {
    for (const restriction of [
      { name: 'filter', value: 'statuscode:200' },
      { name: 'collapse', value: 'digest' },
      { name: 'from', value: '2000' },
    ]) {
      const result = parseCdxPage(fixture('zero.json'), metadata({
        parameters: [...defaultParameters, restriction],
      }));
      assert.deepEqual(result.coverage, {
        state: 'partial',
        reason: 'restricted-query',
      });
      assert.equal(Object.hasOwn(result.coverage, 'empty'), false, restriction.name);
      assert.equal(Object.hasOwn(result.coverage, 'earliestCaptureTimestamp'), false);
      assertSchemaAccepts(result, restriction.name);
    }

    const withoutResumeEvidence = defaultParameters.filter(
      parameter => parameter.name !== 'showResumeKey',
    );
    const unknown = parseCdxPage(fixture('zero.json'), metadata({
      parameters: withoutResumeEvidence,
    }));
    assert.deepEqual(unknown.coverage, {
      state: 'unknown',
      reason: 'request-scope-unproven',
    });
    assert.equal(Object.hasOwn(unknown.coverage, 'empty'), false);
    assertSchemaAccepts(unknown, 'unknown request scope');

    const invalidMatchType = parseCdxPage(fixture('zero.json'), metadata({
      parameters: [...defaultParameters, { name: 'matchType', value: 'nearby' }],
    }));
    assert.deepEqual(invalidMatchType.coverage, {
      state: 'unknown',
      reason: 'request-scope-unproven',
    });
  });

  it('does not claim complete history for a terminal continuation page', () => {
    const result = parseCdxPage(fixture('one.json'), metadata({
      parameters: [
        ...defaultParameters,
        { name: 'resumeKey', value: 'org%2Carchive%29%2F+19960101000000%21' },
      ],
    }));

    assert.deepEqual(result.coverage, {
      state: 'partial',
      reason: 'continuation-page',
    });
    assert.equal(Object.hasOwn(result.coverage, 'earliestCaptureTimestamp'), false);
  });

  it('rejects duplicate headers, malformed rows, impossible dates, and truncated trailers', () => {
    assertParseError('duplicate-header.json', 1, /duplicate field digest/);
    assertParseError('missing-required-header.json', 1, /missing required field digest/);
    assertParseError('malformed-width.json', 2, /does not match header width/);
    assertParseError('malformed-date.json', 2, /real UTC capture date/);
    assertParseError('truncated-trailer.json', 3, /resume-key row/);

    const withoutResumeEvidence = defaultParameters.filter(
      parameter => parameter.name !== 'showResumeKey',
    );
    assert.throws(
      () => parseCdxPage(fixture('many-with-resume.json'), metadata({
        parameters: withoutResumeEvidence,
      })),
      error => error instanceof CdxResultError
        && error.row === 6
        && error.nextCursor === null
        && /requires showResumeKey=true/.test(error.message),
    );
  });

  it('rejects a capture timestamp after the recorded check time', () => {
    const beforeCapture = metadata();
    beforeCapture.checkedAt = '1996-01-01T00:00:00.000Z';
    assert.throws(
      () => parseCdxPage(fixture('one.json'), beforeCapture),
      error => error instanceof CdxResultError
        && error.row === 2
        && /after checkedAt/.test(error.message),
    );
  });

  it('fails usefully for unsupported contract and adapter versions', () => {
    const unsupportedResult = metadata();
    unsupportedResult.resultVersion = '2.0.0';
    assert.throws(
      () => parseCdxPage(fixture('zero.json'), unsupportedResult),
      /unsupported CDX result version 2\.0\.0/,
    );

    const unsupportedAdapter = metadata();
    unsupportedAdapter.adapter.version = '2.0.0';
    assert.throws(
      () => parseCdxPage(fixture('zero.json'), unsupportedAdapter),
      /unsupported CDX adapter version 2\.0\.0/,
    );
    assert.throws(
      () => serializeCdxResult({ resultVersion: '2.0.0' }),
      /unsupported CDX result version 2\.0\.0/,
    );
  });

  it('serializes the same result to byte-identical canonical JSON', () => {
    const result = parseCdxPage(fixture('one.json'), metadata());
    const reordered = Object.fromEntries(Object.entries(result).reverse());

    assert.equal(serializeCdxResult(result), serializeCdxResult(reordered));
    assert.ok(serializeCdxResult(result).endsWith('\n'));
  });

  it('does not infer replay state from an indexed HTTP 200 capture', () => {
    const result = parseCdxPage(fixture('one.json'), metadata());
    assert.equal(result.captures[0].status, '200');
    assert.equal(Object.hasOwn(result.captures[0], 'replayState'), false);

    const inventedReplayState = structuredClone(result);
    inventedReplayState.captures[0].replayState = 'available';
    assert.equal(validateSchema(inventedReplayState), false);
  });

  it('parses injected bytes without calling a network function', () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = () => {
      calls += 1;
      throw new Error('network access is forbidden in this test');
    };
    try {
      const result = parseCdxPage(fixture('zero.json'), metadata());
      assert.equal(result.outcome, 'success');
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
