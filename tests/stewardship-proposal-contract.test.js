import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  approvalEligibility,
  canonicalJson,
  proposalHash,
  rejectionFingerprint,
  releaseEligibility,
  replayDecisions,
  validateDecision,
  validateProposal,
  valueHash
} from '../stewardship/proposal-contract.mjs';
import {
  assertJsonSchemaDocument,
  compileJsonSchema
} from '../scripts/json-schema-validator.mjs';

const fixtureDirectory = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'stewardship-proposals'
);

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDirectory, name), 'utf8'));
}

function proposalIds(entries) {
  return entries.map(entry => entry.proposal.proposalId);
}

function entryFor(projection, proposalId) {
  const entry = [
    ...projection.proposed,
    ...projection.accepted,
    ...projection.rejected,
    ...projection.superseded
  ].find(candidate => candidate.proposal.proposalId === proposalId);
  assert.ok(entry, `missing projection entry for ${proposalId}`);
  return entry;
}

const proposalSchema = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'stewardship', 'proposal.schema.json'), 'utf8')
);
const decisionSchema = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'stewardship', 'decision.schema.json'), 'utf8')
);
const validateProposalSchema = compileJsonSchema(proposalSchema, {
  source: 'stewardship/proposal.schema.json'
});
const validateDecisionSchema = compileJsonSchema(decisionSchema, {
  source: 'stewardship/decision.schema.json'
});

describe('stewardship proposal schema and hashing', () => {
  it('validates every fixture record against the versioned schemas', () => {
    for (const name of fs.readdirSync(fixtureDirectory).sort()) {
      const sample = fixture(name);
      sample.proposals.forEach((proposal, index) => {
        assertJsonSchemaDocument(validateProposalSchema, proposal, {
          source: `${name} proposals[${index}]`
        });
        assert.doesNotThrow(() =>
          validateProposal(proposal, { source: `${name} proposals`, index })
        );
      });
      sample.decisions.forEach((decision, index) => {
        assertJsonSchemaDocument(validateDecisionSchema, decision, {
          source: `${name} decisions[${index}]`
        });
        assert.doesNotThrow(() =>
          validateDecision(decision, { source: `${name} decisions`, index })
        );
      });
    }
  });

  it('matches independent hashes for field values, assertions, proposals, and rejections', () => {
    for (const name of ['field-approval.json', 'assertion-approval.json']) {
      const sample = fixture(name);
      const proposal = sample.proposals[0];
      assert.equal(valueHash(proposal.proposedValue), sample.expected.proposedValueHash);
      assert.equal(proposalHash(proposal), sample.expected.proposalHash);
      assert.equal(rejectionFingerprint(proposal), sample.expected.rejectionFingerprint);
    }

    assert.equal(
      canonicalJson({ nested: { z: 1, a: 2 }, values: [3, 2, 1] }),
      canonicalJson({ values: [3, 2, 1], nested: { a: 2, z: 1 } })
    );
    assert.notEqual(valueHash([1, 2]), valueHash([2, 1]));
    assert.throws(() => valueHash([, 1]), /JSON arrays must not be sparse/);
  });

  it('keeps stable object identity independent of input position', () => {
    const field = fixture('field-approval.json').proposals[0];
    const assertion = fixture('assertion-approval.json').proposals[0];
    const first = replayDecisions([field, assertion], []);
    const second = replayDecisions([assertion, field], []);

    assert.deepEqual(first, second);
    assert.deepEqual(proposalIds(first.proposed), [
      'urn:rosen-stewardship:proposal:assertion-relationship-1',
      'urn:rosen-stewardship:proposal:field-title-1'
    ]);
  });
});

describe('stewardship decision replay', () => {
  it('accepts object-field and assertion proposals only through approval events', () => {
    for (const name of ['field-approval.json', 'assertion-approval.json']) {
      const sample = fixture(name);
      const pending = replayDecisions(sample.proposals, []);
      const approved = replayDecisions(sample.proposals, sample.decisions);

      assert.deepEqual(proposalIds(pending.accepted), []);
      assert.deepEqual(proposalIds(approved.accepted), sample.expected.acceptedProposalIds);
      assert.equal(approved.accepted[0].decisionHistory[0].operation, 'approve');
    }
  });

  it('does not let confidence or undeclared legacy flags create accepted state', () => {
    const sample = fixture('rejected-duplicate.json');
    const projection = replayDecisions(sample.proposals, sample.decisions);
    assert.deepEqual(proposalIds(projection.accepted), []);
    assert.equal(projection.rejected[0].proposal.confidence, 0.99);

    const legacy = { ...sample.proposals[0], needs_review: false };
    assert.throws(
      () => validateProposal(legacy, { source: 'legacy proposals', index: 0 }),
      /legacy proposals\[0\]: proposal has unexpected fields: needs_review/
    );
  });

  it('checks approval and release input hashes separately without changing history', () => {
    const sample = fixture('field-approval.json');
    const pending = replayDecisions(sample.proposals, []);
    const accepted = replayDecisions(sample.proposals, sample.decisions);
    const pendingEntry = pending.proposed[0];
    const acceptedEntry = accepted.accepted[0];

    assert.deepEqual(
      approvalEligibility(pendingEntry, sample.currentInputHashes.matching),
      { eligible: true, reasons: [] }
    );
    assert.deepEqual(
      approvalEligibility(pendingEntry, sample.currentInputHashes.changed),
      { eligible: false, reasons: ['relevant input changed'] }
    );
    assert.deepEqual(
      releaseEligibility(acceptedEntry, sample.currentInputHashes.matching),
      { eligible: true, reasons: [] }
    );
    assert.deepEqual(
      releaseEligibility(acceptedEntry, sample.currentInputHashes.changed),
      { eligible: false, reasons: ['relevant input changed'] }
    );
    assert.equal(acceptedEntry.status, 'accepted');
    assert.equal(acceptedEntry.decisionHistory.length, 1);
  });

  it('rejects invalid transitions and same-revision conflicts at their ordered locations', () => {
    for (const name of ['invalid-transition.json', 'conflicting-decisions.json']) {
      const sample = fixture(name);
      assert.throws(
        () => replayDecisions(sample.proposals, sample.decisions),
        error => {
          assert.equal(error.message, sample.expectedError);
          return true;
        }
      );
    }
  });

  it('suppresses a linked identical rejection fingerprint', () => {
    const sample = fixture('rejected-duplicate.json');
    const projection = replayDecisions(sample.proposals, sample.decisions);

    assert.deepEqual(proposalIds(projection.rejected), sample.expected.rejectedProposalIds);
    const duplicate = entryFor(
      projection,
      'urn:rosen-stewardship:proposal:rejected-duplicate-1'
    );
    assert.equal(duplicate.suppressedByProposalId, sample.expected.suppressedByProposalId);
    assert.equal(
      duplicate.inheritedRejectionEventId,
      'urn:rosen-stewardship:decision-event:reject-original-1'
    );
    assert.deepEqual(
      releaseEligibility(duplicate, duplicate.proposal.relevantInputHash),
      { eligible: false, reasons: ['status is rejected'] }
    );
  });

  it('allows a changed linked successor and retains the rejection history', () => {
    const sample = fixture('linked-replacement.json');
    const projection = replayDecisions(sample.proposals, sample.decisions);

    assert.deepEqual(proposalIds(projection.accepted), sample.expected.acceptedProposalIds);
    assert.deepEqual(proposalIds(projection.superseded), sample.expected.supersededProposalIds);
    assert.deepEqual(
      projection.superseded[0].decisionHistory.map(event => event.operation),
      sample.expected.retainedOriginalOperations
    );
    assert.notEqual(
      projection.accepted[0].rejectionFingerprint,
      projection.superseded[0].rejectionFingerprint
    );
  });

  it('retains publication references when accepted data is superseded', () => {
    const sample = fixture('publication-supersession.json');
    const projection = replayDecisions(sample.proposals, sample.decisions);
    const original = entryFor(
      projection,
      'urn:rosen-stewardship:proposal:published-original-1'
    );

    assert.equal(original.status, 'superseded');
    assert.deepEqual(original.publicationRefs, sample.expected.originalPublicationRefs);
    assert.deepEqual(
      original.decisionHistory.map(event => event.operation),
      ['approve', 'supersede']
    );
  });

  it('fails on duplicate event IDs across the full stream, including identical events', () => {
    const sample = fixture('field-approval.json');
    const duplicate = structuredClone(sample.decisions[0]);

    assert.throws(
      () => replayDecisions(sample.proposals, [sample.decisions[0], duplicate], {
        decisionSource: 'fixture/events.json'
      }),
      /fixture\/events\.json\[1\]: duplicate eventId .* first seen at fixture\/events\.json\[0\]/
    );
  });

  it('reports missing proposal and successor references with an actionable location', () => {
    const field = fixture('field-approval.json');
    const missingProposal = structuredClone(field.decisions[0]);
    missingProposal.proposalId = 'urn:rosen-stewardship:proposal:missing';
    assert.throws(
      () => replayDecisions(field.proposals, [missingProposal], {
        decisionSource: 'fixture/events.json'
      }),
      /fixture\/events\.json\[0\]: proposalId .*:missing is missing/
    );

    const replacement = fixture('linked-replacement.json');
    const missingSuccessor = structuredClone(replacement.decisions[1]);
    missingSuccessor.successorProposalId = 'urn:rosen-stewardship:proposal:missing';
    assert.throws(
      () => replayDecisions(replacement.proposals, [missingSuccessor], {
        decisionSource: 'fixture/events.json'
      }),
      /fixture\/events\.json\[0\]: successorProposalId .*:missing is missing/
    );
  });

  it('rejects impossible timestamps and missing proposal links at their input locations', () => {
    const field = fixture('field-approval.json');
    const impossibleTime = structuredClone(field.decisions[0]);
    impossibleTime.occurredAt = '2026-02-30T14:00:00.000Z';
    assert.throws(
      () => replayDecisions(field.proposals, [impossibleTime], {
        decisionSource: 'fixture/events.json'
      }),
      /fixture\/events\.json\[0\]: occurredAt must be a valid UTC timestamp/
    );

    const missingLink = structuredClone(field.proposals[0]);
    missingLink.proposalId = 'urn:rosen-stewardship:proposal:missing-link';
    missingLink.duplicateOfProposalId = 'urn:rosen-stewardship:proposal:missing';
    assert.throws(
      () => replayDecisions([missingLink], [], { proposalSource: 'fixture/proposals.json' }),
      /fixture\/proposals\.json\[0\]: duplicateOfProposalId .*:missing is missing/
    );
  });

  it('is pure and deterministic for equivalent ordered input', () => {
    const sample = fixture('publication-supersession.json');
    const before = structuredClone(sample);
    const first = replayDecisions(sample.proposals, sample.decisions);
    const second = replayDecisions(
      [...sample.proposals].reverse(),
      structuredClone(sample.decisions)
    );

    assert.deepEqual(first, second);
    assert.deepEqual(sample, before);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.superseded[0].proposal));
  });
});
