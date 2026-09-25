import test from 'node:test';
import assert from 'node:assert/strict';

import priceCompareHandler from '../api/price-compare.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { resetPricingRequestGuardForTests } from '../lib/pricing-abuse-guard.js';

function responseRecorder() {
  return {
    statusCode:200,
    body:null,
    headers:{},
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return value;}
  };
}

function validBody() {
  return {
    partName:'Brake pad',
    partNumber:'BRK-123',
    workshopPrice:300,
    quantity:1,
    market:'SA',
    locale:'en-SA',
    currency:'SAR',
    vehicle:{vehicleId:9445}
  };
}

function request({ip='203.0.113.44',body=validBody(),headers={}}={}) {
  return {
    method:'POST',
    body,
    headers:{
      'x-forwarded-for':ip,
      'sec-fetch-site':'same-origin',
      origin:'https://waffer.example',
      host:'waffer.example',
      ...headers
    }
  };
}

const original={
  burstWindow:RUNTIME_CONFIG.priceRateLimitBurstWindowMs,
  burstMax:RUNTIME_CONFIG.priceRateLimitBurstMax,
  hourlyWindow:RUNTIME_CONFIG.priceRateLimitHourlyWindowMs,
  hourlyMax:RUNTIME_CONFIG.priceRateLimitHourlyMax,
  maxEntries:RUNTIME_CONFIG.priceRateLimitMaxEntries
};

test.beforeEach(()=>{
  resetPricingRequestGuardForTests();
  RUNTIME_CONFIG.priceRateLimitBurstWindowMs=60_000;
  RUNTIME_CONFIG.priceRateLimitBurstMax=2;
  RUNTIME_CONFIG.priceRateLimitHourlyWindowMs=3_600_000;
  RUNTIME_CONFIG.priceRateLimitHourlyMax=10;
  RUNTIME_CONFIG.priceRateLimitMaxEntries=100;
});

test.after(()=>{
  RUNTIME_CONFIG.priceRateLimitBurstWindowMs=original.burstWindow;
  RUNTIME_CONFIG.priceRateLimitBurstMax=original.burstMax;
  RUNTIME_CONFIG.priceRateLimitHourlyWindowMs=original.hourlyWindow;
  RUNTIME_CONFIG.priceRateLimitHourlyMax=original.hourlyMax;
  RUNTIME_CONFIG.priceRateLimitMaxEntries=original.maxEntries;
  resetPricingRequestGuardForTests();
});

test('third valid pricing request is rate limited with Retry-After',async()=>{
  const first=responseRecorder();
  const second=responseRecorder();
  const third=responseRecorder();

  await priceCompareHandler(request(),first);
  await priceCompareHandler(request(),second);
  await priceCompareHandler(request(),third);

  assert.equal(first.statusCode,200);
  assert.equal(second.statusCode,200);
  assert.equal(third.statusCode,429);
  assert.equal(third.body.code,'PRICE_CLIENT_RATE_LIMITED');
  assert.ok(Number(third.headers['Retry-After'])>=1);
  assert.equal(third.headers['X-RateLimit-Pricing-Burst-Limit'],'2');
  assert.equal(third.headers['X-RateLimit-Pricing-Burst-Remaining'],'0');
});

test('invalid pricing request does not consume provider-facing quota',async()=>{
  RUNTIME_CONFIG.priceRateLimitBurstMax=1;

  const invalid=responseRecorder();
  await priceCompareHandler(request({
    body:{partName:' ',partNumber:' ',market:'SA',locale:'en-SA'}
  }),invalid);
  assert.equal(invalid.statusCode,400);
  assert.equal(invalid.body.code,'PART_IDENTITY_REQUIRED');

  const firstValid=responseRecorder();
  await priceCompareHandler(request(),firstValid);
  assert.equal(firstValid.statusCode,200);

  const secondValid=responseRecorder();
  await priceCompareHandler(request(),secondValid);
  assert.equal(secondValid.statusCode,429);
});

test('unsupported market does not consume pricing quota',async()=>{
  RUNTIME_CONFIG.priceRateLimitBurstMax=1;

  const invalidMarket=responseRecorder();
  await priceCompareHandler(request({
    body:{...validBody(),market:'ZZ'}
  }),invalidMarket);
  assert.equal(invalidMarket.statusCode,400);
  assert.equal(invalidMarket.body.code,'UNSUPPORTED_MARKET');

  const valid=responseRecorder();
  await priceCompareHandler(request(),valid);
  assert.equal(valid.statusCode,200);
});

test('cross-site pricing request is blocked before quota accounting',async()=>{
  RUNTIME_CONFIG.priceRateLimitBurstMax=1;

  const blocked=responseRecorder();
  await priceCompareHandler(request({
    headers:{'sec-fetch-site':'cross-site'}
  }),blocked);
  assert.equal(blocked.statusCode,403);
  assert.equal(blocked.body.code,'PRICE_CROSS_SITE_BLOCKED');

  const valid=responseRecorder();
  await priceCompareHandler(request(),valid);
  assert.equal(valid.statusCode,200);
});
