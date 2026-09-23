import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateFieldTestResults,
  evaluateLaunchGate
} from '../lib/launch-readiness.js';

function scenarios(status = 'PENDING') {
  return Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    title: 'Scenario ' + (index + 1),
    status
  }));
}

test('field-test phase is allowed with valid pending evidence structure', () => {
  const gate = evaluateLaunchGate({
    launchPhase: 'field-test',
    results: { scenarios: scenarios('PENDING') }
  });

  assert.equal(gate.allowed, true);
  assert.equal(gate.promotionReady, false);
  assert.equal(gate.fieldTest.pending, 10);
  assert.equal(gate.fieldTest.passed, 0);
});

test('public-beta is blocked until all ten field-test scenarios pass', () => {
  const mixed = scenarios('PASS');
  mixed[7].status = 'PENDING';

  const gate = evaluateLaunchGate({
    launchPhase: 'public-beta',
    results: { scenarios: mixed }
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.promotionReady, false);
  assert.ok(gate.blockers.some(item => item.includes('Scenario 8 is PENDING')));
});

test('public-beta is allowed only after all field-test scenarios pass', () => {
  const gate = evaluateLaunchGate({
    launchPhase: 'public-beta',
    results: { scenarios: scenarios('PASS') }
  });

  assert.equal(gate.allowed, true);
  assert.equal(gate.promotionReady, true);
  assert.equal(gate.fieldTest.passed, 10);
  assert.equal(gate.fieldTest.pending, 0);
  assert.equal(gate.fieldTest.failed, 0);
});

test('schema errors block every phase, including field-test', () => {
  const broken = scenarios('PASS');
  broken.pop();
  broken.push({ id: 9, status: 'PASS' });

  const field = evaluateFieldTestResults({ scenarios: broken });
  assert.equal(field.schemaValid, false);
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
