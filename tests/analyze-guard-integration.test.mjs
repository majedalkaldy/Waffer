import test from 'node:test';
import assert from 'node:assert/strict';

import analyzeHandler from '../api/analyze.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { resetAnalysisRequestGuardForTests } from '../lib/analysis-abuse-guard.js';

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalVercelCommit = process.env.VERCEL_GIT_COMMIT_SHA;
const originalLimits = {
  analysisRateLimitBurstWindowMs: RUNTIME_CONFIG.analysisRateLimitBurstWindowMs,
  analysisRateLimitBurstMax: RUNTIME_CONFIG.analysisRateLimitBurstMax,
  analysisRateLimitHourlyWindowMs: RUNTIME_CONFIG.analysisRateLimitHourlyWindowMs,
  analysisRateLimitHourlyMax: RUNTIME_CONFIG.analysisRateLimitHourlyMax
};

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

function validRequest(ip = '203.0.113.10', overrides = {}) {
  const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10]);
  return {
    method: 'POST',
    headers: {
      'x-forwarded-for': ip,
      host: 'waffer.example',
      origin: 'https://waffer.example',
      'sec-fetch-site': 'same-origin'
    },
    body: {
      fileData: 'data:image/jpeg;base64,' + jpeg.toString('base64'),
      fileName: 'estimate.jpg',
      mimeType: 'image/jpeg',
      vehicle: {
        market: 'SA',
        locale: 'en-SA',
        currency: 'SAR'
      },
      ...overrides
    }
  };
}

function aiResponse() {
  return {
    total: '100 SAR',
    calculatedTotal: '100 SAR',
    tax: 'not stated',
    laborTotal: 'not stated',
    warranty: 'not stated',
    status: 'needs verification',
    transparency: 80,
    identityConfidence: 50,
    compatibilityConfidence: 40,
    priceConfidence: 10,
    overallConfidence: 55,
    missing: [],
    conflicts: [],
    nextActions: ['Verify part identity'],
    items: [{
      name: 'Brake pad',
      partNumber: 'not visible',
      manufacturer: 'not visible',
      quantity: '1',
      price: '100',
      itemType: 'part',
      identityConfidence: 20,
      compatibility: 'not verifiable',
      priceAssessment: 'needs price source',
      conflict: 'none visible',
      judgment: ''
    }],
    workshopMessage: 'Please provide the missing part number.'
  };
}

test.before(() => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_GIT_COMMIT_SHA = '1234567890abcdef1234567890abcdef12345678';
  RUNTIME_CONFIG.analysisRateLimitBurstWindowMs = 60_000;
  RUNTIME_CONFIG.analysisRateLimitBurstMax = 2;
  RUNTIME_CONFIG.analysisRateLimitHourlyWindowMs = 3_600_000;
  RUNTIME_CONFIG.analysisRateLimitHourlyMax = 10;
});

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
  if (originalVercelCommit === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = originalVercelCommit;
  Object.assign(RUNTIME_CONFIG, originalLimits);
  resetAnalysisRequestGuardForTests();
});

test.beforeEach(() => {
  resetAnalysisRequestGuardForTests();
  globalThis.fetch = originalFetch;
});

test('third valid cost-bearing request is rejected before OpenAI', async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async url => {
    assert.ok(String(url).endsWith('/v1/responses'));
    upstreamCalls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: JSON.stringify(aiResponse()) })
    };
  };

  const first = responseRecorder();
  const second = responseRecorder();
  const third = responseRecorder();

  await analyzeHandler(validRequest(), first);
  await analyzeHandler(validRequest(), second);
  await analyzeHandler(validRequest(), third);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.deepEqual(first.body?.deployment, {
    environment: 'preview',
    commit: '12345678'
  });
  assert.equal(third.statusCode, 429);
  assert.equal(third.body?.code, 'ANALYSIS_CLIENT_RATE_LIMITED');
  assert.ok(Number(third.headers['Retry-After']) >= 1);
  assert.equal(third.headers['X-RateLimit-Burst-Limit'], '2');
  assert.equal(upstreamCalls, 2);
});

test('invalid upload is rejected without consuming the paid-request quota', async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async url => {
    assert.ok(String(url).endsWith('/v1/responses'));
    upstreamCalls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: JSON.stringify(aiResponse()) })
    };
  };

  const invalid = responseRecorder();
  await analyzeHandler({
    ...validRequest(),
    body: {
      ...validRequest().body,
      fileData: 'data:image/jpeg;base64,AAAA'
    }
  }, invalid);
  assert.notEqual(invalid.statusCode, 200);

  const first = responseRecorder();
  const second = responseRecorder();
  const third = responseRecorder();
  await analyzeHandler(validRequest(), first);
  await analyzeHandler(validRequest(), second);
  await analyzeHandler(validRequest(), third);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(third.statusCode, 429);
  assert.equal(upstreamCalls, 2);
});

test('cross-site browser request is blocked before file validation or OpenAI', async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error('OpenAI must not be called');
  };

  const request = validRequest('203.0.113.11');
  request.headers['sec-fetch-site'] = 'cross-site';
  request.headers.origin = 'https://evil.example';

  const res = responseRecorder();
  await analyzeHandler(request, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.code, 'ANALYSIS_CROSS_SITE_BLOCKED');
  assert.equal(upstreamCalls, 0);
});
