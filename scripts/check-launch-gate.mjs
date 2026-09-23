import fs from 'node:fs';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { evaluateLaunchGate } from '../lib/launch-readiness.js';

const results = JSON.parse(
  fs.readFileSync(new URL('../docs/FIELD_TEST_RESULTS.json', import.meta.url), 'utf8')
);

const gate = evaluateLaunchGate({
  launchPhase: RUNTIME_CONFIG.launchPhase,
  results
});

console.log(
  'Waffer launch gate:',
  JSON.stringify({
    phase: gate.phase,
    allowed: gate.allowed,
    promotionReady: gate.promotionReady,
    passed: gate.fieldTest.passed,
    failed: gate.fieldTest.failed,
    pending: gate.fieldTest.pending,
    expected: gate.fieldTest.expected
  })
);

if (!gate.allowed) {
  console.error('Launch gate blocked:');
  for (const blocker of gate.blockers) console.error('- ' + blocker);
  process.exit(1);
}

if (!gate.promotionReady) {
  console.log('Promotion remains blocked until all field-test scenarios pass.');
}
