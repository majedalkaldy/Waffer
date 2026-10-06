import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDiagnosticReport,
  sanitizeFieldTestDraft,
  sanitizeFieldTestPreflight
} from '../lib/diagnostic-privacy.js';
import { createFieldTestEvidence, updateFieldTestDraft, buildFieldTestExport } from '../lib/field-test-client.js';
import { validateFieldTestScenarioEvidence, validateFieldTestDraft } from '../lib/field-test-evidence-validator.js';

const NOW = '2026-10-06T12:00:00.000Z';
const REQUEST_ID = '11111111-2222-4333-8444-555555555555';
const VIN = '1HGCM82633A004352';
const PRIVATE = 'Private customer, seller, invoice and note text';
const URL = 'https://example.invalid/private-seller?customer=1';

function sensitiveRuntime() {
  return {
    analysis: {
      requestId: REQUEST_ID, completedAt: NOW, engineVersion: 'mvp-2026-09',
      deployment: { commit: 'abcdef12', private: PRIVATE },
      engineContext: { market: 'US', locale: 'en-US', currency: 'USD', raw: PRIVATE },
      acceptance: {
        schemaValid: true, hasItems: true, hasVin: true, identifiedParts: 1,
        itemCount: 2, missingShapeFields: [PRIVATE], invalidItemIndexes: [PRIVATE], raw: PRIVATE
      },
      items: [{ itemType: 'part', name: PRIVATE, price: PRIVATE, vin: VIN }, { itemType: 'labor', name: PRIVATE }],
      missing: [PRIVATE], conflicts: [PRIVATE], total: '100.50 USD', calculatedTotal: '80.50 USD',
      transparency: 80, identityConfidence: 75, compatibilityConfidence: 50, priceConfidence: 0, overallConfidence: 60,
      raw: PRIVATE, vin: VIN
    },
    vehicle: { vehicleId: '9445', vin: VIN, manufacturerName: PRIVATE, modelName: PRIVATE, vehicleDescription: PRIVATE },
    catalogState: {
      status: 'COMPLETED', matched: 1, totalItems: 2, skippedItems: 1, axleRequested: 1, axleVerified: 1,
      runId: PRIVATE, error: PRIVATE, code: PRIVATE, results: [{ seller: PRIVATE }]
    },
    upload: {
      mimeType: 'image/jpeg', optimized: false, originalBytes: 5000, uploadBytes: 5000,
      filename: PRIVATE, url: URL, base64: PRIVATE
    },
    pricingSummary: { checkedItems: 2, verifiedOfferCount: 1, currency: 'USD', verifiedSaving: 350.99, private: PRIVATE },
    pricingResults: [{ seller: PRIVATE, listing: { url: URL, vin: VIN } }],
    pricingCapability: false, exportedAt: NOW
  };
}

function assertNoPrivateText(value) {
  const serialized = JSON.stringify(value);
  for (const secret of [VIN, PRIVATE, URL]) assert.equal(serialized.includes(secret), false, secret);
}

test('diagnostic export allowlists aggregate metadata and omits raw totals, vehicle text and provider records', () => {
  const runtime = sensitiveRuntime();
  const before = structuredClone(runtime);
  const report = buildDiagnosticReport(runtime);
  assertNoPrivateText(report);
  assert.deepEqual(runtime, before, 'diagnostics must not mutate runtime data');
  assert.equal(report.requestId, REQUEST_ID);
  assert.equal(report.commit, 'abcdef12');
  assert.deepEqual(report.vehicle, { vehicleId: 9445, vinPresent: true, vinValid: true });
  assert.equal(report.pricingResults, undefined);
  assert.equal(report.pricingSummary.verifiedSaving, undefined);
  assert.equal(report.pricingSummary.checkedItems, 2);
  assert.equal(report.analysisSummary.total, undefined);
  assert.equal(report.analysisSummary.calculatedTotal, undefined);
  assert.equal(report.analysisSummary.totalsMatch, false);
  assert.equal(report.analysisSummary.itemCount, 2);
  assert.equal(report.acceptance.missingShapeFieldCount, 1);
  assert.equal(report.acceptance.invalidItemCount, 1);
});

test('field capture keeps numeric mismatch evidence while discarding raw text and VIN', () => {
  const runtime = sensitiveRuntime();
  const entry = createFieldTestEvidence({ ...runtime, scenarioId: 10, status: 'PASS', notes: PRIVATE, now: () => NOW });
  assertNoPrivateText(entry);
  assert.equal(entry.notes, '');
  assert.equal(entry.notesPresent, true);
  assert.equal(entry.evidence.total, 100.5);
  assert.equal(entry.evidence.calculatedTotal, 80.5);
  assert.deepEqual(entry.evidence.itemSummary, { total: 2, part: 1, labor: 1, service: 0, fee: 0, nonPart: 1 });
  assert.equal(validateFieldTestScenarioEvidence(entry).valid, true);
  assert.ok(validateFieldTestScenarioEvidence(entry).warnings.some(message => message.includes('separately reviewed')));
});

test('sanitizers reject user strings substituted into allowed metadata keys', () => {
  const runtime = sensitiveRuntime();
  Object.assign(runtime.analysis, { requestId: VIN, engineVersion: PRIVATE, completedAt: PRIVATE, total: `123 ${PRIVATE}`, calculatedTotal: VIN, transparency: PRIVATE });
  runtime.analysis.deployment.commit = PRIVATE;
  runtime.analysis.engineContext = { market: PRIVATE, locale: PRIVATE, currency: PRIVATE };
  runtime.catalogState = { status: PRIVATE, matched: PRIVATE };
  runtime.upload = { mimeType: PRIVATE, uploadBytes: PRIVATE, optimized: PRIVATE };
  runtime.pricingSummary = { checkedItems: PRIVATE, currency: PRIVATE };
  runtime.vehicle.vehicleId = VIN;
  runtime.exportedAt = PRIVATE;
  const report = buildDiagnosticReport(runtime);
  assertNoPrivateText(report);
  assert.equal(report.requestId, null);
  assert.equal(report.engineVersion, null);
  assert.equal(report.completedAt, null);
  assert.equal(report.commit, null);
  assert.equal(report.exportedAt, null);
  assert.equal(report.analysisSummary.transparency, null);
  assert.equal(report.analysisSummary.totalsComparable, false);
  assert.equal(report.vehicle.vehicleId, null);
  assert.deepEqual(report.catalogState, { status: null });
  assert.deepEqual(report.upload, { mimeType: null });
});

test('new snapshots contain no arbitrary numeric strings, non-finite values, or object-valued counts', () => {
  const runtime = sensitiveRuntime();
  runtime.analysis.total = '12345678901234567';
  runtime.analysis.calculatedTotal = { value: 500, private: PRIVATE };
  runtime.analysis.overallConfidence = Infinity;
  runtime.analysis.acceptance.identifiedParts = { private: PRIVATE };
  runtime.pricingSummary.checkedItems = NaN;
  const field = createFieldTestEvidence({ ...runtime, scenarioId: 10, status: 'PASS', now: () => NOW });
  assertNoPrivateText(field);
  assert.equal(field.evidence.total, null);
  assert.equal(field.evidence.calculatedTotal, null);
  assert.equal(field.evidence.acceptance.identifiedParts, undefined);
  assert.equal(field.evidence.pricingSummary.checkedItems, undefined);
  assert.equal(validateFieldTestScenarioEvidence(field).valid, false);
});

test('zero totals stay numeric and cannot be confused with missing evidence', () => {
  const runtime = sensitiveRuntime();
  runtime.analysis.total = 0;
  runtime.analysis.calculatedTotal = '0 USD';
  const report = buildDiagnosticReport(runtime);
  assert.equal(report.analysisSummary.totalsComparable, true);
  assert.equal(report.analysisSummary.totalsMatch, true);
  const entry = createFieldTestEvidence({ ...runtime, scenarioId: 10, status: 'PASS', now: () => NOW });
  assert.equal(entry.evidence.total, 0);
  assert.equal(entry.evidence.calculatedTotal, 0);
  assert.equal(validateFieldTestScenarioEvidence(entry).valid, false);
});

test('legacy draft updates sanitize every copied entry without mutating historical input', () => {
  const runtime = sensitiveRuntime();
  const legacy = {
    version: 1, updatedAt: NOW, extra: PRIVATE,
    scenarios: [{
      id: 5, status: 'PASS', testedAt: NOW, notes: PRIVATE, extra: PRIVATE,
      evidence: { ...runtime.analysis, ...runtime, vehicle: runtime.vehicle, commit: 'abcdef12' }
    }]
  };
  const before = structuredClone(legacy);
  const sanitized = sanitizeFieldTestDraft(legacy);
  const updated = updateFieldTestDraft(legacy, { scenarioId: 2, status: 'PENDING', notes: PRIVATE });
  assertNoPrivateText(sanitized);
  assertNoPrivateText(updated);
  assert.deepEqual(legacy, before);
  assert.equal(updated.scenarios.length, 2);
  assert.equal(updated.scenarios[1].evidence.vehicle.vinValid, true);
  assert.deepEqual(sanitizeFieldTestDraft(sanitized), sanitized, 'repeated sanitization is stable');
});

test('export sanitizes legacy official and local evidence, preflight, titles and automation context', () => {
  const runtime = sensitiveRuntime();
  const official = { scenarios: [{ id: 5, title: PRIVATE, status: 'PASS', testedAt: NOW, notes: PRIVATE, evidence: { ...runtime.analysis, ...runtime } }] };
  const automation = { scenarios: [{ id: 5, coverage: 'PARTIAL', evidence: [PRIVATE, URL], notes: PRIVATE }] };
  const preflight = {
    format: PRIVATE, ranAt: NOW, status: 'PASS', raw: PRIVATE,
    checks: [{ id: 'canvas-jpeg', ok: true, severity: 'critical', details: PRIVATE }, { id: PRIVATE, details: PRIVATE }],
    deployment: { environment: 'production', commit: 'abcdef12', engineVersion: 'mvp-2026-09', raw: PRIVATE },
    readiness: { configuredAnalysis: true, fieldTestPassed: 10, raw: PRIVATE }
  };
  const input = { official, automation, preflight, exportedAt: NOW };
  const before = structuredClone(input);
  const exported = buildFieldTestExport(input);
  assertNoPrivateText(exported);
  assert.deepEqual(input, before);
  assert.equal(exported.scenarios[4].title, 'Scenario 5');
  assert.deepEqual(exported.scenarios[4].automation, { coverage: 'PARTIAL', evidenceCount: 2 });
  assert.deepEqual(exported.preflight.checks, [{ id: 'canvas-jpeg', ok: true, severity: 'critical', details: '' }]);
  assert.equal(validateFieldTestDraft(exported).promotionCandidate, false);
  assert.deepEqual(sanitizeFieldTestPreflight(exported.preflight), exported.preflight);
});

test('minimized VIN flags never satisfy the raw reviewed VIN requirement or no-VIN scenario', () => {
  const runtime = sensitiveRuntime();
  runtime.vehicle.vehicleId = null;
  const noVin = createFieldTestEvidence({ ...runtime, scenarioId: 1, status: 'PASS', now: () => NOW });
  assert.equal(validateFieldTestScenarioEvidence(noVin).valid, false);
  runtime.vehicle.vehicleId = 9445;
  const vinCase = createFieldTestEvidence({ ...runtime, scenarioId: 5, status: 'PASS', now: () => NOW });
  assert.equal(validateFieldTestScenarioEvidence(vinCase).valid, false);
  assert.ok(validateFieldTestScenarioEvidence(vinCase).errors.some(message => message.includes('valid VIN')));
});

test('note-presence flag does not fabricate reviewed explanatory evidence', () => {
  for (const scenarioId of [4, 6]) {
    const entry = createFieldTestEvidence({ scenarioId, status: 'PASS', notes: PRIVATE, now: () => NOW });
    assert.equal(entry.notesPresent, true);
    assert.equal(validateFieldTestScenarioEvidence(entry).valid, false);
  }
  const entry = createFieldTestEvidence({ ...sensitiveRuntime(), scenarioId: 10, status: 'FAIL', notes: PRIVATE, now: () => NOW });
  assert.equal(validateFieldTestScenarioEvidence(entry).valid, false);
});

test('valid server correlation fallback survives while unknown identifiers are omitted', () => {
  const runtime = sensitiveRuntime();
  runtime.analysis.requestId = 'waffer-m0abcd12-abc123';
  assert.equal(buildDiagnosticReport(runtime).requestId, runtime.analysis.requestId);
  for (const value of ['customer-private-note', 'https://example.invalid/?vin=' + VIN, 'x'.repeat(5000)]) {
    runtime.analysis.requestId = value;
    assert.equal(buildDiagnosticReport(runtime).requestId, null);
  }
});


test('numeric amounts are retained only for the total-mismatch field scenario', () => {
  for (let scenarioId = 1; scenarioId <= 10; scenarioId += 1) {
    const entry = createFieldTestEvidence({ ...sensitiveRuntime(), scenarioId, status: 'PENDING', now: () => NOW });
    assert.equal(entry.evidence.total, scenarioId === 10 ? 100.5 : undefined);
    assert.equal(entry.evidence.calculatedTotal, scenarioId === 10 ? 80.5 : undefined);
  }
});
