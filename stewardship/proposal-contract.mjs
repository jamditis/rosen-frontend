import { createHash } from 'node:crypto';

export const PROPOSAL_SCHEMA_VERSION = '1.0.0';
export const PROPOSAL_VOCABULARY_VERSION = '1.0.0';
export const DECISION_SCHEMA_VERSION = '1.0.0';
export const DECISION_VOCABULARY_VERSION = '1.0.0';

const OBJECT_CLASSES = new Set([
  'archive-record',
  'social-post',
  'entity',
  'relationship',
  'dataset',
  'source-file',
  'generated-artifact',
  'feature-record'
]);
const SEVERITIES = new Set(['info', 'low', 'medium', 'high', 'critical']);
const RISK_CLASSES = new Set(['deterministic', 'semantic', 'restricted']);
const OPERATIONS = new Set(['approve', 'reject', 'supersede']);
const PROPOSAL_ID = /^urn:rosen-stewardship:proposal:[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DECISION_ID = /^urn:rosen-stewardship:decision-event:[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const OBJECT_ID = /^urn:rosen:object:(archive-record|social-post|entity|relationship|dataset|source-file|generated-artifact|feature-record):[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._@+:-]*$/;
const TARGET_KEY = /^[A-Za-z0-9][A-Za-z0-9._:/|+-]*$/;
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?Z$/;

const PROPOSAL_REQUIRED_FIELDS = new Set([
  'schemaVersion',
  'vocabularyVersion',
  'proposalId',
  'objectId',
  'objectClass',
  'target',
  'currentValue',
  'proposedValue',
  'relevantInputHash',
  'evidenceRefs',
  'ruleVersion',
  'generationVersion',
  'reason',
  'confidence',
  'severity',
  'riskClass'
]);
const PROPOSAL_OPTIONAL_FIELDS = new Set([
  'duplicateOfProposalId',
  'supersedesProposalId'
]);
const DECISION_REQUIRED_FIELDS = new Set([
  'schemaVersion',
  'vocabularyVersion',
  'eventId',
  'proposalId',
  'operation',
  'expectedRevision',
  'actor',
  'occurredAt',
  'reason'
]);
const DECISION_OPTIONAL_FIELDS = new Set([
  'notes',
  'publicationRefs',
  'successorProposalId'
]);

export class ProposalContractError extends Error {
  constructor(message, { source = 'contract', index = null } = {}) {
    const location = index === null ? source : `${source}[${index}]`;
    super(`${location}: ${message}`);
    this.name = 'ProposalContractError';
    this.source = source;
    this.index = index;
    this.location = location;
  }
}

function fail(message, context) {
  throw new ProposalContractError(message, context);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalNode(value, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON numbers must be finite');
    return JSON.stringify(value);
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new TypeError('values must contain only JSON objects, arrays, and primitives');
  }
  if (ancestors.has(value)) throw new TypeError('values must not contain cycles');

  ancestors.add(value);
  let encoded;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError('JSON arrays must not be sparse');
    }
    encoded = `[${value.map(item => canonicalNode(item, ancestors)).join(',')}]`;
  } else {
    encoded = `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalNode(value[key], ancestors)}`)
      .join(',')}}`;
  }
  ancestors.delete(value);
  return encoded;
}

export function canonicalJson(value) {
  return canonicalNode(value, new Set());
}

function hashCanonical(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function valueHash(value) {
  return hashCanonical(value);
}

export function proposalHash(proposal) {
  return hashCanonical(proposal);
}

export function rejectionFingerprint(proposal) {
  return hashCanonical({
    objectClass: proposal.objectClass,
    objectId: proposal.objectId,
    target: proposal.target,
    relevantInputHash: proposal.relevantInputHash,
    ruleVersion: proposal.ruleVersion,
    generationVersion: proposal.generationVersion,
    proposedValue: proposal.proposedValue
  });
}

function detached(value) {
  return JSON.parse(canonicalJson(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function validateFields(value, required, optional, label, context) {
  if (!isPlainObject(value)) fail(`${label} must be a JSON object`, context);
  const fields = new Set(Object.keys(value));
  const missing = [...required].filter(field => !fields.has(field));
  if (missing.length) fail(`${label} is missing ${missing.join(', ')}`, context);
  const unexpected = [...fields].filter(
    field => !required.has(field) && !optional.has(field)
  );
  if (unexpected.length) fail(`${label} has unexpected fields: ${unexpected.join(', ')}`, context);
}

function requireNonemptyString(value, label, context) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`, context);
}

function isValidTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  return parsed.toISOString() === normalized;
}

function validateReferences(value, label, context) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    fail(`${label} must be an array of non-empty strings`, context);
  }
  if (new Set(value).size !== value.length) fail(`${label} must not contain duplicates`, context);
}

export function validateProposal(value, context = { source: 'proposal' }) {
  validateFields(
    value,
    PROPOSAL_REQUIRED_FIELDS,
    PROPOSAL_OPTIONAL_FIELDS,
    'proposal',
    context
  );
  if (value.schemaVersion !== PROPOSAL_SCHEMA_VERSION) {
    fail(`unsupported proposal schemaVersion ${JSON.stringify(value.schemaVersion)}`, context);
  }
  if (value.vocabularyVersion !== PROPOSAL_VOCABULARY_VERSION) {
    fail(`unsupported proposal vocabularyVersion ${JSON.stringify(value.vocabularyVersion)}`, context);
  }
  if (typeof value.proposalId !== 'string' || !PROPOSAL_ID.test(value.proposalId)) {
    fail('proposalId must use the Rosen stewardship proposal URN', context);
  }
  if (!OBJECT_CLASSES.has(value.objectClass)) fail('objectClass is not supported', context);
  const objectMatch = typeof value.objectId === 'string' ? OBJECT_ID.exec(value.objectId) : null;
  if (!objectMatch || objectMatch[1] !== value.objectClass) {
    fail('objectId must be a stable Rosen object URN that matches objectClass', context);
  }
  if (
    !isPlainObject(value.target)
    || Object.keys(value.target).sort().join(',') !== 'key,kind'
    || !['field', 'assertion'].includes(value.target.kind)
    || typeof value.target.key !== 'string'
    || !TARGET_KEY.test(value.target.key)
  ) {
    fail('target must contain a field or assertion kind and stable key', context);
  }
  try {
    canonicalJson(value.currentValue);
    canonicalJson(value.proposedValue);
  } catch (error) {
    fail(`proposal values are not canonical JSON: ${error.message}`, context);
  }
  if (typeof value.relevantInputHash !== 'string' || !SHA256.test(value.relevantInputHash)) {
    fail('relevantInputHash must be a lowercase SHA-256 digest', context);
  }
  validateReferences(value.evidenceRefs, 'evidenceRefs', context);
  if (value.evidenceRefs.length === 0) fail('evidenceRefs must not be empty', context);
  if (typeof value.ruleVersion !== 'string' || !VERSION.test(value.ruleVersion)) {
    fail('ruleVersion must be a stable version', context);
  }
  if (typeof value.generationVersion !== 'string' || !VERSION.test(value.generationVersion)) {
    fail('generationVersion must be a stable version', context);
  }
  requireNonemptyString(value.reason, 'reason', context);
  if (
    value.confidence !== null
    && (
      typeof value.confidence !== 'number'
      || !Number.isFinite(value.confidence)
      || value.confidence < 0
      || value.confidence > 1
    )
  ) {
    fail('confidence must be null or a finite number from 0 through 1', context);
  }
  if (!SEVERITIES.has(value.severity)) fail('severity is not supported', context);
  if (!RISK_CLASSES.has(value.riskClass)) fail('riskClass is not supported', context);

  const duplicateId = value.duplicateOfProposalId;
  const supersededId = value.supersedesProposalId;
  if (duplicateId !== undefined && (typeof duplicateId !== 'string' || !PROPOSAL_ID.test(duplicateId))) {
    fail('duplicateOfProposalId must use the proposal URN', context);
  }
  if (supersededId !== undefined && (typeof supersededId !== 'string' || !PROPOSAL_ID.test(supersededId))) {
    fail('supersedesProposalId must use the proposal URN', context);
  }
  if (duplicateId !== undefined && supersededId !== undefined) {
    fail('a proposal cannot be both a duplicate and a successor', context);
  }
  if (duplicateId === value.proposalId || supersededId === value.proposalId) {
    fail('a proposal cannot link to itself', context);
  }
  return deepFreeze(detached(value));
}

export function validateDecision(value, context = { source: 'decision' }) {
  validateFields(
    value,
    DECISION_REQUIRED_FIELDS,
    DECISION_OPTIONAL_FIELDS,
    'decision event',
    context
  );
  if (value.schemaVersion !== DECISION_SCHEMA_VERSION) {
    fail(`unsupported decision schemaVersion ${JSON.stringify(value.schemaVersion)}`, context);
  }
  if (value.vocabularyVersion !== DECISION_VOCABULARY_VERSION) {
    fail(`unsupported decision vocabularyVersion ${JSON.stringify(value.vocabularyVersion)}`, context);
  }
  if (typeof value.eventId !== 'string' || !DECISION_ID.test(value.eventId)) {
    fail('eventId must use the Rosen stewardship decision-event URN', context);
  }
  if (typeof value.proposalId !== 'string' || !PROPOSAL_ID.test(value.proposalId)) {
    fail('proposalId must use the Rosen stewardship proposal URN', context);
  }
  if (!OPERATIONS.has(value.operation)) fail('operation is not supported', context);
  if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) {
    fail('expectedRevision must be a nonnegative safe integer', context);
  }
  if (
    !isPlainObject(value.actor)
    || Object.keys(value.actor).sort().join(',') !== 'actorId,actorType'
    || !['human', 'automation'].includes(value.actor.actorType)
    || typeof value.actor.actorId !== 'string'
    || !ACTOR_ID.test(value.actor.actorId)
  ) {
    fail('actor must contain a supported actorType and stable actorId', context);
  }
  if (
    !isValidTimestamp(value.occurredAt)
  ) {
    fail('occurredAt must be a valid UTC timestamp', context);
  }
  requireNonemptyString(value.reason, 'reason', context);
  if (value.notes !== undefined && value.notes !== null) {
    requireNonemptyString(value.notes, 'notes', context);
  }
  if (value.publicationRefs !== undefined) {
    validateReferences(value.publicationRefs, 'publicationRefs', context);
  }
  if (value.operation === 'supersede') {
    if (
      typeof value.successorProposalId !== 'string'
      || !PROPOSAL_ID.test(value.successorProposalId)
    ) {
      fail('supersede decisions require a successorProposalId', context);
    }
  } else if (value.successorProposalId !== undefined) {
    fail('successorProposalId is only valid for supersede decisions', context);
  }
  return deepFreeze(detached(value));
}

function validateProposalLinks(proposals, byId, source) {
  for (const [index, proposal] of proposals.entries()) {
    const context = { source, index };
    if (proposal.duplicateOfProposalId !== undefined) {
      const original = byId.get(proposal.duplicateOfProposalId)?.proposal;
      if (!original) fail(`duplicateOfProposalId ${proposal.duplicateOfProposalId} is missing`, context);
      if (original.duplicateOfProposalId !== undefined) {
        fail('duplicateOfProposalId must reference an original proposal', context);
      }
      if (rejectionFingerprint(proposal) !== rejectionFingerprint(original)) {
        fail('duplicateOfProposalId must have an identical rejection fingerprint', context);
      }
    }
    if (proposal.supersedesProposalId !== undefined) {
      const original = byId.get(proposal.supersedesProposalId)?.proposal;
      if (!original) fail(`supersedesProposalId ${proposal.supersedesProposalId} is missing`, context);
      if (
        original.objectId !== proposal.objectId
        || canonicalJson(original.target) !== canonicalJson(proposal.target)
      ) {
        fail('a successor must target the same object and field or assertion', context);
      }
      if (rejectionFingerprint(proposal) === rejectionFingerprint(original)) {
        fail('a successor must change its rejection fingerprint', context);
      }
    }
  }
}

function addPublicationRefs(entry, event) {
  for (const reference of event.publicationRefs ?? []) {
    if (!entry.publicationRefs.includes(reference)) entry.publicationRefs.push(reference);
  }
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function targetIdentity(proposal) {
  return canonicalJson([
    proposal.objectId,
    proposal.target.kind,
    proposal.target.key
  ]);
}

function createReplayState(entries) {
  return {
    entries,
    acceptedByTarget: new Map(),
    reservationByTarget: new Map(),
    rejectionByFingerprint: new Map()
  };
}

function retainedRejection(entry, state) {
  return state.rejectionByFingerprint.get(entry.rejectionFingerprint);
}

function releaseReservation(entry, state) {
  if (state.reservationByTarget.get(entry.targetIdentity) === entry.proposal.proposalId) {
    state.reservationByTarget.delete(entry.targetIdentity);
  }
}

function recordRejection(entry, event, state) {
  const retained = state.rejectionByFingerprint.get(entry.rejectionFingerprint);
  if (
    retained === undefined
    || compareCodeUnits(
      entry.proposal.proposalId,
      retained.source.proposal.proposalId
    ) < 0
  ) {
    state.rejectionByFingerprint.set(entry.rejectionFingerprint, {
      source: entry,
      event
    });
  }
}

function updateReplayState(entry, event, previousStatus, state) {
  if (event.operation === 'approve') {
    state.acceptedByTarget.set(entry.targetIdentity, entry);
    releaseReservation(entry, state);
  } else if (event.operation === 'reject') {
    releaseReservation(entry, state);
    recordRejection(entry, event, state);
  } else {
    if (
      previousStatus === 'accepted'
      && state.acceptedByTarget.get(entry.targetIdentity) === entry
    ) {
      state.acceptedByTarget.delete(entry.targetIdentity);
    }
    state.reservationByTarget.set(entry.targetIdentity, event.successorProposalId);
  }
}

function targetAdmission(entry, state) {
  const accepted = state.acceptedByTarget.get(entry.targetIdentity);
  const occupant = accepted === entry ? undefined : accepted;
  if (occupant) return { available: false, occupant };

  const reservedForProposalId = state.reservationByTarget.get(entry.targetIdentity);
  return {
    available: reservedForProposalId === undefined
      || reservedForProposalId === entry.proposal.proposalId,
    reservedForProposalId
  };
}

function assertApprovalAllowed(entry, state, context) {
  const originalId = entry.proposal.supersedesProposalId;
  if (originalId !== undefined) {
    const original = state.entries.get(originalId);
    if (
      original.status !== 'superseded'
      || original.successorProposalId !== entry.proposal.proposalId
    ) {
      fail(
        `approve cannot apply before a matching supersede decision for ${originalId}`,
        context
      );
    }
  }

  const rejection = retainedRejection(entry, state);
  if (rejection) {
    fail(
      `approve cannot apply because proposal ${rejection.source.proposal.proposalId} retains the same rejection fingerprint`,
      context
    );
  }

  const target = targetAdmission(entry, state);
  if (target.occupant) {
    fail(
      `approve cannot apply while proposal ${target.occupant.proposal.proposalId} occupies the target`,
      context
    );
  }
  if (!target.available) {
    fail(
      `approve cannot apply because the target is reserved for proposal ${target.reservedForProposalId}`,
      context
    );
  }
}

function assertSupersessionAllowed(entry, successor, state, context) {
  const rejection = retainedRejection(successor, state);
  if (rejection) {
    fail(
      `supersede cannot reserve a successor matching retained rejection ${rejection.source.proposal.proposalId}`,
      context
    );
  }

  const target = targetAdmission(entry, state);
  if (target.occupant) {
    fail(
      `supersede cannot reserve the target while proposal ${target.occupant.proposal.proposalId} occupies it`,
      context
    );
  }
  if (
    target.reservedForProposalId !== undefined
    && target.reservedForProposalId !== successor.proposal.proposalId
  ) {
    fail(
      `supersede cannot replace target reservation for proposal ${target.reservedForProposalId}`,
      context
    );
  }
}

function applyDecision(entry, event, state, context) {
  if (entry.proposal.duplicateOfProposalId !== undefined) {
    fail('a declared duplicate cannot receive its own decision', context);
  }
  if (event.expectedRevision !== entry.revision) {
    fail(
      `expectedRevision ${event.expectedRevision} does not match current revision ${entry.revision}`,
      context
    );
  }

  const previousStatus = entry.status;
  if (event.operation === 'approve' || event.operation === 'reject') {
    if (entry.status !== 'proposed') {
      fail(`${event.operation} cannot change a proposal in ${entry.status} state`, context);
    }
    if (event.operation === 'approve') {
      assertApprovalAllowed(entry, state, context);
      entry.status = 'accepted';
    } else {
      entry.status = 'rejected';
    }
  } else {
    if (!['accepted', 'rejected'].includes(entry.status)) {
      fail(`supersede cannot change a proposal in ${entry.status} state`, context);
    }
    const successor = state.entries.get(event.successorProposalId);
    if (!successor) fail(`successorProposalId ${event.successorProposalId} is missing`, context);
    if (successor.proposal.supersedesProposalId !== entry.proposal.proposalId) {
      fail('successor proposal does not link back through supersedesProposalId', context);
    }
    if (successor.status !== 'proposed' || successor.decisionHistory.length !== 0) {
      fail('successor proposal must be undecided when supersession applies', context);
    }
    assertSupersessionAllowed(entry, successor, state, context);
    entry.status = 'superseded';
    entry.successorProposalId = event.successorProposalId;
  }

  entry.revision += 1;
  entry.decisionHistory.push(event);
  addPublicationRefs(entry, event);
  updateReplayState(entry, event, previousStatus, state);
}

function suppressProposal(entry, original, rejection, state) {
  entry.status = 'rejected';
  entry.suppressedByProposalId = original.proposal.proposalId;
  entry.inheritedRejectionEventId = rejection.eventId;
  releaseReservation(entry, state);
}

function finalizeRejectedFingerprints(state, source) {
  for (const entry of state.entries.values()) {
    const originalId = entry.proposal.duplicateOfProposalId;
    if (originalId !== undefined) {
      const original = state.entries.get(originalId);
      const rejection = original.decisionHistory.find(event => event.operation === 'reject');
      if (!rejection) {
        fail(
          `duplicateOfProposalId ${originalId} has no retained rejection decision`,
          { source, index: entry.proposalIndex }
        );
      }
      suppressProposal(entry, original, rejection, state);
      continue;
    }

    if (entry.status !== 'proposed') continue;
    const retained = retainedRejection(entry, state);
    if (retained) suppressProposal(entry, retained.source, retained.event, state);
  }
}

function finalizeSuccessors(entries, source) {
  for (const entry of entries.values()) {
    const originalId = entry.proposal.supersedesProposalId;
    if (originalId === undefined || entry.status !== 'accepted') continue;
    const original = entries.get(originalId);
    if (original.status !== 'superseded' || original.successorProposalId !== entry.proposal.proposalId) {
      fail(
        `accepted successor is missing a matching supersede decision for ${originalId}`,
        { source, index: entry.proposalIndex }
      );
    }
  }
}

function publicEntry(entry, state) {
  const target = targetAdmission(entry, state);
  const output = {
    proposal: entry.proposal,
    proposalHash: proposalHash(entry.proposal),
    rejectionFingerprint: entry.rejectionFingerprint,
    status: entry.status,
    revision: entry.revision,
    decisionHistory: entry.decisionHistory,
    publicationRefs: entry.publicationRefs,
    targetAvailable: target.available
  };
  if (target.reservedForProposalId !== undefined) {
    output.targetReservedForProposalId = target.reservedForProposalId;
  }
  if (entry.proposal.supersedesProposalId !== undefined) {
    const original = state.entries.get(entry.proposal.supersedesProposalId);
    output.supersessionReady = original.status === 'superseded'
      && original.successorProposalId === entry.proposal.proposalId;
  }
  for (const field of [
    'successorProposalId',
    'suppressedByProposalId',
    'inheritedRejectionEventId'
  ]) {
    if (entry[field] !== undefined) output[field] = entry[field];
  }
  return deepFreeze(detached(output));
}

export function replayDecisions(
  proposalValues,
  decisionValues,
  { proposalSource = 'proposals', decisionSource = 'decisions' } = {}
) {
  if (!Array.isArray(proposalValues)) fail('proposals must be an array', { source: proposalSource });
  if (!Array.isArray(decisionValues)) fail('decisions must be an array', { source: decisionSource });

  const proposals = proposalValues.map((value, index) =>
    validateProposal(value, { source: proposalSource, index })
  );
  const entries = new Map();
  for (const [index, proposal] of proposals.entries()) {
    if (entries.has(proposal.proposalId)) {
      fail(`duplicate proposalId ${proposal.proposalId}`, { source: proposalSource, index });
    }
    entries.set(proposal.proposalId, {
      proposal,
      proposalIndex: index,
      targetIdentity: targetIdentity(proposal),
      status: 'proposed',
      revision: 0,
      rejectionFingerprint: rejectionFingerprint(proposal),
      decisionHistory: [],
      publicationRefs: []
    });
  }
  validateProposalLinks(proposals, entries, proposalSource);
  const state = createReplayState(entries);

  const decisions = decisionValues.map((value, index) =>
    validateDecision(value, { source: decisionSource, index })
  );
  const eventLocations = new Map();
  for (const [index, event] of decisions.entries()) {
    if (eventLocations.has(event.eventId)) {
      fail(
        `duplicate eventId ${event.eventId}; first seen at ${decisionSource}[${eventLocations.get(event.eventId)}]`,
        { source: decisionSource, index }
      );
    }
    eventLocations.set(event.eventId, index);
    if (!entries.has(event.proposalId)) {
      fail(`proposalId ${event.proposalId} is missing`, { source: decisionSource, index });
    }
    if (event.successorProposalId !== undefined && !entries.has(event.successorProposalId)) {
      fail(
        `successorProposalId ${event.successorProposalId} is missing`,
        { source: decisionSource, index }
      );
    }
  }

  for (const [index, event] of decisions.entries()) {
    applyDecision(entries.get(event.proposalId), event, state, {
      source: decisionSource,
      index
    });
  }
  finalizeRejectedFingerprints(state, proposalSource);
  finalizeSuccessors(entries, proposalSource);

  const ordered = [...entries.values()]
    .map(entry => publicEntry(entry, state))
    .sort((left, right) =>
      compareCodeUnits(left.proposal.proposalId, right.proposal.proposalId)
    );
  const result = {
    schemaVersion: '1.0.0',
    proposed: ordered.filter(entry => entry.status === 'proposed'),
    accepted: ordered.filter(entry => entry.status === 'accepted'),
    rejected: ordered.filter(entry => entry.status === 'rejected'),
    superseded: ordered.filter(entry => entry.status === 'superseded')
  };
  return deepFreeze(result);
}

function eligibility(entry, currentInputHash, requiredStatus) {
  if (typeof currentInputHash !== 'string' || !SHA256.test(currentInputHash)) {
    throw new TypeError('currentInputHash must be a lowercase SHA-256 digest');
  }
  const reasons = [];
  if (entry.status !== requiredStatus) reasons.push(`status is ${entry.status}`);
  if (entry.proposal.supersedesProposalId !== undefined && entry.supersessionReady !== true) {
    reasons.push('supersession is pending');
  }
  if (requiredStatus === 'proposed' && entry.targetAvailable !== true) {
    if (entry.targetReservedForProposalId !== undefined) {
      reasons.push(`target is reserved for proposal ${entry.targetReservedForProposalId}`);
    } else {
      reasons.push('target already has an accepted proposal');
    }
  }
  if (entry.proposal.relevantInputHash !== currentInputHash) reasons.push('relevant input changed');
  return deepFreeze({ eligible: reasons.length === 0, reasons });
}

export function approvalEligibility(entry, currentInputHash) {
  return eligibility(entry, currentInputHash, 'proposed');
}

export function releaseEligibility(entry, currentInputHash) {
  return eligibility(entry, currentInputHash, 'accepted');
}
