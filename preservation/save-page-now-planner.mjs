import { createHash } from 'node:crypto';

export const SAVE_PAGE_NOW_PLANNER_VERSION = 'save-page-now-planner@0.1.0';

const PUBLIC_CAPTURE_RIGHTS = Object.freeze({
  rightsStatus: 'cleared',
  accessDecision: 'public',
  publicDepositEligibility: 'eligible',
});
const OBJECT_ID_PATTERN = new RegExp(
  '^urn:rosen:object:'
  + '(?:archive-record|social-post|entity|relationship|dataset|source-file|'
  + 'generated-artifact|feature-record):[A-Za-z0-9][A-Za-z0-9._:-]*$',
);

function result(decision, reasonCode, reason, idempotencyKey = null) {
  return { decision, reasonCode, reason, idempotencyKey };
}

function isSupportedPublicUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.username === ''
      && url.password === ''
      && hostname !== 'localhost'
      && !hostname.endsWith('.localhost')
      && !hostname.endsWith('.local')
      && !/^\d+(?:\.\d+){3}$/.test(hostname)
      && !hostname.includes(':');
  } catch {
    return false;
  }
}

function hasPublicCaptureRights(rightsDecision) {
  if (!rightsDecision || typeof rightsDecision !== 'object') return false;
  return Object.entries(PUBLIC_CAPTURE_RIGHTS).every(
    ([field, requiredValue]) => rightsDecision[field] === requiredValue,
  ) && typeof rightsDecision.policyVersion === 'string'
    && rightsDecision.policyVersion.length > 0
    && typeof rightsDecision.decisionBasis === 'string'
    && rightsDecision.decisionBasis.length > 0;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function verifiedAcceptableCapture(inventory) {
  const capture = inventory?.acceptableCapture;
  const timestamp = capture?.captureTimestamp ?? '';
  if (!/^\d{14}$/.test(timestamp)) return false;

  const replayPattern = new RegExp(
    `^https://web\\.archive\\.org/web/${timestamp}(?:[a-z]{2}_)?/https?://`,
  );
  return capture
    && capture.verified === true
    && typeof capture.replayUrl === 'string'
    && replayPattern.test(capture.replayUrl);
}

function makeIdempotencyKey(input) {
  const identity = JSON.stringify({
    adapterVersion: SAVE_PAGE_NOW_PLANNER_VERSION,
    objectId: input.objectId,
    sourceUrl: input.sourceUrl,
    policyVersion: input.rightsDecision.policyVersion,
  });
  return `spn:${createHash('sha256').update(identity).digest('hex')}`;
}

/**
 * Explain whether a source is ready for a Save Page Now side effect.
 *
 * This planner performs no network request and accepts no credentials. A
 * caller must journal the returned idempotency key before a remote adapter
 * submits eligible work, then replace the planned result with a remote receipt.
 */
export function planSavePageNowSubmission(input = {}) {
  if (!isSupportedPublicUrl(input.sourceUrl)) {
    return result(
      'skip',
      'unsupported-source-url',
      'Save Page Now accepts only public-host HTTP or HTTPS URLs without embedded credentials.',
    );
  }

  if (verifiedAcceptableCapture(input.inventory)) {
    return result(
      'skip',
      'acceptable-capture-exists',
      'A verified acceptable Wayback capture already exists.',
    );
  }

  if (input.inventory?.acceptableCapture != null) {
    return result(
      'hold',
      'acceptable-capture-not-verified',
      'Existing capture evidence is incomplete or unverified.',
    );
  }

  if (!hasPublicCaptureRights(input.rightsDecision)) {
    return result(
      'hold',
      'rights-not-cleared',
      'The current rights decision does not explicitly allow a public capture.',
    );
  }

  if (input.inventory?.state !== 'complete') {
    return result(
      'hold',
      'inventory-not-complete',
      'Capture inventory is not complete, so absence of an acceptable capture is unproven.',
    );
  }

  if (!positiveInteger(input.budgets?.runRemaining)
      || !positiveInteger(input.budgets?.dailyRemaining)) {
    return result(
      'hold',
      'submission-budget-exhausted',
      'The configured per-run or daily submission budget has no remaining capacity.',
    );
  }

  if (!OBJECT_ID_PATTERN.test(input.objectId ?? '')) {
    return result(
      'hold',
      'object-identity-missing',
      'A valid stable archive object ID is required before submission.',
    );
  }

  return result(
    'submit',
    'eligible',
    'The source is eligible, lacks an acceptable capture, and is within both submission budgets.',
    makeIdempotencyKey(input),
  );
}
