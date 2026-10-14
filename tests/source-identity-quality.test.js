import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { parse } from 'csv-parse/sync';

import {
  buildSourceIdentityReport,
  evaluateSourceIdentityQuality,
  formatSourceIdentityReportJson,
  formatSourceIdentitySummary,
  loadSourceIdentityInputs,
  parsePublicationDate
} from '../scripts/evaluate-source-identity-quality.mjs';
import { unescapeRow } from '../data/lib/csv-unescape.js';

const rootDir = process.cwd();
const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'source-identity-quality');
const policyPath = path.join(rootDir, 'data', 'source-identity-quality-policy.json');

function writeFixtureEvidence(directory, transform = value => value) {
  const evidence = transform({
    schema: { id: 'source-identity-quality-evidence/1.0.0' },
    exceptions: [
      {
        record_id: 'RECORD-00002',
        rule_id: 'source.url.presence',
        rule_versions: ['1.0.0'],
        decision: 'intentionally_absent',
        reason: 'The curator approved this source URL absence.',
        evidence: [
          { type: 'curator_decision', reference: 'fixture-decision-001' }
        ]
      }
    ],
    historical_measurements: [
      {
        id: 'fixture-social-source-cohort',
        observed_at_commit: '0000000000000000000000000000000000000000',
        source_rows: 1,
        missing_url: 1,
        uncertain_verification: 1,
        overlap: 1,
        evidence: 'fixture specification',
        overlap_record_ids: ['BSKY-00001']
      }
    ]
  });
  const evidencePath = path.join(directory, 'evidence.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidencePath;
}

function fixtureInputs(t, transformEvidence) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-identity-quality-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  return loadSourceIdentityInputs({
    dataDir: fixtureDir,
    policyPath,
    evidencePath: writeFixtureEvidence(tempDir, transformEvidence)
  });
}

function fixtureReport(t) {
  return buildSourceIdentityReport(fixtureInputs(t));
}

function recordById(report, recordId) {
  const record = report.records.find(item => item.record_id === recordId);
  assert.ok(record, `missing fixture record ${recordId}`);
  return record;
}

function resultFor(report, recordId, ruleId) {
  const result = recordById(report, recordId).results.find(item => item.rule_id === ruleId);
  assert.ok(result, `missing ${ruleId} result for ${recordId}`);
  return result;
}

function readSourceRows(filePath) {
  return parse(fs.readFileSync(filePath), {
    bom: true,
    columns: true,
    skip_empty_lines: true
  }).map(unescapeRow);
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe('source identity quality date parsing', () => {
  it('accepts repository date forms and rejects impossible calendar values', () => {
    assert.deepEqual(parsePublicationDate('2024-02-29'), { format: 'date' });
    assert.deepEqual(parsePublicationDate('2025-10-14 2:12:59'), { format: 'date-time-local' });
    assert.deepEqual(parsePublicationDate('2025-01-01T23:59:59Z'), { format: 'date-time-with-zone' });
    assert.equal(parsePublicationDate('2023-02-29'), null);
    assert.equal(parsePublicationDate('2025-01-01T24:00:00Z'), null);
    assert.equal(parsePublicationDate('2025-01-01T12:00:00+14:30'), null);
    assert.equal(parsePublicationDate('March 4, 2025'), null);
  });
});

describe('source identity quality evaluator', () => {
  it('uses source file and content type for profiles and separates source from runtime denominators', t => {
    const report = fixtureReport(t);

    assert.deepEqual(report.denominators.source, {
      total: 10,
      by_class: {
        curated_article: 2,
        curated_other: 3,
        social_post: 4,
        thread_container: 1
      }
    });
    assert.deepEqual(report.denominators.published_runtime, {
      total: 5,
      source_backed: 3,
      generated_or_injected: 2,
      source_backed_by_class: {
        curated_article: 1,
        curated_other: 0,
        social_post: 1,
        thread_container: 1
      }
    });
    assert.deepEqual(report.input.files.map(file => file.role), [
      'policy',
      'evidence',
      'source:archive_records-public.csv',
      'source:social_posts.csv',
      'runtime:archive-data.json'
    ]);
    assert.ok(report.input.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256)));
    assert.equal(
      report.input.files.find(file => file.role === 'source:archive_records-public.csv').sha256,
      fileSha256(path.join(fixtureDir, 'archive_records-public.csv'))
    );
    assert.equal(
      report.input.files.find(file => file.role === 'source:social_posts.csv').sha256,
      fileSha256(path.join(fixtureDir, 'social_posts.csv'))
    );
    assert.equal(recordById(report, 'THREAD-00002').record_class, 'curated_article');
    assert.equal(resultFor(report, 'THREAD-00002', 'source.id.format').state, 'invalid');
    assert.equal(recordById(report, 'RECORD-00004').record_class, 'social_post');
    assert.equal(resultFor(report, 'RECORD-00004', 'source.id.format').state, 'invalid');
    assert.equal(recordById(report, 'RECORD-00005').record_class, 'curated_other');
    assert.equal(resultFor(report, 'RECORD-00005', 'source.publication_date.presence').state, 'pass');
    assert.equal(resultFor(report, 'RECORD-00005', 'source.publication_date.parseability').state, 'invalid');
    assert.equal(recordById(report, 'RECORD-00005').state, 'needs_review');
  });

  it('keeps exact curated profiles ahead of the curated fallback', t => {
    const report = fixtureReport(t);

    assert.equal(recordById(report, 'RECORD-00001').record_class, 'curated_article');
    assert.equal(recordById(report, 'THREAD-00001').record_class, 'thread_container');
    assert.equal(recordById(report, 'RECORD-00005').record_class, 'curated_other');
  });

  it('refuses an unclassified social content type', t => {
    const inputs = fixtureInputs(t);
    inputs.rows.find(item => item.row.id === 'TWTR-00001').row.content_type = 'Unknown social form';
    assert.throws(
      () => buildSourceIdentityReport(inputs),
      /No quality profile for social_posts\.csv content_type="Unknown social form"/
    );
  });

  it('keeps missing, invalid, uncertain, intentional and not-applicable states distinct', t => {
    const report = fixtureReport(t);

    const approved = resultFor(report, 'RECORD-00002', 'source.url.presence');
    assert.equal(approved.state, 'intentionally_absent');
    assert.equal(approved.observed_state, 'missing');
    assert.deepEqual(approved.exception.evidence, [
      { type: 'curator_decision', reference: 'fixture-decision-001' }
    ]);
    assert.equal(resultFor(report, 'RECORD-00002', 'source.url.syntax').state, 'not_applicable');

    assert.equal(resultFor(report, 'BSKY-00001', 'source.url.presence').state, 'missing');
    assert.equal(resultFor(report, 'BSKY-00001', 'source.url.syntax').state, 'not_applicable');
    assert.equal(resultFor(report, 'BSKY-00001', 'source.verification.state').state, 'uncertain');
    assert.equal(resultFor(report, 'TWTR-00001', 'source.url.presence').state, 'pass');
    assert.equal(resultFor(report, 'TWTR-00001', 'source.url.syntax').state, 'invalid');
    assert.equal(resultFor(report, 'RECORD-00003', 'source.curated_summary.presence').state, 'missing');
    assert.equal(resultFor(report, 'BSKY-00001', 'source.curated_summary.presence').state, 'not_applicable');
    assert.equal(resultFor(report, 'RECORD-00003', 'source.publication_date.parseability').state, 'invalid');
    assert.equal(resultFor(report, 'MAST-00001', 'source.publication_date.parseability').state, 'invalid');

    assert.deepEqual(report.summary.records.states, {
      critical_failure: 4,
      needs_review: 3,
      pass: 3
    });
    assert.deepEqual(report.summary.critical_failures, { results: 5, records: 4 });
    assert.equal(report.summary.results.score_percent, 85.94);
    assert.equal(report.current_social_findings.summary_not_applicable.count, 4);
  });

  it('retains the measured cohort while recomputing its current overlap', t => {
    const report = fixtureReport(t);

    assert.deepEqual(report.current_social_findings.missing_url.record_ids, ['BSKY-00001']);
    assert.deepEqual(report.current_social_findings.uncertain_verification.record_ids, ['BSKY-00001']);
    assert.deepEqual(report.current_social_findings.missing_url_and_uncertain_verification_overlap.record_ids, ['BSKY-00001']);
    assert.deepEqual(report.historical_measurements[0].current_cohort, {
      present: 1,
      missing_from_source: [],
      missing_url: 1,
      uncertain_verification: 1,
      overlap: 1
    });
  });

  it('produces stable ordered serialization and changes only the affected result identity for a rule version', t => {
    const inputs = fixtureInputs(t);
    const first = buildSourceIdentityReport(inputs);
    const second = buildSourceIdentityReport(inputs);
    assert.equal(formatSourceIdentityReportJson(first), formatSourceIdentityReportJson(second));
    assert.deepEqual(first.records.map(record => record.record_id), [
      'RECORD-00001',
      'RECORD-00002',
      'RECORD-00003',
      'RECORD-00005',
      'THREAD-00001',
      'THREAD-00002',
      'BSKY-00001',
      'MAST-00001',
      'RECORD-00004',
      'TWTR-00001'
    ]);
    assert.match(resultFor(first, 'BSKY-00001', 'source.url.presence').id, /^source-quality-result:[a-f0-9]{64}$/);

    const changedInputs = structuredClone(inputs);
    changedInputs.policy.rules.find(rule => rule.id === 'source.url.presence').version = '1.0.1';
    const changed = buildSourceIdentityReport(changedInputs);
    assert.notEqual(
      resultFor(changed, 'BSKY-00001', 'source.url.presence').id,
      resultFor(first, 'BSKY-00001', 'source.url.presence').id
    );
    assert.equal(
      resultFor(changed, 'BSKY-00001', 'source.verification.state').id,
      resultFor(first, 'BSKY-00001', 'source.verification.state').id
    );
  });

  it('rejects an absence decision without evidence', t => {
    assert.throws(
      () => fixtureInputs(t, registry => {
        registry.exceptions[0].evidence = [];
        return registry;
      }),
      /evidence must not be empty/
    );
  });

  it('formats a short summary without embedding per-record source payloads', t => {
    const summary = formatSourceIdentitySummary(fixtureReport(t));
    assert.match(summary, /Source rows/);
    assert.match(summary, /Critical findings: 5 results across 4 source records/);
    assert.match(summary, /Social rows missing a source URL: 1\. Explicitly unverified: 1\. Overlap: 1\./);
    assert.doesNotMatch(summary, /Curator summary/);
  });

  it('reports producer-like Appearance findings without failing or changing inputs', t => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-identity-quality-cli-'));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const evidencePath = writeFixtureEvidence(tempDir);
    const inputPaths = [
      policyPath,
      evidencePath,
      path.join(fixtureDir, 'archive_records-public.csv'),
      path.join(fixtureDir, 'social_posts.csv'),
      path.join(fixtureDir, 'archive-data.json')
    ];
    const hashesBefore = inputPaths.map(fileSha256);

    const summary = execFileSync(
      process.execPath,
      [
        path.join(rootDir, 'scripts', 'evaluate-source-identity-quality.mjs'),
        '--data-dir', fixtureDir,
        '--policy', policyPath,
        '--evidence', evidencePath
      ],
      { cwd: rootDir, encoding: 'utf8' }
    );

    assert.match(summary, /\| invalid \| 6 \|/);
    assert.match(summary, /Critical findings: 5 results across 4 source records/);
    assert.deepEqual(inputPaths.map(fileSha256), hashesBefore);
  });
});

describe('current source identity baseline', () => {
  it('reconciles live source and runtime arithmetic without imposing quality thresholds', () => {
    const report = evaluateSourceIdentityQuality({ rootDir });
    const registry = JSON.parse(fs.readFileSync(
      path.join(rootDir, 'data', 'source-identity-quality-evidence.json'),
      'utf8'
    ));
    const curatedRows = readSourceRows(path.join(rootDir, 'data', 'archive_records-public.csv'));
    const socialRows = readSourceRows(path.join(rootDir, 'data', 'social_posts.csv'));
    const runtimeRecords = JSON.parse(fs.readFileSync(
      path.join(rootDir, 'data', 'archive-data.json'),
      'utf8'
    )).records;
    const missingUrlIds = socialRows
      .filter(row => !String(row.url || '').trim())
      .map(row => row.id)
      .sort();
    const uncertainIds = socialRows
      .filter(row => ['false', 'no', '0'].includes(String(row.verified || '').trim().toLowerCase()))
      .map(row => row.id)
      .sort();
    const uncertainSet = new Set(uncertainIds);
    const overlapIds = missingUrlIds.filter(id => uncertainSet.has(id));
    const curatedMissingUrlIds = curatedRows
      .filter(row => !String(row.url || '').trim())
      .map(row => row.id)
      .sort();

    assert.equal(report.denominators.source.total, curatedRows.length + socialRows.length);
    assert.equal(report.denominators.source.by_class.social_post, socialRows.length);
    assert.equal(
      Object.values(report.denominators.source.by_class).reduce((sum, count) => sum + count, 0),
      report.denominators.source.total
    );
    assert.equal(report.denominators.published_runtime.total, runtimeRecords.length);
    assert.equal(
      report.denominators.published_runtime.source_backed
        + report.denominators.published_runtime.generated_or_injected,
      report.denominators.published_runtime.total
    );
    assert.equal(
      Object.values(report.denominators.published_runtime.source_backed_by_class)
        .reduce((sum, count) => sum + count, 0),
      report.denominators.published_runtime.source_backed
    );
    assert.equal(
      Object.values(report.summary.records.states).reduce((sum, count) => sum + count, 0),
      report.summary.records.total
    );
    assert.equal(
      Object.values(report.summary.results.states).reduce((sum, count) => sum + count, 0),
      report.summary.results.total
    );
    assert.equal(
      report.summary.results.applicable + report.summary.results.states.not_applicable,
      report.summary.results.total
    );
    assert.equal(
      report.summary.results.passing,
      report.summary.results.states.pass + report.summary.results.states.intentionally_absent
    );
    assert.equal(report.summary.critical_failures.results, report.critical_failures.length);
    assert.equal(
      report.summary.critical_failures.records,
      new Set(report.critical_failures.map(finding => finding.record_id)).size
    );
    assert.deepEqual(report.current_curated_findings.missing_url, {
      count: curatedMissingUrlIds.length,
      record_ids: curatedMissingUrlIds
    });
    assert.deepEqual(report.current_social_findings.missing_url.record_ids, missingUrlIds);
    assert.deepEqual(report.current_social_findings.uncertain_verification.record_ids, uncertainIds);
    assert.deepEqual(report.current_social_findings.missing_url_and_uncertain_verification_overlap.record_ids, overlapIds);
    assert.equal(report.current_social_findings.summary_not_applicable.count, socialRows.length);
    const measuredIds = new Set(report.historical_measurements[0].measured.overlap_record_ids);
    assert.equal(
      report.historical_measurements[0].current_cohort.overlap,
      overlapIds.filter(id => measuredIds.has(id)).length
    );
    assert.equal(report.exceptions.length, registry.exceptions.length);
  });

  it('grounds the historical overlap cohort in the archived recovery note', () => {
    const registry = JSON.parse(fs.readFileSync(
      path.join(rootDir, 'data', 'source-identity-quality-evidence.json'),
      'utf8'
    ));
    const measurement = registry.historical_measurements.find(item => (
      item.id === 'social-source-recovery-unresolved-2026-07-23'
    ));
    assert.ok(measurement);
    const note = execFileSync(
      'git',
      ['show', `${measurement.observed_at_commit}:${measurement.evidence}`],
      { cwd: rootDir, encoding: 'utf8' }
    );
    const section = /## Remaining queued row IDs[\s\S]*?```text\n([\s\S]*?)```/.exec(note);
    assert.ok(section, 'recovery note must keep the remaining queued ID evidence');
    const documentedIds = section[1].trim().split(/\s+/).sort();

    assert.equal(measurement.overlap, 38);
    assert.deepEqual([...measurement.overlap_record_ids].sort(), documentedIds);
  });
});
