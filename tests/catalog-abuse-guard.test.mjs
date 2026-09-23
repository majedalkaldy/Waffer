import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkCatalogRequestLimit,
  resetCatalogRequestGuardForTests
} from '../lib/catalog-abuse-guard.js';

const config = {
  catalogRateLimitBurstWindowMs: 60_000,
  catalogRateLimitBurstMax: 3,
  catalogRateLimitHourlyWindowMs: 3_600_000,
  catalogRateLimitHourlyMax: 10,
  catalogRateLimitMaxEntries: 5000,
  vinRateLimitBurstWindowMs: 60_000,
  vinRateLimitBurstMax: 2,
  vinRateLimitHourlyWindowMs: 3_600_000,
  vinRateLimitHourlyMax: 5,
  manufacturersRateLimitBurstWindowMs: 60_000,
  manufacturersRateLimitBurstMax: 2,
  manufacturersRateLimitHourlyWindowMs: 3_600_000,
  manufacturersRateLimitHourlyMax: 5
};

function req(ip='203.0.113.50') {
  return { headers: { 'x-forwarded-for': ip } };
}

test.beforeEach(() => resetCatalogRequestGuardForTests());

test('catalog match endpoints share one aggregate bucket', () => {
  const request=req();
  assert.equal(checkCatalogRequestLimit(request,config,'match',1000).allowed,true);
  assert.equal(checkCatalogRequestLimit(request,config,'match',1000).allowed,true);
  assert.equal(checkCatalogRequestLimit(request,config,'match',1000).allowed,true);
  const blocked=checkCatalogRequestLimit(request,config,'match',1000);
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.reason,'BURST');
  assert.equal(blocked.burstRemaining,0);
});

test('VIN bucket is independent from catalog matching bucket', () => {
  const request=req();
  for(let i=0;i<3;i++) assert.equal(checkCatalogRequestLimit(request,config,'match',1000).allowed,true);
  assert.equal(checkCatalogRequestLimit(request,config,'match',1000).allowed,false);

  assert.equal(checkCatalogRequestLimit(request,config,'vin',1000).allowed,true);
  assert.equal(checkCatalogRequestLimit(request,config,'vin',1000).allowed,true);
  assert.equal(checkCatalogRequestLimit(request,config,'vin',1000).allowed,false);
});

test('manufacturer bucket is independent and resets after its window', () => {
  const request=req();
  assert.equal(checkCatalogRequestLimit(request,config,'manufacturers',1000).allowed,true);
  assert.equal(checkCatalogRequestLimit(request,config,'manufacturers',1000).allowed,true);
  assert.equal(checkCatalogRequestLimit(request,config,'manufacturers',1000).allowed,false);
  assert.equal(checkCatalogRequestLimit(request,config,'manufacturers',61_001).allowed,true);
});

test('different clients have independent catalog quotas', () => {
  const first=req('203.0.113.1');
  const second=req('203.0.113.2');
  for(let i=0;i<3;i++) checkCatalogRequestLimit(first,config,'match',1000);
  assert.equal(checkCatalogRequestLimit(first,config,'match',1000).allowed,false);
  assert.equal(checkCatalogRequestLimit(second,config,'match',1000).allowed,true);
});

test('missing Vercel client IP never creates one global shared bucket', () => {
  const request={headers:{}};
  for(let i=0;i<100;i++) {
    const result=checkCatalogRequestLimit(request,config,'match',1000);
    assert.equal(result.allowed,true);
    assert.equal(result.reason,'NO_CLIENT_IP');
  }
});
