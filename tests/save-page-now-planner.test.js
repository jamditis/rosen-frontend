import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  planSavePageNowSubmission,
} from '../preservation/save-page-now-planner.mjs';

const eligibleInput = {
  objectId: 'urn:rosen:object:archive-record:RECORD-00001',
  sourceUrl: 'https://example.org/article?edition=public',
  rightsDecision: {
    rightsStatus: 'cleared',
    accessDecision: 'public',
    publicDepositEligibility: 'eligible',
    policyVersion: 'rights-policy@1.0.0',
    decisionBasis: 'The curator-approved policy permits public capture for this source class.',
  },
  inventory: {
    state: 'complete',
    acceptableCapture: null,
  },
  budgets: {
    runRemaining: 4,
    dailyRemaining: 20,
  },
};

function clone(value) {
  return structuredClone(value);
}

describe('Save Page Now dry-run planner (#715)', () => {
  it('explains an eligible submission and gives it a stable local idempotency key', () => {
    const first = planSavePageNowSubmission(eligibleInput);
    const second = planSavePageNowSubmission(clone(eligibleInput));

    assert.deepEqual(first, second);
    assert.equal(first.decision, 'submit');
    assert.equal(first.reasonCode, 'eligible');
    assert.match(first.reason, /eligible/i);
    assert.match(first.idempotencyKey, /^spn:[a-f0-9]{64}$/);
  });

  it('suppresses a submission when a verified acceptable capture exists', () => {
    const input = clone(eligibleInput);
    input.inventory = {
      state: 'partial',
      acceptableCapture: {
        verified: true,
        captureTimestamp: '20260801123045',
        replayUrl: 'https://web.archive.org/web/20260801123045id_/https://example.org/article?edition=public',
      },
    };

    assert.deepEqual(planSavePageNowSubmission(input), {
      decision: 'skip',
      reasonCode: 'acceptable-capture-exists',
      reason: 'A verified acceptable Wayback capture already exists.',
      idempotencyKey: null,
    });
  });

  it('holds malformed or unverified positive capture evidence', () => {
    const cases = [
      {
        verified: false,
        captureTimestamp: '20260801123045',
        replayUrl: 'https://web.archive.org/web/20260801123045id_/https://example.org/article',
      },
      {
        verified: true,
        captureTimestamp: '[',
        replayUrl: 'https://web.archive.org/web/invalid/https://example.org/article',
      },
      {
        verified: true,
        captureTimestamp: 20260801123045,
        replayUrl: 'https://web.archive.org/web/20260801123045id_/https://example.org/article?edition=public',
      },
      {
        verified: true,
        captureTimestamp: '20260230120000',
        replayUrl: 'https://web.archive.org/web/20260230120000id_/https://example.org/article?edition=public',
      },
      {
        verified: true,
        captureTimestamp: '20260801123045',
        replayUrl: 'https://web.archive.org/web/20260801123045id_/https://example.net/unrelated',
      },
      {
        verified: true,
        captureTimestamp: '20260801123045',
        replayUrl: 'https://web.archive.org/web/20260801123045id_/http://%',
      },
    ];

    for (const acceptableCapture of cases) {
      const input = clone(eligibleInput);
      input.inventory.acceptableCapture = acceptableCapture;
      const plan = planSavePageNowSubmission(input);
      assert.equal(plan.decision, 'hold');
      assert.equal(plan.reasonCode, 'acceptable-capture-not-verified');
    }
  });

  it('holds every source that lacks an explicit public-capture rights decision', () => {
    const cases = [
      ['unknown rights', { rightsStatus: 'unknown' }],
      ['rights hold', { rightsStatus: 'hold' }],
      ['private access', { accessDecision: 'private' }],
      ['restricted access', { accessDecision: 'restricted' }],
      ['embargoed access', { accessDecision: 'embargoed' }],
      ['ineligible deposit', { publicDepositEligibility: 'ineligible' }],
      ['undetermined deposit', { publicDepositEligibility: 'undetermined' }],
    ];

    for (const [label, patch] of cases) {
      const input = clone(eligibleInput);
      Object.assign(input.rightsDecision, patch);
      const plan = planSavePageNowSubmission(input);
      assert.equal(plan.decision, 'hold', label);
      assert.equal(plan.reasonCode, 'rights-not-cleared', label);
      assert.equal(plan.idempotencyKey, null, label);
    }
  });

  it('does not treat incomplete or failed capture inventory as permission to submit', () => {
    for (const state of ['partial', 'query-failed', 'unknown', 'excluded']) {
      const input = clone(eligibleInput);
      input.inventory.state = state;
      const plan = planSavePageNowSubmission(input);
      assert.equal(plan.decision, 'hold', state);
      assert.equal(plan.reasonCode, 'inventory-not-complete', state);
    }
  });

  it('rejects unsupported and credential-bearing source URLs before submission', () => {
    for (const sourceUrl of [
      'ftp://example.org/article',
      'urn:rosen:social-source:missing-url:TWTR-00001',
      'https://reader:secret@example.org/article',
      'http://127.0.0.1/admin',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/admin',
      'http://service.local/article',
      'http://localhost./private',
      'http://service.local./private',
      'not a URL',
    ]) {
      const input = clone(eligibleInput);
      input.sourceUrl = sourceUrl;
      const plan = planSavePageNowSubmission(input);
      assert.equal(plan.decision, 'skip', sourceUrl);
      assert.equal(plan.reasonCode, 'unsupported-source-url', sourceUrl);
      assert.equal(plan.idempotencyKey, null, sourceUrl);
    }
  });

  it('holds an eligible source when either configured submission budget is exhausted', () => {
    for (const field of ['runRemaining', 'dailyRemaining']) {
      const input = clone(eligibleInput);
      input.budgets[field] = 0;
      const plan = planSavePageNowSubmission(input);
      assert.equal(plan.decision, 'hold', field);
      assert.equal(plan.reasonCode, 'submission-budget-exhausted', field);
    }
  });

  it('changes the key when the source, object, or policy decision version changes', () => {
    const original = planSavePageNowSubmission(eligibleInput).idempotencyKey;
    const variants = [
      { objectId: 'urn:rosen:object:archive-record:RECORD-00002' },
      { sourceUrl: 'https://example.org/other-article' },
      {
        rightsDecision: {
          ...eligibleInput.rightsDecision,
          policyVersion: 'rights-policy@1.1.0',
        },
      },
    ];

    for (const variant of variants) {
      const input = { ...clone(eligibleInput), ...variant };
      assert.notEqual(planSavePageNowSubmission(input).idempotencyKey, original);
    }
  });

  it('holds input without a valid stable archive object ID', () => {
    for (const objectId of ['', ' ', 'RECORD-00001', 'urn:rosen:object:unknown:one']) {
      const input = clone(eligibleInput);
      input.objectId = objectId;
      const plan = planSavePageNowSubmission(input);
      assert.equal(plan.decision, 'hold');
      assert.equal(plan.reasonCode, 'object-identity-missing');
      assert.equal(plan.idempotencyKey, null);
    }
  });
});
