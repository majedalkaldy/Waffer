import { RUNTIME_CONFIG } from './runtime-config.js';

const REQUIRED_IDS = Object.freeze([1,2,3,4,5,6,7,8,9,10]);
const VALID_STATUSES = new Set(['PENDING','PASS','FAIL']);
const ANALYSIS_EVIDENCE_SCENARIOS = new Set([1,2,3,5,7,8,9,10]);
const EARLY_REJECTION_SCENARIOS = new Set([4,6]);

function isValidIso(value) {
  if (!value) return false;
  const time = Date.parse(String(value));
  return Number.isFinite(time);
}

function positiveInteger(value) {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) && Number(text) > 0;
}

function validVin(value) {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(String(value ?? '').trim().toUpperCase());
}

function numericAmount(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/[\d,.]+/);
  if (!match) return null;
  const number = Number(match[0].replace(/,/g,''));
  return Number.isFinite(number) ? number : null;
}

function evidenceFor(entry) {
  return entry?.evidence && typeof entry.evidence === 'object' ? entry.evidence : null;
}

function pushUnique(target, message) {
  if (!target.includes(message)) target.push(message);
}

function validateScenarioEvidence(entry, errors, warnings) {
  const id = Number(entry.id);
  const status = String(entry.status || '').toUpperCase();
  const evidence = evidenceFor(entry);
  const notes = String(entry.notes || '').trim();

  if (status === 'PENDING') {
    if (entry.testedAt != null) {
      warnings.push(`Scenario ${id}: PENDING entry has testedAt and will not count as evidence`);
    }
    return;
  }

  if (!isValidIso(entry.testedAt)) {
    errors.push(`Scenario ${id}: ${status} requires a valid testedAt timestamp`);
  }

  if (status === 'FAIL' && !notes) {
    errors.push(`Scenario ${id}: FAIL requires notes describing the failure`);
  }

  if (EARLY_REJECTION_SCENARIOS.has(id)) {
    if (!evidence && !notes) {
      errors.push(`Scenario ${id}: early-rejection result requires evidence or explanatory notes`);
    }
    return;
  }

  if (!ANALYSIS_EVIDENCE_SCENARIOS.has(id)) return;

  if (!evidence) {
    errors.push(`Scenario ${id}: ${status} requires captured runtime evidence`);
    return;
  }

  if (!String(evidence.requestId || '').trim()) {
    errors.push(`Scenario ${id}: runtime evidence requires Analysis ID`);
  }
  if (!String(evidence.engineVersion || '').trim()) {
    errors.push(`Scenario ${id}: runtime evidence requires engineVersion`);
  }
  if (!String(evidence.commit || '').trim()) {
    errors.push(`Scenario ${id}: runtime evidence requires deployment commit`);
  }

  if (status !== 'PASS') return;

  if (id === 1) {
    if (String(evidence?.upload?.mimeType || '') !== 'image/jpeg') {
      errors.push('Scenario 1: PASS requires JPEG upload evidence');
    }
    if (evidence?.acceptance?.hasItems !== true) {
      errors.push('Scenario 1: PASS requires extracted line items');
    }
    if (validVin(evidence?.vehicle?.vin) || positiveInteger(evidence?.vehicle?.vehicleId)) {
      errors.push('Scenario 1: PASS requires no VIN-derived vehicle identity');
    }
  }

  if (id === 2) {
    const originalBytes = Number(evidence?.upload?.originalBytes);
    const uploadBytes = Number(evidence?.upload?.uploadBytes);
    const mimeType = String(evidence?.upload?.mimeType || '');
    if (!mimeType.startsWith('image/')) {
      errors.push('Scenario 2: PASS requires image upload evidence');
    }
    if (evidence?.upload?.optimized !== true) {
      errors.push('Scenario 2: PASS requires optimized = true');
    }
    if (!(Number.isFinite(originalBytes) && originalBytes > Number(RUNTIME_CONFIG.maxUploadBytes))) {
      errors.push('Scenario 2: PASS requires originalBytes above the configured upload limit');
    }
    if (!(Number.isFinite(uploadBytes) && uploadBytes > 0 && uploadBytes <= Number(RUNTIME_CONFIG.maxUploadBytes))) {
      errors.push('Scenario 2: PASS requires uploadBytes within the configured upload limit');
    }
    if (!(Number.isFinite(originalBytes) && Number.isFinite(uploadBytes) && uploadBytes < originalBytes)) {
      errors.push('Scenario 2: PASS requires the optimized image to be smaller than the original');
    }
  }

  if (id === 3) {
    const originalBytes = Number(evidence?.upload?.originalBytes);
    const uploadBytes = Number(evidence?.upload?.uploadBytes);
    if (String(evidence?.upload?.mimeType || '') !== 'application/pdf') {
      errors.push('Scenario 3: PASS requires PDF upload evidence');
    }
    if (evidence?.upload?.optimized === true) {
      errors.push('Scenario 3: PASS must not report image optimization for PDF');
    }
    if (!(Number.isFinite(originalBytes) && originalBytes > 0 && originalBytes <= Number(RUNTIME_CONFIG.maxUploadBytes))) {
      errors.push('Scenario 3: PASS requires originalBytes within the configured PDF upload limit');
    }
    if (!(Number.isFinite(uploadBytes) && uploadBytes > 0 && uploadBytes <= Number(RUNTIME_CONFIG.maxUploadBytes))) {
      errors.push('Scenario 3: PASS requires uploadBytes within the configured PDF upload limit');
    }
  }

  if (id === 5) {
    if (!positiveInteger(evidence?.vehicle?.vehicleId)) {
      errors.push('Scenario 5: PASS requires a live numeric Vehicle ID');
    }
    if (!validVin(evidence?.vehicle?.vin)) {
      errors.push('Scenario 5: PASS requires the tested valid VIN in evidence');
    }
    if (String(evidence?.catalogState?.status || '') !== 'COMPLETED') {
      errors.push('Scenario 5: PASS requires catalogState.status = COMPLETED');
    }
  }

  if (id === 7) {
    const partCount = Number(evidence?.itemSummary?.part);
    const nonPartCount = Number(evidence?.itemSummary?.nonPart);
    const skippedItems = Number(evidence?.catalogState?.skippedItems);
    if (!(Number.isFinite(partCount) && partCount > 0)) {
      errors.push('Scenario 7: PASS requires at least one part item');
    }
    if (!(Number.isFinite(nonPartCount) && nonPartCount > 0)) {
      errors.push('Scenario 7: PASS requires at least one labor/service/fee item');
    }
    if (String(evidence?.catalogState?.status || '') !== 'COMPLETED') {
      errors.push('Scenario 7: PASS requires completed catalog matching evidence');
    }
    if (!(Number.isFinite(skippedItems) && Number.isFinite(nonPartCount) && skippedItems >= nonPartCount)) {
      errors.push('Scenario 7: PASS requires catalog evidence that non-part items were skipped');
    }
  }

  if (id === 8) {
    if (String(evidence?.catalogState?.status || '') !== 'COMPLETED') {
      errors.push('Scenario 8: PASS requires completed catalog matching evidence');
    }
    const axleRequested = Number(evidence?.catalogState?.axleRequested);
    const axleVerified = Number(evidence?.catalogState?.axleVerified);
    if (!(Number.isFinite(axleRequested) && axleRequested > 0)) {
      errors.push('Scenario 8: PASS requires at least one axle-specific catalog request');
    }
    if (!(Number.isFinite(axleVerified) && axleVerified > 0)) {
      errors.push('Scenario 8: PASS requires at least one axle-verified result');
    }
    if (!notes) {
      warnings.push('Scenario 8: add notes describing the verified Front/Rear result');
    }
  }

  if (id === 9) {
    const identified = Number(evidence?.acceptance?.identifiedParts);
    if (!(Number.isFinite(identified) && identified === 0)) {
      errors.push('Scenario 9: PASS requires acceptance.identifiedParts = 0');
    }
  }

  if (id === 10) {
    const printed = numericAmount(evidence?.total);
    const calculated = numericAmount(evidence?.calculatedTotal);
    if (printed === null || calculated === null || Math.abs(printed - calculated) < 0.01) {
      errors.push('Scenario 10: PASS requires evidence of a real printed/calculated total mismatch');
    }
  }
}

export function validateFieldTestDraft(document = {}) {
  const errors = [];
  const warnings = [];

  if (document?.format !== 'waffer-field-test-draft-v1') {
    errors.push('Unsupported or missing field-test draft format');
  }

  const scenarios = Array.isArray(document?.scenarios) ? document.scenarios : [];
  if (scenarios.length !== 10) {
    errors.push(`Draft must contain exactly 10 scenarios; found ${scenarios.length}`);
  }

  const seen = new Set();
  for (const entry of scenarios) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id) || !REQUIRED_IDS.includes(id)) {
      errors.push(`Invalid scenario id: ${entry?.id}`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`Duplicate scenario id: ${id}`);
      continue;
    }
    seen.add(id);

    const status = String(entry?.status || '').toUpperCase();
    if (!VALID_STATUSES.has(status)) {
      errors.push(`Scenario ${id}: invalid status ${status || '(empty)'}`);
      continue;
    }

    validateScenarioEvidence({ ...entry, id, status }, errors, warnings);
  }

  for (const id of REQUIRED_IDS) {
    if (!seen.has(id)) errors.push(`Missing scenario id: ${id}`);
  }

  const passed = scenarios.filter(item => String(item?.status || '').toUpperCase() === 'PASS').length;
  const failed = scenarios.filter(item => String(item?.status || '').toUpperCase() === 'FAIL').length;
  const pending = scenarios.filter(item => String(item?.status || '').toUpperCase() === 'PENDING').length;

  const summary = document?.summary || {};
  if (summary.draftPassed != null && Number(summary.draftPassed) !== passed) {
    pushUnique(warnings, `Summary draftPassed=${summary.draftPassed} does not match scenarios=${passed}`);
  }
  if (summary.draftFailed != null && Number(summary.draftFailed) !== failed) {
    pushUnique(warnings, `Summary draftFailed=${summary.draftFailed} does not match scenarios=${failed}`);
  }
  if (summary.draftPending != null && Number(summary.draftPending) !== pending) {
    pushUnique(warnings, `Summary draftPending=${summary.draftPending} does not match scenarios=${pending}`);
  }

  return {
    valid: errors.length === 0,
    promotionCandidate: errors.length === 0 && passed === 10 && failed === 0 && pending === 0,
    counts: { passed, failed, pending, expected: 10 },
    errors,
    warnings
  };
}

export function validateOfficialFieldTestResults(document = {}) {
  const errors = [];
  const warnings = [];
  const scenarios = Array.isArray(document?.scenarios) ? document.scenarios : [];

  if (scenarios.length !== 10) {
    errors.push(`Official results must contain exactly 10 scenarios; found ${scenarios.length}`);
  }

  const seen = new Set();
  for (const entry of scenarios) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id) || !REQUIRED_IDS.includes(id)) {
      errors.push(`Invalid scenario id: ${entry?.id}`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`Duplicate scenario id: ${id}`);
      continue;
    }
    seen.add(id);

    const status = String(entry?.status || '').toUpperCase();
    if (!VALID_STATUSES.has(status)) {
      errors.push(`Scenario ${id}: invalid status ${status || '(empty)'}`);
      continue;
    }

    validateScenarioEvidence({ ...entry, id, status }, errors, warnings);
  }

  for (const id of REQUIRED_IDS) {
    if (!seen.has(id)) errors.push(`Missing scenario id: ${id}`);
  }

  const passed = scenarios.filter(item => String(item?.status || '').toUpperCase() === 'PASS').length;
  const failed = scenarios.filter(item => String(item?.status || '').toUpperCase() === 'FAIL').length;
  const pending = scenarios.filter(item => String(item?.status || '').toUpperCase() === 'PENDING').length;

  return {
    valid: errors.length === 0,
    promotionCandidate: errors.length === 0 && passed === 10 && failed === 0 && pending === 0,
    counts: { passed, failed, pending, expected: 10 },
    errors,
    warnings
  };
}

export function buildOfficialFieldTestResultsFromDraft(draft, officialTemplate = {}) {
  const validation = validateFieldTestDraft(draft);
  if (!validation.valid) {
    const error = new Error('Field-test draft validation failed');
    error.validation = validation;
    throw error;
  }

  const templateById = new Map(
    (Array.isArray(officialTemplate?.scenarios) ? officialTemplate.scenarios : [])
      .map(item => [Number(item?.id), item])
  );

  return {
    protocol: officialTemplate?.protocol || 'docs/FIELD_TEST.md',
    updatedAt: draft?.exportedAt || new Date().toISOString(),
    scenarios: draft.scenarios
      .slice()
      .sort((a,b) => Number(a.id) - Number(b.id))
      .map(entry => {
        const base = templateById.get(Number(entry.id)) || {};
        return {
          id: Number(entry.id),
          title: String(base.title || entry.title || ('Scenario ' + entry.id)),
          status: String(entry.status).toUpperCase(),
          testedAt: entry.testedAt || null,
          evidence: entry.evidence || null,
          notes: String(entry.notes || '')
        };
      })
  };
}
