#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parse } from 'csv-parse/sync';
import { unescapeRow } from '../data/lib/csv-unescape.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_SCHEMA_ID = 'source-identity-quality-report/1.0.0';
const DEFAULT_POLICY_PATH = path.join(ROOT_DIR, 'data', 'source-identity-quality-policy.json');
const DEFAULT_EVIDENCE_PATH = path.join(ROOT_DIR, 'data', 'source-identity-quality-evidence.json');
const SOURCE_FILES = ['archive_records-public.csv', 'social_posts.csv'];
const RUNTIME_FILE = 'archive-data.json';
const FAILING_STATES = new Set(['missing', 'invalid', 'stale', 'uncertain']);

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function stableObject(entries) {
  return Object.fromEntries(
    Object.entries(entries).sort(([left], [right]) => compareCodeUnits(left, right))
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readCsv(filePath) {
  return parse(fs.readFileSync(filePath), {
    bom: true,
    columns: true,
    skip_empty_lines: true
  }).map(unescapeRow);
}

function isPresent(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function assertString(value, location) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${location} must be a non-empty string`);
  }
}

function assertUnique(items, valueFn, location) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    const value = valueFn(item);
    if (seen.has(value)) throw new Error(`${location}[${index}] duplicates ${value}`);
    seen.add(value);
  }
}

function assertVersion(value, location) {
  if (!/^\d+\.\d+\.\d+$/.test(value || '')) {
    throw new Error(`${location} must be a semantic version`);
  }
}

function validatePolicy(policy) {
  if (policy?.schema?.id !== 'source-identity-quality-policy/1.0.0') {
    throw new Error('Unsupported source identity quality policy schema');
  }
  assertString(policy?.policy?.id, 'policy.policy.id');
  assertVersion(policy?.policy?.version, 'policy.policy.version');
  if (!Array.isArray(policy.states) || !Array.isArray(policy.rules) || !Array.isArray(policy.profiles)) {
    throw new Error('Policy states, rules and profiles must be arrays');
  }
  assertUnique(policy.rules, rule => rule.id, 'policy.rules');
  assertUnique(policy.profiles, profile => profile.id, 'policy.profiles');
  const states = new Set(policy.states);
  for (const required of ['pass', 'missing', 'invalid', 'stale', 'uncertain', 'intentionally_absent', 'not_applicable']) {
    if (!states.has(required)) throw new Error(`Policy omits required result state: ${required}`);
  }
  const ruleIds = new Set(policy.rules.map(rule => rule.id));
  for (const [index, rule] of policy.rules.entries()) {
    assertString(rule.id, `policy.rules[${index}].id`);
    assertVersion(rule.version, `policy.rules[${index}].version`);
    assertString(rule.field, `policy.rules[${index}].field`);
    assertString(rule.evidence_requirement, `policy.rules[${index}].evidence_requirement`);
    assertString(rule.remediation_type, `policy.rules[${index}].remediation_type`);
    if (!['id_format', 'presence', 'http_url', 'publication_date', 'verification'].includes(rule.evaluator)) {
      throw new Error(`policy.rules[${index}] has unsupported evaluator: ${rule.evaluator}`);
    }
    if (!['critical', 'high', 'medium', 'low'].includes(rule.severity)) {
      throw new Error(`policy.rules[${index}] has unsupported severity: ${rule.severity}`);
    }
  }
  for (const [index, profile] of policy.profiles.entries()) {
    assertString(profile.id, `policy.profiles[${index}].id`);
    assertVersion(profile.version, `policy.profiles[${index}].version`);
    assertString(profile?.match?.source_file, `policy.profiles[${index}].match.source_file`);
    if (typeof profile.id_pattern !== 'string' || profile.id_pattern.trim().length === 0) {
      throw new Error(`policy.profiles[${index}].id_pattern must be a non-empty string`);
    }
    try {
      new RegExp(profile.id_pattern);
    } catch {
      throw new Error(`policy.profiles[${index}].id_pattern is not a valid regular expression`);
    }
    const applicable = profile.applicable_rules || [];
    const notApplicable = profile.not_applicable_rules || [];
    assertUnique([...applicable, ...notApplicable], value => value, `policy.profiles[${index}].rules`);
    for (const ruleId of [...applicable, ...notApplicable]) {
      if (!ruleIds.has(ruleId)) throw new Error(`Profile ${profile.id} references unknown rule ${ruleId}`);
    }
    if (new Set([...applicable, ...notApplicable]).size !== ruleIds.size) {
      throw new Error(`Profile ${profile.id} must classify every policy rule`);
    }
  }
  return policy;
}

function validateEvidenceRegistry(registry, policy) {
  if (registry?.schema?.id !== 'source-identity-quality-evidence/1.0.0') {
    throw new Error('Unsupported source identity quality evidence schema');
  }
  if (!Array.isArray(registry.exceptions) || !Array.isArray(registry.historical_measurements)) {
    throw new Error('Evidence exceptions and historical_measurements must be arrays');
  }
  const ruleById = new Map(policy.rules.map(rule => [rule.id, rule]));
  assertUnique(registry.exceptions, item => `${item.record_id}\u0000${item.rule_id}`, 'evidence.exceptions');
  for (const [index, item] of registry.exceptions.entries()) {
    const location = `evidence.exceptions[${index}]`;
    assertString(item.record_id, `${location}.record_id`);
    assertString(item.rule_id, `${location}.rule_id`);
    if (item.decision !== 'intentionally_absent') {
      throw new Error(`${location}.decision must be intentionally_absent`);
    }
    const rule = ruleById.get(item.rule_id);
    if (!rule) throw new Error(`${location} references unknown rule ${item.rule_id}`);
    if (!rule.allows_intentional_absence) {
      throw new Error(`${location} targets a rule that does not allow an intentional absence`);
    }
    if (!Array.isArray(item.rule_versions) || item.rule_versions.length === 0) {
      throw new Error(`${location}.rule_versions must name at least one version`);
    }
    assertUnique(item.rule_versions, value => value, `${location}.rule_versions`);
    item.rule_versions.forEach((version, versionIndex) => {
      assertVersion(version, `${location}.rule_versions[${versionIndex}]`);
    });
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
      throw new Error(`${location}.evidence must not be empty`);
    }
    assertString(item.reason, `${location}.reason`);
    for (const [evidenceIndex, evidence] of item.evidence.entries()) {
      assertString(evidence?.type, `${location}.evidence[${evidenceIndex}].type`);
      assertString(evidence?.reference, `${location}.evidence[${evidenceIndex}].reference`);
    }
  }
  assertUnique(registry.historical_measurements, item => item.id, 'evidence.historical_measurements');
  for (const [index, item] of registry.historical_measurements.entries()) {
    const location = `evidence.historical_measurements[${index}]`;
    assertString(item.id, `${location}.id`);
    assertString(item.evidence, `${location}.evidence`);
    if (!/^[a-f0-9]{40}$/.test(item.observed_at_commit || '')) {
      throw new Error(`${location}.observed_at_commit must be a lowercase 40-character commit hash`);
    }
    for (const field of ['source_rows', 'missing_url', 'uncertain_verification', 'overlap']) {
      if (!Number.isSafeInteger(item[field]) || item[field] < 0) {
        throw new Error(`${location}.${field} must be a nonnegative integer`);
      }
    }
    for (const field of ['missing_url', 'uncertain_verification']) {
      if (item[field] > item.source_rows) {
        throw new Error(`${location}.${field} cannot exceed source_rows`);
      }
    }
    if (!Array.isArray(item.overlap_record_ids)) {
      throw new Error(`${location}.overlap_record_ids must be an array`);
    }
    assertUnique(item.overlap_record_ids, value => value, `${location}.overlap_record_ids`);
    if (item.overlap_record_ids.length !== item.overlap) {
      throw new Error(`${location}.overlap must equal overlap_record_ids.length`);
    }
    if (item.overlap > item.missing_url || item.overlap > item.uncertain_verification) {
      throw new Error(`${location}.overlap cannot exceed either finding count`);
    }
    item.overlap_record_ids.forEach((recordId, recordIndex) => {
      assertString(recordId, `${location}.overlap_record_ids[${recordIndex}]`);
    });
  }
  return registry;
}

export function loadSourceIdentityInputs({
  rootDir = ROOT_DIR,
  dataDir = path.join(rootDir, 'data'),
  policyPath = path.join(rootDir, 'data', 'source-identity-quality-policy.json'),
  evidencePath = path.join(rootDir, 'data', 'source-identity-quality-evidence.json')
} = {}) {
  const policy = validatePolicy(readJson(policyPath));
  const evidenceRegistry = validateEvidenceRegistry(readJson(evidencePath), policy);
  const rows = SOURCE_FILES.flatMap(sourceFile => (
    readCsv(path.join(dataDir, sourceFile)).map((row, index) => ({
      row,
      sourceFile,
      sourceRow: index + 2
    }))
  ));
  const runtime = readJson(path.join(dataDir, RUNTIME_FILE));
  if (!Array.isArray(runtime.records)) {
    throw new Error(`${path.join(dataDir, RUNTIME_FILE)} must contain a records array`);
  }
  const inputs = [
    ['policy', policyPath],
    ['evidence', evidencePath],
    ...SOURCE_FILES.map(sourceFile => [`source:${sourceFile}`, path.join(dataDir, sourceFile)]),
    ['runtime:archive-data.json', path.join(dataDir, RUNTIME_FILE)]
  ].map(([role, filePath]) => ({
    role,
    path: path.basename(filePath),
    sha256: sha256(fs.readFileSync(filePath))
  }));
  return { policy, evidenceRegistry, rows, runtime, inputs };
}

function profileForRow(policy, sourceFile, row) {
  const contentType = String(row.content_type || '').trim();
  const candidates = policy.profiles.filter(profile => (
    profile.match.source_file === sourceFile
    && Array.isArray(profile.match.content_types)
    && profile.match.content_types.includes(contentType)
  ));
  if (candidates.length > 1) {
    throw new Error(`Ambiguous quality profile for ${sourceFile} content_type=${JSON.stringify(contentType)}`);
  }
  if (candidates.length === 1) return candidates[0];
  const fallbacks = policy.profiles.filter(profile => (
    profile.match.source_file === sourceFile && profile.match.fallback === true
  ));
  if (fallbacks.length !== 1) {
    throw new Error(`No quality profile for ${sourceFile} content_type=${JSON.stringify(contentType)}`);
  }
  return fallbacks[0];
}

function isValidCalendarDate(year, month, day) {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parsePublicationDate(value) {
  const text = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):?(\d{2}))?)?$/.exec(text);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction, offsetSign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isValidCalendarDate(year, month, day)) return null;
  if (hourText === undefined) return { format: 'date' };
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (offsetSign) {
    const offsetHour = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  }
  return {
    format: offsetSign || text.endsWith('Z') ? 'date-time-with-zone' : 'date-time-local',
    ...(fraction ? { fractional_seconds_digits: fraction.length } : {})
  };
}

function valueEvidence(field, value) {
  if (field === 'summary') {
    return { field, present: isPresent(value), length: String(value || '').trim().length };
  }
  return { field, value: String(value || '').trim() };
}

function evaluateObservedRule(rule, profile, row) {
  const value = row[rule.field];
  const text = String(value || '').trim();
  if (rule.evaluator === 'id_format') {
    if (!text) return { state: 'missing', evidence: valueEvidence(rule.field, value), reason: 'The record ID is missing.' };
    const expectedPattern = profile.id_pattern;
    const valid = new RegExp(expectedPattern).test(text);
    return {
      state: valid ? 'pass' : 'invalid',
      evidence: { field: rule.field, value: text, expected_pattern: expectedPattern },
      reason: valid ? 'The record ID matches the class-specific format.' : 'The record ID does not match the class-specific format.'
    };
  }
  if (rule.evaluator === 'presence') {
    const present = isPresent(value);
    return {
      state: present ? 'pass' : 'missing',
      evidence: valueEvidence(rule.field, value),
      reason: present ? `The ${rule.field} field is present.` : `The ${rule.field} field is missing.`
    };
  }
  if (rule.evaluator === 'http_url') {
    if (!text) {
      return {
        state: 'not_applicable',
        evidence: valueEvidence(rule.field, value),
        reason: 'URL syntax cannot be evaluated because the URL is missing.'
      };
    }
    try {
      const parsed = new URL(text);
      const valid = ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname);
      return {
        state: valid ? 'pass' : 'invalid',
        evidence: { field: rule.field, value: text },
        reason: valid ? 'The source URL has valid HTTP or HTTPS syntax.' : 'The source URL must use HTTP or HTTPS and include a host.'
      };
    } catch {
      return {
        state: 'invalid',
        evidence: { field: rule.field, value: text },
        reason: 'The source URL is not syntactically valid.'
      };
    }
  }
  if (rule.evaluator === 'publication_date') {
    if (!text) {
      return {
        state: 'not_applicable',
        evidence: valueEvidence(rule.field, value),
        reason: 'Publication date syntax cannot be evaluated because the date is missing.'
      };
    }
    const parsed = parsePublicationDate(text);
    return {
      state: parsed ? 'pass' : 'invalid',
      evidence: { field: rule.field, value: text, ...(parsed || {}) },
      reason: parsed ? 'The publication date is a valid calendar date.' : 'The publication date is not a supported, valid calendar date.'
    };
  }
  if (rule.evaluator === 'verification') {
    if (!text) {
      return { state: 'missing', evidence: valueEvidence(rule.field, value), reason: 'The verification state is missing.' };
    }
    const canonicalValue = String(value);
    if (canonicalValue === 'TRUE') {
      return { state: 'pass', evidence: { field: rule.field, value: canonicalValue }, reason: 'The source row is verified.' };
    }
    if (canonicalValue === 'FALSE') {
      return { state: 'uncertain', evidence: { field: rule.field, value: canonicalValue }, reason: 'The source row is explicitly unverified.' };
    }
    return {
      state: 'invalid',
      evidence: { field: rule.field, value: canonicalValue },
      reason: 'The verification state must be exactly TRUE or FALSE.'
    };
  }
  throw new Error(`Unsupported evaluator: ${rule.evaluator}`);
}

function resultIdentity(policy, sourceFile, recordId, profile, rule) {
  const parts = [
    policy.policy.id,
    sourceFile,
    recordId,
    profile.id,
    profile.version,
    rule.id,
    rule.version
  ];
  return `source-quality-result:${sha256(parts.join('\u001f'))}`;
}

function exceptionFor(exceptions, recordId, rule) {
  const decision = exceptions.get(`${recordId}\u0000${rule.id}`);
  if (!decision || !decision.rule_versions.includes(rule.version)) return null;
  return decision;
}

function evaluateRule({ policy, profile, rule, sourceFile, row, exceptions }) {
  const recordId = String(row.id || '').trim();
  const id = resultIdentity(policy, sourceFile, recordId, profile, rule);
  if ((profile.not_applicable_rules || []).includes(rule.id)) {
    return {
      id,
      rule_id: rule.id,
      rule_version: rule.version,
      severity: rule.severity,
      state: 'not_applicable',
      evidence: { field: rule.field, profile: profile.id },
      reason: `The ${rule.field} rule does not apply to the ${profile.id} profile.`
    };
  }
  const observed = evaluateObservedRule(rule, profile, row);
  const exception = exceptionFor(exceptions, recordId, rule);
  if (observed.state === 'missing' && exception) {
    return {
      id,
      rule_id: rule.id,
      rule_version: rule.version,
      severity: rule.severity,
      state: 'intentionally_absent',
      observed_state: observed.state,
      evidence: observed.evidence,
      reason: exception.reason,
      exception: {
        decision: exception.decision,
        evidence: exception.evidence
      }
    };
  }
  return {
    id,
    rule_id: rule.id,
    rule_version: rule.version,
    severity: rule.severity,
    ...observed,
    ...(exception ? {
      exception: {
        decision: exception.decision,
        evidence: exception.evidence,
        applied: false
      }
    } : {})
  };
}

function countsForResults(results) {
  const states = {
    intentionally_absent: 0,
    invalid: 0,
    missing: 0,
    not_applicable: 0,
    pass: 0,
    stale: 0,
    uncertain: 0
  };
  for (const result of results) states[result.state] += 1;
  const applicable = results.length - states.not_applicable;
  const passing = states.pass + states.intentionally_absent;
  return {
    total: results.length,
    applicable,
    passing,
    score_percent: applicable === 0 ? null : Number(((passing / applicable) * 100).toFixed(2)),
    states
  };
}

function recordState(results) {
  if (results.some(result => result.severity === 'critical' && FAILING_STATES.has(result.state))) {
    return 'critical_failure';
  }
  if (results.some(result => FAILING_STATES.has(result.state))) return 'needs_review';
  return 'pass';
}

function socialFindings(records) {
  const social = records.filter(record => record.record_class === 'social_post');
  const idsFor = (ruleId, state) => social
    .filter(record => record.results.some(result => result.rule_id === ruleId && result.state === state))
    .map(record => record.record_id)
    .sort(compareCodeUnits);
  const missingUrl = idsFor('source.url.presence', 'missing');
  const uncertainVerification = idsFor('source.verification.state', 'uncertain');
  const summaryNotApplicable = idsFor('source.curated_summary.presence', 'not_applicable');
  const uncertainSet = new Set(uncertainVerification);
  const overlap = missingUrl.filter(id => uncertainSet.has(id));
  return {
    missing_url: { count: missingUrl.length, record_ids: missingUrl },
    uncertain_verification: { count: uncertainVerification.length, record_ids: uncertainVerification },
    missing_url_and_uncertain_verification_overlap: { count: overlap.length, record_ids: overlap },
    summary_not_applicable: { count: summaryNotApplicable.length },
    distinct_affected_records: new Set([...missingUrl, ...uncertainVerification]).size
  };
}

function curatedFindings(records) {
  const missingUrl = records
    .filter(record => record.record_class !== 'social_post')
    .filter(record => record.results.some(result => (
      result.rule_id === 'source.url.presence' && result.state === 'missing'
    )))
    .map(record => record.record_id)
    .sort(compareCodeUnits);
  return { missing_url: { count: missingUrl.length, record_ids: missingUrl } };
}

function historicalMeasurements(registry, records) {
  const byId = new Map(records.map(record => [record.record_id, record]));
  return registry.historical_measurements.map(measurement => {
    const ids = [...measurement.overlap_record_ids].sort(compareCodeUnits);
    const present = ids.filter(id => byId.has(id));
    const missingUrl = present.filter(id => byId.get(id).results.some(result => (
      result.rule_id === 'source.url.presence' && result.state === 'missing'
    )));
    const uncertain = present.filter(id => byId.get(id).results.some(result => (
      result.rule_id === 'source.verification.state' && result.state === 'uncertain'
    )));
    const uncertainSet = new Set(uncertain);
    const overlap = missingUrl.filter(id => uncertainSet.has(id));
    return {
      id: measurement.id,
      evidence: measurement.evidence,
      observed_at_commit: measurement.observed_at_commit,
      measured: {
        source_rows: measurement.source_rows,
        missing_url: measurement.missing_url,
        uncertain_verification: measurement.uncertain_verification,
        overlap: measurement.overlap,
        overlap_record_ids: ids
      },
      current_cohort: {
        present: present.length,
        missing_from_source: ids.filter(id => !byId.has(id)),
        missing_url: missingUrl.length,
        uncertain_verification: uncertain.length,
        overlap: overlap.length
      }
    };
  });
}

function exceptionRegistry(registry, records) {
  const resultsByKey = new Map();
  for (const record of records) {
    for (const result of record.results) {
      resultsByKey.set(`${record.record_id}\u0000${result.rule_id}`, result);
    }
  }
  return [...registry.exceptions]
    .sort((left, right) => (
      compareCodeUnits(left.record_id, right.record_id)
      || compareCodeUnits(left.rule_id, right.rule_id)
    ))
    .map(item => ({
      ...item,
      applied: resultsByKey.get(`${item.record_id}\u0000${item.rule_id}`)?.state === 'intentionally_absent'
    }));
}

export function buildSourceIdentityReport({ policy, evidenceRegistry, rows, runtime, inputs }) {
  const seenIds = new Map();
  const exceptionMap = new Map(
    evidenceRegistry.exceptions.map(item => [`${item.record_id}\u0000${item.rule_id}`, item])
  );
  const runtimeRecords = Array.isArray(runtime.records) ? runtime.records : [];
  const publishedIds = new Set(runtimeRecords.map(record => record.id));
  const ruleById = new Map(policy.rules.map(rule => [rule.id, rule]));
  const records = rows.map(({ row, sourceFile, sourceRow }) => {
    const recordId = String(row.id || '').trim();
    if (seenIds.has(recordId)) {
      throw new Error(
        `Duplicate source record ID ${JSON.stringify(recordId)} at ${sourceFile}:${sourceRow}; first seen at ${seenIds.get(recordId)}`
      );
    }
    seenIds.set(recordId, `${sourceFile}:${sourceRow}`);
    const profile = profileForRow(policy, sourceFile, row);
    const orderedRuleIds = [
      ...profile.applicable_rules,
      ...(profile.not_applicable_rules || [])
    ];
    const results = orderedRuleIds.map(ruleId => evaluateRule({
      policy,
      profile,
      rule: ruleById.get(ruleId),
      sourceFile,
      row,
      exceptions: exceptionMap
    }));
    return {
      record_id: recordId,
      source_file: sourceFile,
      content_type: String(row.content_type || '').trim(),
      record_class: profile.id,
      profile_version: profile.version,
      published_runtime: publishedIds.has(recordId),
      state: recordState(results),
      results
    };
  }).sort((left, right) => (
    compareCodeUnits(left.source_file, right.source_file)
    || compareCodeUnits(left.record_id, right.record_id)
  ));

  for (const item of evidenceRegistry.exceptions) {
    if (!seenIds.has(item.record_id)) {
      throw new Error(`Evidence exception references missing source record ${item.record_id}`);
    }
  }

  const allResults = records.flatMap(record => record.results);
  const byClass = {};
  for (const className of [...new Set(records.map(record => record.record_class))].sort(compareCodeUnits)) {
    const classRecords = records.filter(record => record.record_class === className);
    byClass[className] = {
      source_rows: classRecords.length,
      published_runtime_rows: classRecords.filter(record => record.published_runtime).length,
      record_states: stableObject(classRecords.reduce((counts, record) => {
        counts[record.state] = (counts[record.state] || 0) + 1;
        return counts;
      }, {})),
      results: countsForResults(classRecords.flatMap(record => record.results))
    };
  }
  const sourceIds = new Set(records.map(record => record.record_id));
  const criticalFailures = records.flatMap(record => record.results
    .filter(result => result.severity === 'critical' && FAILING_STATES.has(result.state))
    .map(result => ({
      record_id: record.record_id,
      record_class: record.record_class,
      result_id: result.id,
      rule_id: result.rule_id,
      state: result.state,
      reason: result.reason
    }))
  );
  const report = {
    schema: { id: REPORT_SCHEMA_ID },
    policy: {
      id: policy.policy.id,
      version: policy.policy.version,
      rule_versions: Object.fromEntries(policy.rules.map(rule => [rule.id, rule.version]))
    },
    input: { files: inputs },
    denominators: {
      source: {
        total: records.length,
        by_class: stableObject(Object.fromEntries(
          Object.entries(byClass).map(([className, value]) => [className, value.source_rows])
        ))
      },
      published_runtime: {
        total: runtimeRecords.length,
        source_backed: runtimeRecords.filter(record => sourceIds.has(record.id)).length,
        generated_or_injected: runtimeRecords.filter(record => !sourceIds.has(record.id)).length,
        source_backed_by_class: stableObject(Object.fromEntries(
          Object.entries(byClass).map(([className, value]) => [className, value.published_runtime_rows])
        ))
      }
    },
    summary: {
      records: {
        total: records.length,
        states: stableObject(records.reduce((counts, record) => {
          counts[record.state] = (counts[record.state] || 0) + 1;
          return counts;
        }, {}))
      },
      results: countsForResults(allResults),
      by_class: stableObject(byClass),
      critical_failures: {
        results: criticalFailures.length,
        records: new Set(criticalFailures.map(item => item.record_id)).size
      }
    },
    current_curated_findings: curatedFindings(records),
    current_social_findings: socialFindings(records),
    historical_measurements: historicalMeasurements(evidenceRegistry, records),
    exceptions: exceptionRegistry(evidenceRegistry, records),
    critical_failures: criticalFailures,
    records
  };
  return report;
}

export function evaluateSourceIdentityQuality(options = {}) {
  return buildSourceIdentityReport(loadSourceIdentityInputs(options));
}

export function formatSourceIdentityReportJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function markdownTable(headers, rows) {
  const line = cells => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

export function formatSourceIdentitySummary(report) {
  const social = report.current_social_findings;
  const critical = report.summary.critical_failures;
  const lines = [
    '# Source identity quality audit',
    '',
    `Policy: \`${report.policy.id}/${report.policy.version}\``,
    '',
    '## Denominators',
    '',
    markdownTable(
      ['Record class', 'Source rows', 'Published source-backed rows'],
      Object.entries(report.summary.by_class).map(([className, value]) => [
        className,
        value.source_rows.toLocaleString('en-US'),
        value.published_runtime_rows.toLocaleString('en-US')
      ])
    ),
    '',
    `Published runtime total: ${report.denominators.published_runtime.total.toLocaleString('en-US')} records. Source-backed: ${report.denominators.published_runtime.source_backed.toLocaleString('en-US')}. Generated or injected: ${report.denominators.published_runtime.generated_or_injected.toLocaleString('en-US')}.`,
    '',
    '## Result states',
    '',
    markdownTable(
      ['State', 'Results'],
      Object.entries(report.summary.results.states).map(([state, count]) => [state, count.toLocaleString('en-US')])
    ),
    '',
    `Applicable-rule score: ${report.summary.results.passing.toLocaleString('en-US')} / ${report.summary.results.applicable.toLocaleString('en-US')} (${report.summary.results.score_percent}%). Not-applicable results are excluded.`,
    '',
    `Critical findings: ${critical.results.toLocaleString('en-US')} results across ${critical.records.toLocaleString('en-US')} source records. This count is reported separately from the numeric score.`,
    '',
    '## Current source findings',
    '',
    `Curated rows missing a source URL: ${report.current_curated_findings.missing_url.count.toLocaleString('en-US')}.`,
    '',
    `Social rows missing a source URL: ${social.missing_url.count.toLocaleString('en-US')}. Explicitly unverified: ${social.uncertain_verification.count.toLocaleString('en-US')}. Overlap: ${social.missing_url_and_uncertain_verification_overlap.count.toLocaleString('en-US')}. Distinct affected records: ${social.distinct_affected_records.toLocaleString('en-US')}.`,
    '',
    `Social summary results are \`not_applicable\`: ${social.summary_not_applicable.count.toLocaleString('en-US')}.`,
    '',
    '## Historical measured cohorts',
    ''
  ];
  if (report.historical_measurements.length === 0) {
    lines.push('No historical measured cohorts are registered.');
  } else {
    lines.push(markdownTable(
      ['Cohort', 'Measured overlap', 'Current overlap', 'Current missing from source', 'Evidence'],
      report.historical_measurements.map(item => [
        item.id,
        item.measured.overlap.toLocaleString('en-US'),
        item.current_cohort.overlap.toLocaleString('en-US'),
        item.current_cohort.missing_from_source.length.toLocaleString('en-US'),
        item.evidence
      ])
    ));
  }
  lines.push('', `Approved absence decisions: ${report.exceptions.length.toLocaleString('en-US')}.`);
  return `${lines.join('\n')}\n`;
}

function requireValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function parseArgs(argv) {
  const args = {
    dataDir: path.join(ROOT_DIR, 'data'),
    policyPath: DEFAULT_POLICY_PATH,
    evidencePath: DEFAULT_EVIDENCE_PATH,
    jsonOutput: null,
    summaryOutput: null
  };
  const destinations = {
    '--data-dir': 'dataDir',
    '--policy': 'policyPath',
    '--evidence': 'evidencePath',
    '--json-output': 'jsonOutput',
    '--summary-output': 'summaryOutput'
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const destination = destinations[option];
    if (!destination) throw new Error(`Unknown argument: ${option}`);
    args[destination] = path.resolve(requireValue(argv, index, option));
    index += 1;
  }
  return args;
}

function writeOutput(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = evaluateSourceIdentityQuality(args);
    const summary = formatSourceIdentitySummary(report);
    if (args.jsonOutput) writeOutput(args.jsonOutput, formatSourceIdentityReportJson(report));
    if (args.summaryOutput) writeOutput(args.summaryOutput, summary);
    if (!args.jsonOutput && !args.summaryOutput) process.stdout.write(summary);
    else console.log(`Evaluated ${report.denominators.source.total} source rows.`);
  } catch (error) {
    console.error(`Source identity quality audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
