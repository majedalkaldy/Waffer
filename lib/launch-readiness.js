const REQUIRED_SCENARIO_IDS = Object.freeze([1,2,3,4,5,6,7,8,9,10]);
const VALID_STATUSES = new Set(['PENDING','PASS','FAIL']);
const VALID_PHASES = new Set(['field-test','public-beta','production']);

export function evaluateFieldTestResults(results = {}) {
  const scenarios = Array.isArray(results?.scenarios) ? results.scenarios : [];
  const schemaErrors = [];
  const seen = new Set();

  for (const scenario of scenarios) {
    const id = Number(scenario?.id);
    if (!Number.isInteger(id)) {
      schemaErrors.push('Scenario id must be an integer');
      continue;
    }
    if (seen.has(id)) schemaErrors.push('Duplicate scenario id: ' + id);
    seen.add(id);

    const status = String(scenario?.status || '').toUpperCase();
    if (!VALID_STATUSES.has(status)) {
      schemaErrors.push('Invalid status for scenario ' + id + ': ' + status);
    }
  }

  for (const id of REQUIRED_SCENARIO_IDS) {
    if (!seen.has(id)) schemaErrors.push('Missing scenario id: ' + id);
  }

  for (const id of seen) {
    if (!REQUIRED_SCENARIO_IDS.includes(id)) schemaErrors.push('Unexpected scenario id: ' + id);
  }

  const normalized = REQUIRED_SCENARIO_IDS.map(id => {
    const scenario = scenarios.find(item => Number(item?.id) === id) || {};
    return {
      id,
      status: String(scenario?.status || 'PENDING').toUpperCase(),
      title: String(scenario?.title || ''),
      testedAt: scenario?.testedAt || null,
      evidence: scenario?.evidence || null,
      notes: String(scenario?.notes || '')
    };
  });

  const passed = normalized.filter(item => item.status === 'PASS').length;
  const failed = normalized.filter(item => item.status === 'FAIL').length;
  const pending = normalized.filter(item => item.status === 'PENDING').length;
  const allPassed = schemaErrors.length === 0 && passed === REQUIRED_SCENARIO_IDS.length;

  const blockers = [
    ...schemaErrors,
    ...normalized
      .filter(item => item.status !== 'PASS')
      .map(item => 'Scenario ' + item.id + ' is ' + item.status)
  ];

  return {
    schemaValid: schemaErrors.length === 0,
    expected: REQUIRED_SCENARIO_IDS.length,
    passed,
    failed,
    pending,
    allPassed,
    blockers,
    scenarios: normalized
  };
}

export function evaluateLaunchGate({ launchPhase, results } = {}) {
  const phase = String(launchPhase || '').trim();
  const fieldTest = evaluateFieldTestResults(results);
  const phaseValid = VALID_PHASES.has(phase);

  const allowed =
    phaseValid &&
    fieldTest.schemaValid &&
    (phase === 'field-test' || fieldTest.allPassed);

  return {
    phase,
    phaseValid,
    allowed,
    promotionReady: fieldTest.allPassed,
    fieldTest,
    blockers: [
      ...(phaseValid ? [] : ['Unknown launch phase: ' + phase]),
      ...(phase === 'field-test' ? [] : fieldTest.blockers)
    ]
  };
}
