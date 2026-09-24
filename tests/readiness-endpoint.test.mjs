import test from 'node:test';
import assert from 'node:assert/strict';

import readinessHandler from '../api/readiness.js';

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

test('readiness endpoint summarizes official field-test state without exposing evidence', async () => {
  const originalFetch = globalThis.fetch;
  const originalOpenAI = process.env.OPENAI_API_KEY;
  const originalCatalog = process.env.AUTOPARTS_API_KEY;
  let fetchCalls = 0;

  try {
    process.env.OPENAI_API_KEY = 'configured';
    process.env.AUTOPARTS_API_KEY = 'configured';
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error('readiness must not perform upstream fetches');
    };

    const res = responseRecorder();
    await readinessHandler({ method:'GET', query:{} }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.service, 'waffer-readiness');
    assert.equal(res.body.launchPhase, 'field-test');

    assert.deepEqual(res.body.fieldTest, {
      expected: 10,
      passed: 0,
      failed: 0,
      pending: 10,
      schemaValid: true,
      allPassed: false,
      updatedAt: null
    });

    assert.equal(res.body.promotion.publicBetaGatePassed, false);
    assert.equal(res.body.promotion.fieldTestPromotionReady, false);
    assert.equal(res.body.promotion.verifiedPricingReady, false);

    assert.equal(res.body.configured.analysis, true);
    assert.equal(res.body.configured.catalog, true);
    assert.equal(res.body.configured.pricing, false);

    assert.ok(res.body.knownBlockers.includes('FIELD_TEST_INCOMPLETE'));
    assert.ok(res.body.knownBlockers.includes('VERIFIED_PRICE_PROVIDER_MISSING'));
    assert.equal(fetchCalls, 0);

    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes('"scenarios"'), false);
    assert.equal(serialized.includes('"evidence"'), false);
    assert.equal(serialized.includes('"notes"'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAI;
    if (originalCatalog === undefined) delete process.env.AUTOPARTS_API_KEY;
    else process.env.AUTOPARTS_API_KEY = originalCatalog;
  }
});

test('readiness reports missing service configuration without making network calls', async () => {
  const originalOpenAI = process.env.OPENAI_API_KEY;
  const originalCatalog = process.env.AUTOPARTS_API_KEY;

  try {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AUTOPARTS_API_KEY;

    const res = responseRecorder();
    await readinessHandler({ method:'GET', query:{} }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.configured.analysis, false);
    assert.equal(res.body.configured.catalog, false);
    assert.ok(res.body.knownBlockers.includes('ANALYSIS_NOT_CONFIGURED'));
    assert.ok(res.body.knownBlockers.includes('CATALOG_NOT_CONFIGURED'));
  } finally {
    if (originalOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAI;
    if (originalCatalog === undefined) delete process.env.AUTOPARTS_API_KEY;
    else process.env.AUTOPARTS_API_KEY = originalCatalog;
  }
});

test('readiness rejects unsupported market without falling back silently', async () => {
  const res = responseRecorder();
  await readinessHandler({ method:'GET', query:{ market:'ZZ' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.status, 'unsupported_market');
  assert.equal(res.body.requestedMarket, 'ZZ');
});

test('readiness allows GET only', async () => {
  const res = responseRecorder();
  await readinessHandler({ method:'POST', query:{} }, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET');
});
