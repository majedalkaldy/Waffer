import test from 'node:test';
import assert from 'node:assert/strict';

import analyzeHandler from '../api/analyze.js';
import vinHandler from '../api/vin.js';
import { normalizeAnalysisResult } from '../lib/analysis-normalizer.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { compareDisplayedTotals } from '../lib/total-check.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return value; }
  };
}

function completeAiResult(overrides = {}) {
  return {
    total: '1000 SAR',
    calculatedTotal: '1000 SAR',
    tax: 'غير مذكورة',
    laborTotal: 'غير مذكور',
    warranty: 'غير مذكور',
    status: 'ok',
    transparency: 80,
    identityConfidence: 80,
    compatibilityConfidence: 90,
    priceConfidence: 50,
    overallConfidence: 75,
    missing: [],
    conflicts: [],
    nextActions: [],
    items: [
      {
        name: 'Brake pad',
        partNumber: 'BRK-123',
        itemType: 'part',
        identityConfidence: 80,
        price: '1000'
      }
    ],
    workshopMessage: '',
    ...overrides
  };
}

test('synthetic scenario 1: JPEG analysis without VIN succeeds and caps compatibility confidence', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;

  try {
    process.env.OPENAI_API_KEY = 'test-key';
    globalThis.fetch = async url => {
      assert.ok(String(url).endsWith('/v1/responses'));
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: JSON.stringify(completeAiResult()) })
      };
    };

    const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10]);
    const res = responseRecorder();

    await analyzeHandler({
      method: 'POST',
      body: {
        fileData: 'data:image/jpeg;base64,' + jpeg.toString('base64'),
        fileName: 'estimate.jpg',
        mimeType: 'image/jpeg',
        vehicle: { market: 'SA', locale: 'ar-SA' }
      }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.acceptance?.hasVin, false);
    assert.ok(res.body?.compatibilityConfidence <= 45);
    assert.equal(res.body?.acceptance?.hasItems, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test('synthetic scenario 4: oversized PDF is rejected before any upstream call', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let fetchCalled = false;

  try {
    process.env.OPENAI_API_KEY = 'test-key';
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('Upstream fetch must not be called for oversized upload');
    };

    const oversized = Buffer.alloc(RUNTIME_CONFIG.maxUploadBytes + 1, 1);
    Buffer.from('%PDF-').copy(oversized, 0);
    const res = responseRecorder();

    await analyzeHandler({
      method: 'POST',
      body: {
        fileData: 'data:application/pdf;base64,' + oversized.toString('base64'),
        fileName: 'oversized.pdf',
        mimeType: 'application/pdf',
        vehicle: { market: 'SA', locale: 'ar-SA' }
      }
    }, res);

    assert.equal(res.statusCode, 413);
    assert.equal(res.body?.code, 'FILE_TOO_LARGE');
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test('synthetic scenario 6: invalid VIN is rejected before catalog lookup', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.AUTOPARTS_API_KEY;
  let fetchCalled = false;

  try {
    process.env.AUTOPARTS_API_KEY = 'test-key';
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('VIN upstream must not be called for invalid VIN');
    };

    const res = responseRecorder();
    await vinHandler({
      method: 'GET',
      query: { vin: 'INVALIDVIN' }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AUTOPARTS_API_KEY;
    else process.env.AUTOPARTS_API_KEY = originalKey;
  }
});

test('synthetic scenario 9: missing part numbers cap identity and price confidence', () => {
  const normalized = normalizeAnalysisResult({
    result: completeAiResult({
      identityConfidence: 99,
      priceConfidence: 99,
      items: [
        {
          name: 'Brake pad',
          partNumber: 'غير ظاهر',
          itemType: 'part',
          identityConfidence: 99,
          price: '500'
        }
      ]
    }),
    safeVehicle: { vin: '1HGCM82633A004352' },
    market: 'SA',
    locale: 'ar-SA',
    currency: 'SAR',
    engineVersion: 'mvp-2026-09',
    requestId: 'synthetic-9',
    completedAt: '2026-09-23T00:00:00.000Z'
  });

  assert.equal(normalized.acceptance.identifiedParts, 0);
  assert.ok(normalized.identityConfidence <= 40);
  assert.ok(normalized.priceConfidence <= 15);
});

test('synthetic scenario 10: printed-total mismatch is detected deterministically', () => {
  const mismatch = compareDisplayedTotals('1,150 SAR', '1,000 SAR');
  assert.equal(mismatch.comparable, true);
  assert.equal(mismatch.matches, false);
  assert.equal(mismatch.difference, 150);

  const match = compareDisplayedTotals('1,150 SAR', '1150 SAR');
  assert.equal(match.comparable, true);
  assert.equal(match.matches, true);

  const unclear = compareDisplayedTotals('غير واضح', '1150 SAR');
  assert.equal(unclear.comparable, false);
  assert.equal(unclear.difference, null);
});
