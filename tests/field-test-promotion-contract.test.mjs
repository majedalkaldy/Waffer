import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { redactFieldTestCandidate } from '../scripts/redact-field-test-candidate.mjs';

import {
  createFieldTestEvidence,
  buildFieldTestExport
} from '../lib/field-test-client.js';
import {
  validateFieldTestDraft,
  buildOfficialFieldTestResultsFromDraft,
  validateOfficialFieldTestResults
} from '../lib/field-test-evidence-validator.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';

const NOW = '2026-09-25T13:30:00.000Z';
const COMMIT = 'abcdef12';
const VIN = '1HGCM82633A004352';

function analysis(overrides = {}) {
  return {
    requestId: 'analysis-contract',
    completedAt: NOW,
    engineVersion: RUNTIME_CONFIG.engineVersion,
    deployment: {
      environment: 'production',
      commit: COMMIT
    },
    acceptance: {
      schemaValid: true,
      hasItems: true,
      identifiedParts: 1
    },
    total: '1000 SAR',
    calculatedTotal: '1000 SAR',
    items: [{
      name: 'Brake pad',
      partNumber: 'BRK-123',
      itemType: 'part',
      price: '1000'
    }],
    ...overrides
  };
}

function passEntry(input) {
  return createFieldTestEvidence({
    status: 'PASS',
    now: () => NOW,
    ...input
  });
}

test('field-test client and validator share a satisfiable 10/10 promotion contract', () => {
  const maxBytes = Number(RUNTIME_CONFIG.maxUploadBytes);

  const scenarios = [
    passEntry({
      scenarioId: 1,
      analysis: analysis({ requestId: 'analysis-1' }),
      vehicle: {},
      upload: {
        mimeType: 'image/jpeg',
        optimized: false,
        originalBytes: 900_000,
        uploadBytes: 900_000
      }
    }),
    passEntry({
      scenarioId: 2,
      analysis: analysis({ requestId: 'analysis-2' }),
      upload: {
        mimeType: 'image/jpeg',
        optimized: true,
        originalBytes: maxBytes + 500_000,
        uploadBytes: maxBytes - 100_000
      }
    }),
    passEntry({
      scenarioId: 3,
      analysis: analysis({ requestId: 'analysis-3' }),
      upload: {
        mimeType: 'application/pdf',
        optimized: false,
        originalBytes: 1_000_000,
        uploadBytes: 1_000_000
      }
    }),
    passEntry({
      scenarioId: 4,
      notes: 'Oversized PDF was rejected before paid analysis with FILE_TOO_LARGE.'
    }),
    passEntry({
      scenarioId: 5,
      analysis: analysis({
        requestId: 'analysis-5',
        acceptance: { schemaValid: true, hasItems: true, identifiedParts: 1, hasVin: true }
      }),
      vehicle: {
        vehicleId: 9445,
        vin: VIN,
        manufacturerName: 'Honda',
        modelName: 'Accord'
      },
      catalogState: {
        status: 'COMPLETED',
        matched: 1
      }
    }),
    passEntry({
      scenarioId: 6,
      notes: 'Invalid VIN was rejected before the VIN provider lookup.'
    }),
    passEntry({
      scenarioId: 7,
      analysis: analysis({
        requestId: 'analysis-7',
        items: [
          { name: 'Brake pad', partNumber: 'BRK-123', itemType: 'part', price: '600' },
          { name: 'Labor', partNumber: 'not visible', itemType: 'labor', price: '400' }
        ]
      }),
      vehicle: { vehicleId: 9445, vin: VIN },
      catalogState: {
        status: 'COMPLETED',
        matched: 1,
        skippedItems: 1
      }
    }),
    passEntry({
      scenarioId: 8,
      notes: 'Reviewed front brake result and confirmed a front axle-specific match.',
      analysis: analysis({ requestId: 'analysis-8' }),
      vehicle: { vehicleId: 9445, vin: VIN },
      catalogState: {
        status: 'COMPLETED',
        matched: 1,
        axleRequested: 1,
        axleVerified: 1
      }
    }),
    passEntry({
      scenarioId: 9,
      analysis: analysis({
        requestId: 'analysis-9',
        acceptance: {
          schemaValid: true,
          hasItems: true,
          identifiedParts: 0
        },
        items: [{
          name: 'Brake pad',
          partNumber: 'not visible',
          itemType: 'part',
          price: '500'
        }]
      })
    }),
    passEntry({
      scenarioId: 10,
      analysis: analysis({
        requestId: 'analysis-10',
        total: '1150 SAR',
        calculatedTotal: '1000 SAR'
      })
    })
  ];

  for (const entry of scenarios.filter(entry => ![4, 6].includes(entry.id))) {
    assert.equal(entry.evidence?.commit, COMMIT, 'scenario ' + entry.id + ' should inherit deployment commit');
    assert.equal(entry.evidence?.engineVersion, RUNTIME_CONFIG.engineVersion);
    assert.ok(entry.evidence?.requestId);
  }

  const exported = buildFieldTestExport({
    draft: { version: 1, scenarios },
    exportedAt: NOW
  });

  const validation = validateFieldTestDraft(exported);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  assert.equal(validation.promotionCandidate, true);
  assert.deepEqual(validation.counts, {
    passed: 10,
    failed: 0,
    pending: 0,
    expected: 10
  });

  const official = buildOfficialFieldTestResultsFromDraft(exported, {
    protocol: 'docs/FIELD_TEST.md',
    scenarios: Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      title: 'Scenario ' + (index + 1)
    }))
  });

  const officialValidation = validateOfficialFieldTestResults(official);
  assert.equal(officialValidation.valid, true, officialValidation.errors.join('\n'));
  assert.equal(officialValidation.promotionCandidate, true);
  assert.equal(official.scenarios.every(entry => entry.status === 'PASS'), true);

  const publicCandidate = redactFieldTestCandidate(official);
  assert.equal(validateOfficialFieldTestResults(publicCandidate).promotionCandidate, true);
  assert.equal(JSON.stringify(publicCandidate).includes(VIN), false);
  const publicVehicle = publicCandidate.scenarios.find(entry => entry.id === 5).evidence.vehicle;
  assert.equal(publicVehicle.vinSha256, createHash('sha256').update(VIN).digest('hex'));
  assert.equal(official.scenarios.find(entry => entry.id === 5).evidence.vehicle.vin, VIN);
  assert.equal(validateFieldTestDraft({ ...exported, scenarios: publicCandidate.scenarios }).valid, false);
  for (const invalidProof of [
    { vinSha256: 'invalid' },
    { vinRedacted: false },
    { vinSha256: null }
  ]) {
    const invalid = structuredClone(publicCandidate);
    Object.assign(invalid.scenarios.find(entry => entry.id === 5).evidence.vehicle, invalidProof);
    assert.equal(validateOfficialFieldTestResults(invalid).valid, false);
  }
  const noVinAcceptance = structuredClone(publicCandidate);
  noVinAcceptance.scenarios.find(entry => entry.id === 5).evidence.acceptance.hasVin = false;
  assert.equal(validateOfficialFieldTestResults(noVinAcceptance).valid, false);
});
