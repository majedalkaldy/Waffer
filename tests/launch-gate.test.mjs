import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateFieldTestResults,
  evaluateLaunchGate
} from '../lib/launch-readiness.js';

function runtimeEvidence(id, overrides = {}) {
  const base = {
    requestId: 'req-' + id,
    completedAt: '2026-09-24T10:00:00.000Z',
    engineVersion: 'mvp-2026-09',
    commit: 'abcdef12',
    acceptance: { schemaValid: true, identifiedParts: 1 },
    upload: { mimeType: 'image/jpeg', bytes: 1234 },
    vehicle: {
      vehicleId: 9445,
      vin: '1HGCM82633A004352',
      manufacturerName: 'FORD',
      modelName: 'Expedition'
    },
    catalogState: { status: 'COMPLETED', matched: 1 },
    pricingSummary: null,
    total: '500 SAR',
    calculatedTotal: '500 SAR'
  };

  if (id === 9) {
    base.acceptance = { schemaValid: true, identifiedParts: 0 };
  }
  if (id === 10) {
    base.total = '1,150 SAR';
    base.calculatedTotal = '1,000 SAR';
  }

  return { ...base, ...overrides };
}

function scenario(id, status = 'PENDING') {
  const entry = {
    id,
    title: 'Scenario ' + id,
    status,
    testedAt: status === 'PENDING' ? null : '2026-09-24T10:00:00.000Z',
    evidence: null,
    notes: ''
  };

  if (status === 'PASS' || status === 'FAIL') {
    if (id === 4) {
      entry.notes = 'Oversized PDF rejected before upload with a clear size message';
    } else if (id === 6) {
      entry.notes = 'Invalid VIN rejected before provider lookup';
    } else {
      entry.evidence = runtimeEvidence(id);
    }
  }

  if (status === 'PASS' && id === 8) {
    entry.notes = 'Front axle result verified against fitting-position criteria';
  }
  if (status === 'FAIL') {
    entry.notes = entry.notes || 'Failure details captured during field test';
  }

  return entry;
}

function scenarios(status = 'PENDING') {
  return Array.from({ length: 10 }, (_, index) => scenario(index + 1, status));
}

function barePassScenarios() {
  return Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    title: 'Scenario ' + (index + 1),
    status: 'PASS'
  }));
}

test('field-test phase is allowed with valid pending evidence structure', () => {
  const gate = evaluateLaunchGate({
    launchPhase: 'field-test',
    results: { scenarios: scenarios('PENDING') }
  });

  assert.equal(gate.allowed, true);
  assert.equal(gate.promotionReady, false);
  assert.equal(gate.fieldTest.evidenceValid, true);
  assert.equal(gate.fieldTest.pending, 10);
  assert.equal(gate.fieldTest.passed, 0);
});

test('public-beta is blocked until all ten field-test scenarios pass', () => {
  const mixed = scenarios('PASS');
  mixed[7] = scenario(8, 'PENDING');

  const gate = evaluateLaunchGate({
    launchPhase: 'public-beta',
    results: { scenarios: mixed }
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.promotionReady, false);
  assert.ok(gate.blockers.some(item => item.includes('Scenario 8 is PENDING')));
});

test('public-beta is allowed only after all ten scenarios pass with valid evidence', () => {
  const gate = evaluateLaunchGate({
    launchPhase: 'public-beta',
    results: { scenarios: scenarios('PASS') }
  });

  assert.equal(gate.allowed, true);
  assert.equal(gate.promotionReady, true);
  assert.equal(gate.fieldTest.evidenceValid, true);
  assert.equal(gate.fieldTest.integrityValid, true);
  assert.equal(gate.fieldTest.passed, 10);
  assert.equal(gate.fieldTest.pending, 0);
  assert.equal(gate.fieldTest.failed, 0);
});

test('ten handwritten PASS statuses without evidence cannot bypass the launch gate', () => {
  const gate = evaluateLaunchGate({
    launchPhase: 'public-beta',
    results: { scenarios: barePassScenarios() }
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.promotionReady, false);
  assert.equal(gate.fieldTest.evidenceValid, false);
  assert.equal(gate.fieldTest.integrityValid, false);
  assert.ok(gate.blockers.some(item => item.includes('valid testedAt')));
  assert.ok(gate.blockers.some(item => item.includes('captured runtime evidence')));
});

test('field-test CI also rejects an official PASS that lacks required evidence', () => {
  const mixed = scenarios('PENDING');
  mixed[0] = {
    id: 1,
    title: 'Scenario 1',
    status: 'PASS',
    testedAt: '2026-09-24T10:00:00.000Z',
    evidence: null,
    notes: ''
  };

  const gate = evaluateLaunchGate({
    launchPhase: 'field-test',
    results: { scenarios: mixed }
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.fieldTest.evidenceValid, false);
  assert.ok(gate.blockers.some(item => item.includes('Scenario 1: PASS requires captured runtime evidence')));
});

test('schema errors block every phase, including field-test', () => {
  const broken = scenarios('PASS');
  broken.pop();
  broken.push({ ...scenario(9, 'PASS') });

  const field = evaluateFieldTestResults({ scenarios: broken });
  assert.equal(field.schemaValid, false);
  assert.equal(field.integrityValid, false);
  assert.ok(field.blockers.some(item => item.includes('Duplicate scenario id: 9')));
  assert.ok(field.blockers.some(item => item.includes('Missing scenario id: 10')));

  const gate = evaluateLaunchGate({
    launchPhase: 'field-test',
    results: { scenarios: broken }
  });
  assert.equal(gate.allowed, false);
});

test('unknown launch phase is rejected', () => {
  const gate = evaluateLaunchGate({
    launchPhase: 'mystery',
    results: { scenarios: scenarios('PASS') }
  });

  assert.equal(gate.phaseValid, false);
  assert.equal(gate.allowed, false);
});
