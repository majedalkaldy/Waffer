import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analysisClientKey,
  checkAnalysisRequestLimit,
  checkAnalysisRequestProvenance,
  extractClientIp,
  resetAnalysisRequestGuardForTests
} from '../lib/analysis-abuse-guard.js';

const config = {
  analysisRateLimitBurstWindowMs: 60_000,
  analysisRateLimitBurstMax: 4,
  analysisRateLimitHourlyWindowMs: 3_600_000,
  analysisRateLimitHourlyMax: 20,
  analysisRateLimitMaxEntries: 5000
};

function req(ip = '203.0.113.9', extraHeaders = {}) {
  return {
    headers: {
      'x-forwarded-for': ip,
      host: 'waffer.example',
      origin: 'https://waffer.example',
      'sec-fetch-site': 'same-origin',
      ...extraHeaders
    }
  };
}

test.beforeEach(() => resetAnalysisRequestGuardForTests());

test('extracts Vercel x-forwarded-for first address and stores only a hash key', () => {
  const request = req('203.0.113.9, 10.0.0.1');
  assert.equal(extractClientIp(request), '203.0.113.9');
  const key = analysisClientKey(request);
  assert.equal(key.length, 32);
  assert.equal(key.includes('203.0.113.9'), false);
});

test('allows four cost-bearing analyses per minute and blocks the fifth', () => {
  const request = req();
  for (let i = 0; i < 4; i++) {
    const result = checkAnalysisRequestLimit(request, config, 1_000);
    assert.equal(result.allowed, true, 'request ' + (i + 1));
  }

  const blocked = checkAnalysisRequestLimit(request, config, 1_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'BURST');
  assert.equal(blocked.retryAfterSeconds, 60);
  assert.equal(blocked.burstRemaining, 0);

  const afterReset = checkAnalysisRequestLimit(request, config, 61_001);
  assert.equal(afterReset.allowed, true);
});

test('hourly ceiling blocks repeated requests even when burst window resets', () => {
  const custom = {
    ...config,
    analysisRateLimitBurstMax: 100,
    analysisRateLimitHourlyMax: 3
  };
  const request = req();

  assert.equal(checkAnalysisRequestLimit(request, custom, 0).allowed, true);
  assert.equal(checkAnalysisRequestLimit(request, custom, 60_001).allowed, true);
  assert.equal(checkAnalysisRequestLimit(request, custom, 120_002).allowed, true);

  const blocked = checkAnalysisRequestLimit(request, custom, 180_003);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'HOURLY');
  assert.ok(blocked.retryAfterSeconds > 0);
});

test('different client IPs have independent buckets', () => {
  const first = req('203.0.113.1');
  const second = req('203.0.113.2');

  for (let i = 0; i < 4; i++) checkAnalysisRequestLimit(first, config, 1000);
  assert.equal(checkAnalysisRequestLimit(first, config, 1000).allowed, false);
  assert.equal(checkAnalysisRequestLimit(second, config, 1000).allowed, true);
});

test('missing client IP is allowed without creating one shared global bucket', () => {
  const request = { headers: {} };
  for (let i = 0; i < 50; i++) {
    const result = checkAnalysisRequestLimit(request, config, 1000);
    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'NO_CLIENT_IP');
  }
});

test('same-origin browser requests are allowed while cross-site and mismatched origins are rejected', () => {
  assert.equal(checkAnalysisRequestProvenance(req()).allowed, true);

  const crossSite = checkAnalysisRequestProvenance(req('203.0.113.9', {
    'sec-fetch-site': 'cross-site'
  }));
  assert.equal(crossSite.allowed, false);
  assert.equal(crossSite.code, 'ANALYSIS_CROSS_SITE_BLOCKED');

  const mismatch = checkAnalysisRequestProvenance(req('203.0.113.9', {
    origin: 'https://evil.example'
  }));
  assert.equal(mismatch.allowed, false);
  assert.equal(mismatch.code, 'ANALYSIS_ORIGIN_MISMATCH');
});
