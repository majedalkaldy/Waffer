import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAnalysisResult } from '../lib/analysis-normalizer.js';

function baseResult(overrides = {}) {
  return {
    total: '100 SAR',
    status: 'ok',
    transparency: 80,
    identityConfidence: 90,
    compatibilityConfidence: 80,
    priceConfidence: 70,
    overallConfidence: 75,
    missing: [],
    conflicts: [],
    nextActions: [],
    items: [
      {
        name: 'Brake pad',
        itemType: 'part',
        identityConfidence: 90,
        price: '100'
      }
    ],
    ...overrides
  };
}

function normalize(locale) {
  return normalizeAnalysisResult({
    result: baseResult(),
    safeVehicle: { vin: '1HGCM82633A004352' },
    market: 'SA',
    locale,
    currency: 'SAR',
    engineVersion: 'mvp-2026-09',
    requestId: 'locale-test',
    completedAt: '2026-09-23T00:00:00.000Z'
  });
}

test('English normalization uses English fallback values', () => {
  const result = normalize('en-SA');

  assert.equal(result.items[0].partNumber, 'not visible');
  assert.equal(result.items[0].manufacturer, 'not visible');
  assert.equal(result.items[0].quantity, 'not visible');
  assert.equal(result.tax, 'not stated');
  assert.equal(result.laborTotal, 'not stated');
  assert.equal(result.warranty, 'not stated');
  assert.equal(result.acceptance.identifiedParts, 0);
  assert.ok(result.identityConfidence <= 40);
  assert.ok(result.priceConfidence <= 15);
});

test('Arabic normalization keeps Arabic fallback values', () => {
  const result = normalize('ar-SA');

  assert.equal(result.items[0].partNumber, 'غير ظاهر');
  assert.equal(result.items[0].manufacturer, 'غير ظاهر');
  assert.equal(result.items[0].quantity, 'غير ظاهرة');
  assert.equal(result.tax, 'غير مذكورة');
  assert.equal(result.laborTotal, 'غير مذكور');
  assert.equal(result.warranty, 'غير مذكور');
  assert.equal(result.acceptance.identifiedParts, 0);
});

test('explicit values are preserved regardless of locale', () => {
  const result = normalizeAnalysisResult({
    result: baseResult({
      tax: '15 SAR',
      laborTotal: '40 SAR',
      warranty: '12 months',
      items: [{
        name: 'Brake pad',
        partNumber: 'BRK-123',
        manufacturer: 'Brand A',
        quantity: '2',
        itemType: 'part',
        identityConfidence: 90,
        price: '100'
      }]
    }),
    safeVehicle: { vin: '1HGCM82633A004352' },
    market: 'SA',
    locale: 'en-SA',
    currency: 'SAR',
    engineVersion: 'mvp-2026-09',
    requestId: 'locale-explicit',
    completedAt: '2026-09-23T00:00:00.000Z'
  });

  assert.equal(result.items[0].partNumber, 'BRK-123');
  assert.equal(result.items[0].manufacturer, 'Brand A');
  assert.equal(result.items[0].quantity, '2');
  assert.equal(result.tax, '15 SAR');
  assert.equal(result.laborTotal, '40 SAR');
  assert.equal(result.warranty, '12 months');
  assert.equal(result.acceptance.identifiedParts, 1);
});
