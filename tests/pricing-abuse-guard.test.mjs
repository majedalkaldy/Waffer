import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pricingClientKey,
  checkPricingRequestLimit,
  checkPricingRequestProvenance,
  resetPricingRequestGuardForTests
} from '../lib/pricing-abuse-guard.js';

function req(ip='203.0.113.10', extraHeaders={}) {
  return {
    headers: {
      'x-forwarded-for': ip,
      ...extraHeaders
    }
  };
}

const config={
  priceRateLimitBurstWindowMs:60_000,
  priceRateLimitBurstMax:2,
  priceRateLimitHourlyWindowMs:3_600_000,
  priceRateLimitHourlyMax:3,
  priceRateLimitMaxEntries:100
};

test.beforeEach(()=>resetPricingRequestGuardForTests());

test('pricing client key is hashed and never exposes the raw IP',()=>{
  const key=pricingClientKey(req('198.51.100.4'));
  assert.equal(key.length,32);
  assert.equal(key.includes('198.51.100.4'),false);
});

test('pricing burst limit blocks only after the configured allowance',()=>{
  const now=1_000;
  assert.equal(checkPricingRequestLimit(req(),config,now).allowed,true);
  assert.equal(checkPricingRequestLimit(req(),config,now+1).allowed,true);
  const third=checkPricingRequestLimit(req(),config,now+2);
  assert.equal(third.allowed,false);
  assert.equal(third.reason,'BURST');
  assert.ok(third.retryAfterSeconds>0);
});

test('pricing burst window resets after expiry',()=>{
  const now=5_000;
  checkPricingRequestLimit(req(),config,now);
  checkPricingRequestLimit(req(),config,now+1);
  const reset=checkPricingRequestLimit(req(),config,now+60_001);
  assert.equal(reset.allowed,true);
});

test('pricing hourly ceiling remains independent of burst reset',()=>{
  const now=10_000;
  checkPricingRequestLimit(req(),config,now);
  checkPricingRequestLimit(req(),config,now+60_001);
  checkPricingRequestLimit(req(),config,now+120_002);
  const fourth=checkPricingRequestLimit(req(),config,now+180_003);
  assert.equal(fourth.allowed,false);
  assert.equal(fourth.reason,'HOURLY');
});

test('pricing buckets are independent per client IP',()=>{
  const now=20_000;
  checkPricingRequestLimit(req('203.0.113.1'),config,now);
  checkPricingRequestLimit(req('203.0.113.1'),config,now+1);
  assert.equal(checkPricingRequestLimit(req('203.0.113.1'),config,now+2).allowed,false);
  assert.equal(checkPricingRequestLimit(req('203.0.113.2'),config,now+3).allowed,true);
});

test('missing client IP is allowed without a global shared bucket',()=>{
  const result=checkPricingRequestLimit({headers:{}},config,30_000);
  assert.equal(result.allowed,true);
  assert.equal(result.reason,'NO_CLIENT_IP');
  assert.equal(result.key,null);
});

test('same-origin pricing requests pass while cross-site or mismatched origin is blocked',()=>{
  assert.equal(checkPricingRequestProvenance({
    headers:{
      'sec-fetch-site':'same-origin',
      origin:'https://waffer.example',
      host:'waffer.example'
    }
  }).allowed,true);

  assert.equal(checkPricingRequestProvenance({
    headers:{'sec-fetch-site':'cross-site'}
  }).code,'PRICE_CROSS_SITE_BLOCKED');

  assert.equal(checkPricingRequestProvenance({
    headers:{
      origin:'https://evil.example',
      host:'waffer.example'
    }
  }).code,'PRICE_ORIGIN_MISMATCH');
});
