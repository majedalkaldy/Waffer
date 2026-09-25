import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import readinessHandler from '../api/readiness.js';
const officialResults = JSON.parse(fs.readFileSync(new URL('../docs/FIELD_TEST_RESULTS.json', import.meta.url), 'utf8'));

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

test('readiness v2 reports approved field evidence but keeps public beta blocked without leaking evidence', async () => {
  const originalFetch = globalThis.fetch;
  const originalOpenAI = process.env.OPENAI_API_KEY;
  const originalCatalog = process.env.AUTOPARTS_API_KEY;
  let fetchCalls = 0;

  try {
    process.env.OPENAI_API_KEY = 'configured';
    process.env.AUTOPARTS_API_KEY = 'configured';
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error('readiness endpoint must not perform upstream fetches');
    };

    const res = responseRecorder();
    await readinessHandler({ method:'GET', query:{} }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers.Allow, 'GET');
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');

    assert.equal(res.body.ok, true);
    assert.equal(res.body.service, 'waffer-readiness');
    assert.equal(res.body.launchPhase, 'field-test');
    assert.equal(res.body.status, 'not_promotion_ready');

    assert.deepEqual(res.body.fieldTest, {
      expected: 10,
      passed: 10,
      failed: 0,
      pending: 0,
      schemaValid: true,
      evidenceValid: true,
      integrityValid: true,
      allPassed: true,
      updatedAt: officialResults.updatedAt
    });

    assert.equal(res.body.promotion.currentPhaseAllowed, true);
    assert.equal(res.body.promotion.publicBetaGatePassed, true);
    assert.equal(res.body.promotion.fieldTestPromotionReady, true);
    assert.equal(res.body.promotion.verifiedPricingReady, false);
    assert.equal(res.body.promotion.runtimePromotionReady, false);
    assert.equal(res.body.promotion.manualReviewRequired, true);
    assert.equal(res.body.promotion.publicBetaReady, false);
    assert.equal(res.body.promotion.manualBlockerCount, 3);
    assert.equal(res.body.promotion.machineBlockerCount, 1);

    assert.equal(res.body.configured.analysis, true);
    assert.equal(res.body.configured.catalog, true);
    assert.equal(res.body.configured.pricing, false);

    assert.equal(res.body.knownBlockers.includes('FIELD_TEST_INCOMPLETE'), false);
    assert.ok(res.body.knownBlockers.includes('VERIFIED_PRICE_PROVIDER_MISSING'));
    assert.ok(res.body.knownBlockers.includes('MAIN_BRANCH_PROTECTION_REVIEW_REQUIRED'));
    assert.ok(res.body.knownBlockers.includes('WAF_ENFORCEMENT_REVIEW_REQUIRED'));
    assert.ok(res.body.knownBlockers.includes('DEPLOYMENT_PROTECTION_REVIEW_REQUIRED'));
    assert.equal(res.body.knownBlockers.includes('FIELD_TEST_EVIDENCE_INVALID'), false);
    assert.equal(res.body.manualChecks.deploymentProtection, 'NOT_EVALUATED_BY_RUNTIME');
    assert.match(res.body.manualChecks.note,/never authorizes Public Beta/i);
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

test('readiness v2 reports missing service configuration without network calls', async () => {
  const originalFetch = globalThis.fetch;
  const originalOpenAI = process.env.OPENAI_API_KEY;
  const originalCatalog = process.env.AUTOPARTS_API_KEY;
  let fetchCalls = 0;

  try {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AUTOPARTS_API_KEY;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error('must stay cost-free');
    };

    const res = responseRecorder();
    await readinessHandler({ method:'GET', query:{} }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.configured.analysis, false);
    assert.equal(res.body.configured.catalog, false);
    assert.ok(res.body.knownBlockers.includes('ANALYSIS_NOT_CONFIGURED'));
    assert.ok(res.body.knownBlockers.includes('CATALOG_NOT_CONFIGURED'));
    assert.equal(res.body.promotion.publicBetaReady, false);
    assert.equal(res.body.promotion.manualReviewRequired, true);
    assert.equal(res.body.promotion.machineBlockerCount, 3);
    assert.equal(res.body.promotion.manualBlockerCount, 3);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAI;
    if (originalCatalog === undefined) delete process.env.AUTOPARTS_API_KEY;
    else process.env.AUTOPARTS_API_KEY = originalCatalog;
  }
});

test('readiness v2 rejects unsupported market explicitly', async () => {
  const res = responseRecorder();
  await readinessHandler({ method:'GET', query:{ market:'ZZ' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.status, 'unsupported_market');
  assert.equal(res.body.requestedMarket, 'ZZ');
});

test('readiness v2 allows GET only', async () => {
  const res = responseRecorder();
  await readinessHandler({ method:'POST', query:{} }, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET');
});

test('readiness v2 never self-authorizes Public Beta from runtime checks alone', async () => {
  const source = await import('node:fs').then(fs =>
    fs.readFileSync(new URL('../api/readiness.js', import.meta.url), 'utf8')
  );

  assert.ok(source.includes('const manualReviewRequired = true;'));
  assert.ok(source.includes('const publicBetaReady = runtimePromotionReady && !manualReviewRequired;'));
  assert.equal(source.includes('publicBetaReady: runtimePromotionReady'), false);
  assert.ok(source.includes("'DEPLOYMENT_PROTECTION_REVIEW_REQUIRED'"));
});
