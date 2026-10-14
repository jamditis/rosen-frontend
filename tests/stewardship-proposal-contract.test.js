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

  it('keeps JSON Schema and runtime non-empty string validation aligned', () => {
    const sample = fixture('field-approval.json');
    const proposalCases = [
      ['valid reason', { reason: '  Source confirms the title.  ' }, true],
      ['blank reason', { reason: ' \t\n' }, false],
      ['valid evidence reference', { evidenceRefs: ['  urn:rosen:evidence:title  '] }, true],
      ['blank evidence reference', { evidenceRefs: [' \t\n'] }, false]
    ];
    const decisionCases = [
      ['valid reason', { reason: '  Source reviewed.  ' }, true],
      ['blank reason', { reason: ' \t\n' }, false],
      ['valid notes', { notes: '  Reviewed by a curator.  ' }, true],
      ['blank notes', { notes: ' \t\n' }, false],
      ['valid publication reference', { publicationRefs: ['  urn:rosen:publication:one  '] }, true],
      ['blank publication reference', { publicationRefs: [' \t\n'] }, false]
    ];

    for (const [label, changes, expected] of proposalCases) {
      const proposal = { ...sample.proposals[0], ...changes };
      assert.equal(validateProposalSchema(proposal), expected, `proposal schema: ${label}`);
      assert.equal(
        (() => {
          try {
            validateProposal(proposal);
            return true;
          } catch {
            return false;
          }
        })(),
        expected,
        `proposal runtime: ${label}`
      );
    }

    for (const [label, changes, expected] of decisionCases) {
      const decision = { ...sample.decisions[0], ...changes };
      assert.equal(validateDecisionSchema(decision), expected, `decision schema: ${label}`);
      assert.equal(
        (() => {
          try {
            validateDecision(decision);
            return true;
          } catch {
            return false;
          }
        })(),
        expected,
        `decision runtime: ${label}`
      );
    }
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

  it('orders ASCII proposal IDs by code unit independent of locale collation', () => {
    const base = fixture('field-approval.json').proposals[0];
    const ids = [
      'urn:rosen-stewardship:proposal:order:a',
      'urn:rosen-stewardship:proposal:order:_',
      'urn:rosen-stewardship:proposal:order:Z'
    ];
    const proposals = ids.map(proposalId => ({ ...base, proposalId }));

    assert.deepEqual(proposalIds(replayDecisions(proposals, []).proposed), [
      'urn:rosen-stewardship:proposal:order:Z',
      'urn:rosen-stewardship:proposal:order:_',
      'urn:rosen-stewardship:proposal:order:a'
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

  it('suppresses an unlinked proposal with a retained rejection fingerprint', () => {
    const sample = fixture('rejected-duplicate.json');
    const original = sample.proposals[0];
    const unlinked = {
      ...sample.proposals[1],
      proposalId: 'urn:rosen-stewardship:proposal:rejected-unlinked-1',
      currentValue: 'A later observation of the same current title'
    };
    delete unlinked.duplicateOfProposalId;
    const projection = replayDecisions([original, unlinked], sample.decisions);
    const suppressed = entryFor(projection, unlinked.proposalId);

    assert.deepEqual(
      projection,
      replayDecisions([unlinked, original], sample.decisions)
    );
    assert.equal(suppressed.status, 'rejected');
    assert.equal(suppressed.suppressedByProposalId, original.proposalId);
    assert.equal(
      suppressed.inheritedRejectionEventId,
      sample.decisions[0].eventId
    );
    assert.deepEqual(
      approvalEligibility(suppressed, suppressed.proposal.relevantInputHash),
      { eligible: false, reasons: ['status is rejected'] }
    );

    const approveUnlinked = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:approve-rejected-unlinked-1',
      proposalId: unlinked.proposalId,
      operation: 'approve',
      reason: 'Try to approve the repeated suggestion.'
    };
    assert.throws(
      () => replayDecisions(
        [original, unlinked],
        [...sample.decisions, approveUnlinked],
        { decisionSource: 'fixture/events.json' }
      ),
      /fixture\/events\.json\[1\]: approve cannot apply because proposal .*:rejected-original-1 retains the same rejection fingerprint/
    );
  });

  it('selects the lowest proposal ID as the retained explicit rejection source', () => {
    const sample = fixture('rejected-duplicate.json');
    const base = sample.proposals[0];
    const higher = {
      ...base,
      proposalId: 'urn:rosen-stewardship:proposal:retained-z',
      currentValue: 'Higher ID observation'
    };
    const lower = {
      ...base,
      proposalId: 'urn:rosen-stewardship:proposal:retained-a',
      currentValue: 'Lower ID observation'
    };
    const pending = {
      ...base,
      proposalId: 'urn:rosen-stewardship:proposal:retained-pending',
      currentValue: 'Pending observation'
    };
    const rejectHigher = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:reject-retained-z',
      proposalId: higher.proposalId
    };
    const rejectLower = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:reject-retained-a',
      proposalId: lower.proposalId
    };

    const projection = replayDecisions(
      [higher, pending, lower],
      [rejectHigher, rejectLower]
    );
    const suppressed = entryFor(projection, pending.proposalId);

    assert.equal(suppressed.suppressedByProposalId, lower.proposalId);
    assert.equal(suppressed.inheritedRejectionEventId, rejectLower.eventId);
    assert.deepEqual(
      projection,
      replayDecisions([lower, pending, higher], [rejectHigher, rejectLower])
    );
  });

  it('blocks successor approval until its original has a matching supersession', () => {
    const sample = fixture('linked-replacement.json');
    const successorId = sample.proposals[1].proposalId;
    const rejected = replayDecisions(sample.proposals, sample.decisions.slice(0, 1));
    const pending = entryFor(rejected, successorId);
    assert.deepEqual(approvalEligibility(pending, pending.proposal.relevantInputHash), {
      eligible: false,
      reasons: ['supersession is pending'],
    });

    const superseded = replayDecisions(sample.proposals, sample.decisions.slice(0, 2));
    const ready = entryFor(superseded, successorId);
    assert.deepEqual(approvalEligibility(ready, ready.proposal.relevantInputHash), {
      eligible: true,
      reasons: [],
    });
    assert.equal(replayDecisions(sample.proposals, sample.decisions).accepted.length, 1);
  });

  it('reports premature successor approval at the offending decision', () => {
    const sample = fixture('linked-replacement.json');
    const laterInvalid = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:reject-successor-later',
      proposalId: sample.proposals[1].proposalId,
      expectedRevision: 1,
      reason: 'This later transition must not hide the earlier error.'
    };

    assert.throws(
      () => replayDecisions(
        sample.proposals,
        [sample.decisions[0], sample.decisions[2], laterInvalid],
        { decisionSource: 'fixture/events.json' }
      ),
      /fixture\/events\.json\[1\]: approve cannot apply before a matching supersede decision/
    );
  });

  it('keeps one accepted proposal per target until an explicit supersession', () => {
    const sample = fixture('field-approval.json');
    const original = {
      ...sample.proposals[0],
      proposalId: 'urn:rosen-stewardship:proposal:target-original',
      currentValue: 'First observed title'
    };
    const competing = {
      ...sample.proposals[0],
      proposalId: 'urn:rosen-stewardship:proposal:target-competing',
      currentValue: 'Second observed title',
      proposedValue: 'A different corrected title',
      reason: 'A competing correction for the same target.'
    };
    const approveOriginal = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:approve-target-original',
      proposalId: original.proposalId
    };
    const approveCompeting = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:approve-target-competing',
      proposalId: competing.proposalId
    };
    const occupied = replayDecisions([original, competing], [approveOriginal]);
    const pendingCompeting = entryFor(occupied, competing.proposalId);

    assert.equal(original.relevantInputHash, competing.relevantInputHash);
    assert.notDeepEqual(original.currentValue, competing.currentValue);
    assert.equal(pendingCompeting.targetAvailable, false);
    assert.deepEqual(
      approvalEligibility(pendingCompeting, competing.relevantInputHash),
      { eligible: false, reasons: ['target already has an accepted proposal'] }
    );
    assert.throws(
      () => replayDecisions(
        [original, competing],
        [approveOriginal, approveCompeting],
        { decisionSource: 'fixture/events.json' }
      ),
      /fixture\/events\.json\[1\]: approve cannot apply while proposal .*:target-original occupies the target/
    );

    const successor = {
      ...competing,
      supersedesProposalId: original.proposalId
    };
    const supersedeOriginal = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:supersede-target-original',
      proposalId: original.proposalId,
      operation: 'supersede',
      expectedRevision: 1,
      successorProposalId: successor.proposalId
    };
    const ready = replayDecisions(
      [original, successor],
      [approveOriginal, supersedeOriginal]
    );
    const readySuccessor = entryFor(ready, successor.proposalId);
    assert.equal(readySuccessor.targetAvailable, true);
    assert.deepEqual(approvalEligibility(readySuccessor, successor.relevantInputHash), {
      eligible: true,
      reasons: []
    });

    const replaced = replayDecisions(
      [original, successor],
      [approveOriginal, supersedeOriginal, approveCompeting]
    );
    assert.deepEqual(proposalIds(replaced.accepted), [successor.proposalId]);
    assert.deepEqual(proposalIds(replaced.superseded), [original.proposalId]);
  });

  it('reserves a superseded target for its named successor until an explicit rejection', () => {
    const sample = fixture('field-approval.json');
    const original = {
      ...sample.proposals[0],
      proposalId: 'urn:rosen-stewardship:proposal:reserved-original'
    };
    const successor = {
      ...sample.proposals[0],
      proposalId: 'urn:rosen-stewardship:proposal:reserved-successor',
      proposedValue: 'Successor title',
      reason: 'The named successor for this target.',
      supersedesProposalId: original.proposalId
    };
    const interloper = {
      ...sample.proposals[0],
      proposalId: 'urn:rosen-stewardship:proposal:reserved-interloper',
      proposedValue: 'Unrelated title',
      reason: 'An unrelated proposal for the reserved target.'
    };
    const approveOriginal = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:approve-reserved-original',
      proposalId: original.proposalId
    };
    const supersedeOriginal = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:supersede-reserved-original',
      proposalId: original.proposalId,
      operation: 'supersede',
      expectedRevision: 1,
      successorProposalId: successor.proposalId
    };
    const approveInterloper = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:approve-reserved-interloper',
      proposalId: interloper.proposalId
    };
    const proposals = [original, successor, interloper];
    const reserved = replayDecisions(proposals, [approveOriginal, supersedeOriginal]);
    const readySuccessor = entryFor(reserved, successor.proposalId);
    const blockedInterloper = entryFor(reserved, interloper.proposalId);

    assert.deepEqual(
      reserved,
      replayDecisions([...proposals].reverse(), [approveOriginal, supersedeOriginal])
    );
    assert.equal(readySuccessor.targetAvailable, true);
    assert.equal(readySuccessor.targetReservedForProposalId, successor.proposalId);
    assert.equal(blockedInterloper.targetAvailable, false);
    assert.equal(blockedInterloper.targetReservedForProposalId, successor.proposalId);
    assert.deepEqual(
      approvalEligibility(blockedInterloper, interloper.relevantInputHash),
      {
        eligible: false,
        reasons: [`target is reserved for proposal ${successor.proposalId}`]
      }
    );
    assert.throws(
      () => replayDecisions(
        proposals,
        [approveOriginal, supersedeOriginal, approveInterloper],
        { decisionSource: 'fixture/events.json' }
      ),
      /fixture\/events\.json\[2\]: approve cannot apply because the target is reserved for proposal .*:reserved-successor/
    );

    const rejectSuccessor = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:reject-reserved-successor',
      proposalId: successor.proposalId,
      operation: 'reject',
      reason: 'Reject and release the named successor reservation.'
    };
    const released = replayDecisions(
      proposals,
      [approveOriginal, supersedeOriginal, rejectSuccessor, approveInterloper]
    );
    assert.deepEqual(proposalIds(released.accepted), [interloper.proposalId]);
    assert.equal(entryFor(released, successor.proposalId).status, 'rejected');

    const rejectOriginal = {
      ...approveOriginal,
      eventId: 'urn:rosen-stewardship:decision-event:reject-reserved-original',
      operation: 'reject'
    };
    assert.throws(
      () => replayDecisions(
        proposals,
        [rejectOriginal, approveInterloper, supersedeOriginal],
        { decisionSource: 'fixture/events.json' }
      ),
      /fixture\/events\.json\[2\]: supersede cannot reserve the target while proposal .*:reserved-interloper occupies it/
    );
  });

  it('releases a successor reservation after inherited rejection suppression', () => {
    const sample = fixture('field-approval.json');
    const original = {
      ...sample.proposals[0],
      proposalId: 'urn:rosen-stewardship:proposal:inherited-original'
    };
    const successor = {
      ...sample.proposals[0],
      proposalId: 'urn:rosen-stewardship:proposal:inherited-successor',
      proposedValue: 'Suppressed successor title',
      reason: 'A named successor that will inherit a rejection.',
      supersedesProposalId: original.proposalId
    };
    const rejectedMatch = {
      ...successor,
      proposalId: 'urn:rosen-stewardship:proposal:inherited-rejection-source',
      currentValue: 'A separate observation',
      reason: 'An explicit rejection with the successor fingerprint.'
    };
    delete rejectedMatch.supersedesProposalId;
    const interloper = {
      ...sample.proposals[0],
      proposalId: 'urn:rosen-stewardship:proposal:inherited-interloper',
      proposedValue: 'Available title after suppression',
      reason: 'A proposal admitted after inherited suppression.'
    };
    const approveOriginal = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:approve-inherited-original',
      proposalId: original.proposalId
    };
    const supersedeOriginal = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:supersede-inherited-original',
      proposalId: original.proposalId,
      operation: 'supersede',
      expectedRevision: 1,
      successorProposalId: successor.proposalId
    };
    const rejectMatch = {
      ...sample.decisions[0],
      eventId: 'urn:rosen-stewardship:decision-event:reject-inherited-source',
      proposalId: rejectedMatch.proposalId,
      operation: 'reject'
    };

    const projection = replayDecisions(
      [original, successor, rejectedMatch, interloper],
      [approveOriginal, supersedeOriginal, rejectMatch]
    );
    const suppressed = entryFor(projection, successor.proposalId);
    const available = entryFor(projection, interloper.proposalId);

    assert.equal(suppressed.status, 'rejected');
    assert.equal(suppressed.suppressedByProposalId, rejectedMatch.proposalId);
    assert.equal(suppressed.targetReservedForProposalId, undefined);
    assert.equal(available.targetAvailable, true);
    assert.equal(available.targetReservedForProposalId, undefined);
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

  it('projects many independent proposal states independent of proposal input order', () => {
    const sample = fixture('field-approval.json');
    const baseProposal = sample.proposals[0];
    const baseDecision = sample.decisions[0];
    const proposals = [];
    const decisions = [];

    for (let index = 0; index < 1500; index += 1) {
      const suffix = String(index).padStart(4, '0');
      const proposal = {
        ...baseProposal,
        proposalId: `urn:rosen-stewardship:proposal:state-smoke-${suffix}`,
        objectId: `urn:rosen:object:archive-record:STATE-SMOKE-${suffix}`
      };
      proposals.push(proposal);
      if (index % 3 === 2) continue;
      decisions.push({
        ...baseDecision,
        eventId: `urn:rosen-stewardship:decision-event:state-smoke-${suffix}`,
        proposalId: proposal.proposalId,
        operation: index % 3 === 0 ? 'approve' : 'reject'
      });
    }

    const projection = replayDecisions(proposals, decisions);
    assert.equal(projection.proposed.length, 500);
    assert.equal(projection.accepted.length, 500);
    assert.equal(projection.rejected.length, 500);
    assert.equal(projection.superseded.length, 0);
    assert.deepEqual(projection, replayDecisions([...proposals].reverse(), decisions));
  });
});
