import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildStewardshipCensus,
  formatStewardshipCensusJson,
  formatStewardshipCensusMarkdown,
  inspectStewardshipInputGitState,
  loadStewardshipInputs
} from '../scripts/build-stewardship-census.mjs';

const rootDir = process.cwd();
const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'stewardship-census');

function buildFixtureCensus() {
  const inputs = loadStewardshipInputs({ dataDir: fixtureDir });
  return buildStewardshipCensus({
    inputs,
    input: {
      commit: 'fixture-commit',
      dirty: false,
      files: inputs.files
    }
  });
}

describe('stewardship coverage census', () => {
  it('reconciles representative source and runtime records with first-match filters', () => {
    const census = buildFixtureCensus();

    assert.equal(census.schema.id, 'stewardship-census/1.0.0');
    assert.equal(census.input.commit, 'fixture-commit');
    assert.equal(census.input.files.length, 8);
    assert.equal(census.records.source.curated.total, 2);
    assert.equal(census.records.source.social.total, 7);
    assert.equal(census.records.runtime.total, 5);
    assert.equal(census.records.runtime.source_backed.curated, 1);
    assert.equal(census.records.runtime.source_backed.social, 2);
    assert.equal(census.records.runtime.source_backed.social_by_platform['Twitter/X'], 1);
    assert.equal(census.records.runtime.source_backed.social_by_record_type.TWITTER, 1);
    assert.equal(census.records.runtime.generated.thread_containers, 1);
    assert.equal(census.records.runtime.generated.injected, 1);

    const reasons = Object.fromEntries(
      census.records.filtered.reasons.map(reason => [reason.id, reason])
    );
    assert.deepEqual(reasons.curated_unverified.record_ids, ['RECORD-00002']);
    assert.deepEqual(reasons.social_thread_member.record_ids, ['BSKY-00002']);
    assert.deepEqual(reasons.social_repost.record_ids, ['TWTR-00002']);
    assert.deepEqual(reasons.social_non_rosen_author.record_ids, ['MAST-00001']);
    assert.deepEqual(reasons.social_short_generic_reply.record_ids, ['TWTR-00003']);
    assert.deepEqual(reasons.social_final_invalid_title.record_ids, ['MAST-00002']);
    assert.deepEqual(reasons.social_unclassified.record_ids, []);
    assert.equal(
      census.records.filtered.total,
      census.records.reconciliation.curated.filtered + census.records.reconciliation.social.filtered
    );
  });

  it('reports field, graph, URL, preservation, and cross-file coverage', () => {
    const census = buildFixtureCensus();

    assert.equal(census.fields.curated_source.url.missing, 1);
    assert.equal(census.fields.social_source.summary.missing, 7);
    assert.equal(census.graph.entities.total, 4);
    assert.equal(census.graph.entities.by_type.Person, 1);
    assert.equal(census.graph.relationships.total, 2);
    assert.equal(census.graph.relationships.by_type.Discusses, 1);
    assert.equal(census.graph.relationships.by_confidence.medium, 1);
    assert.equal(census.graph.coverage.curated.source.rows_with_relationship_assertions, 1);
    assert.equal(census.graph.coverage.social.source.rows_with_relationship_assertions, 1);
    assert.equal(census.graph.coverage.social.published.rows_with_entity_links, 1);
    assert.equal(census.graph.reference_findings.entity_first_mentions_missing_from_source.count, 1);
    assert.equal(census.graph.reference_findings.relationship_endpoint_name_mismatches.count, 1);
    assert.equal(census.urls.source.host_distribution['example.com'], 5);
    assert.equal(census.preservation.link_evidence.records, 1);
    assert.equal(census.preservation.embedded_candidates.records, 1);
    assert.equal(census.cross_file.full_missing_from_core.count, 0);
    assert.equal(census.baseline_2026_07_22.data_commit, '5d3d5351346a9712de4f54d95e69ba0f410c6efd');
  });

  it('detects intentional count drift instead of accepting stale output', () => {
    const inputs = loadStewardshipInputs({ dataDir: fixtureDir });
    const original = buildStewardshipCensus({
      inputs,
      input: { commit: 'fixture-commit', dirty: false, files: inputs.files }
    });
    const driftedInputs = structuredClone(inputs);
    driftedInputs.curated.push({
      ...driftedInputs.curated[1],
      id: 'RECORD-00003'
    });
    const drifted = buildStewardshipCensus({
      inputs: driftedInputs,
      input: { commit: 'fixture-commit', dirty: true, files: inputs.files }
    });

    assert.equal(drifted.records.source.curated.total, original.records.source.curated.total + 1);
    assert.equal(
      drifted.records.filtered.reasons.find(reason => reason.id === 'curated_unverified').count,
      original.records.filtered.reasons.find(reason => reason.id === 'curated_unverified').count + 1
    );
    assert.notEqual(
      formatStewardshipCensusJson(drifted),
      formatStewardshipCensusJson(original)
    );
  });

  it('gives CI full history for a reproducible input commit stamp', () => {
    const workflow = fs.readFileSync(
      path.join(rootDir, '.github', 'workflows', 'frontend-validation.yml'),
      'utf8'
    );
    assert.match(
      workflow,
      /- name: Checkout repository\n\s+uses: actions\/checkout@v6\n\s+with:\n(?:\s+#.*\n)*\s+fetch-depth: 0/,
    );
  });

  it('refreshes the census in every automated data-mutation pipeline', () => {
    for (const relativePath of [
      'backend/scripts/process_submission.py',
      'backend/scripts/sync_sheet_to_archive.py',
    ]) {
      const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
      assert.match(source, /census:stewardship/, `${relativePath} must regenerate the census`);
      assert.match(source, /stewardship-census\.json/, `${relativePath} must stage the JSON report`);
      assert.match(source, /stewardship-census\.md/, `${relativePath} must stage the Markdown report`);
    }
  });

  it('keeps committed JSON and Markdown reports current', t => {
    const inputs = loadStewardshipInputs({ dataDir: path.join(rootDir, 'data') });
    const state = inspectStewardshipInputGitState({ rootDir, files: inputs.files });
    assert.equal(state.shallow, false, 'Census freshness requires complete Git history');
    if (state.dirty) {
      t.skip('Commit census inputs before checking the stamped reports');
      return;
    }
    const census = buildStewardshipCensus({ inputs, rootDir });
    const unclassified = census.records.filtered.reasons
      .filter(reason => reason.id.endsWith('unclassified'))
      .reduce((total, reason) => total + reason.count, 0);

    assert.equal(unclassified, 0, 'Every current source/runtime difference needs a known reason');
    assert.equal(census.input.dirty, false, 'Committed reports must never be generated from dirty inputs');
    assert.equal(
      census.records.filtered.total,
      census.records.reconciliation.curated.filtered + census.records.reconciliation.social.filtered
    );

    assert.equal(
      fs.readFileSync(path.join(rootDir, 'data', 'stewardship-census.json'), 'utf8'),
      formatStewardshipCensusJson(census)
    );
    assert.equal(
      fs.readFileSync(path.join(rootDir, 'data', 'stewardship-census.md'), 'utf8'),
      formatStewardshipCensusMarkdown(census)
    );
  });
});
