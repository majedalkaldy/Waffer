import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkCatalogRequestLimit,
  checkCatalogRequestProvenance,
  enforceCatalogRequestGuard,
  resetCatalogRequestGuardForTests
} from '../lib/catalog-abuse-guard.js';

const config = {
  catalogRateLimitBurstWindowMs:60_000,
  catalogRateLimitBurstMax:3,
  catalogRateLimitHourlyWindowMs:3_600_000,
  catalogRateLimitHourlyMax:5,
  catalogRateLimitMaxEntries:5000
};

function req(ip='203.0.113.50', extra={}) {
  return {
    headers:{
      'x-forwarded-for':ip,
      host:'waffer.example',
      origin:'https://waffer.example',
      'sec-fetch-site':'same-origin',
      ...extra
    }
  };
}

function resRecorder() {
  return {
    statusCode:200,
    body:null,
    headers:{},
    setHeader(name,value){ this.headers[name]=value; },
    status(code){ this.statusCode=code; return this; },
    json(value){ this.body=value; return value; }
  };
}

test.beforeEach(() => resetCatalogRequestGuardForTests());

test('catalog guard allows broad normal burst then blocks the next request', () => {
  const request=req();
  assert.equal(checkCatalogRequestLimit(request,config,1000).allowed,true);
  assert.equal(checkCatalogRequestLimit(request,config,1000).allowed,true);
  assert.equal(checkCatalogRequestLimit(request,config,1000).allowed,true);

  const blocked=checkCatalogRequestLimit(request,config,1000);
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.reason,'BURST');
  assert.equal(blocked.retryAfterSeconds,60);
});

test('catalog hourly ceiling survives burst-window resets', () => {
  const request=req();
  const custom={...config,catalogRateLimitBurstMax:100,catalogRateLimitHourlyMax:2};

  assert.equal(checkCatalogRequestLimit(request,custom,0).allowed,true);
  assert.equal(checkCatalogRequestLimit(request,custom,61_000).allowed,true);
  const blocked=checkCatalogRequestLimit(request,custom,122_000);
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.reason,'HOURLY');
});

test('different catalog clients have independent buckets', () => {
  const a=req('203.0.113.1');
  const b=req('203.0.113.2');
  for(let i=0;i<3;i++) checkCatalogRequestLimit(a,config,1000);
  assert.equal(checkCatalogRequestLimit(a,config,1000).allowed,false);
  assert.equal(checkCatalogRequestLimit(b,config,1000).allowed,true);
});

test('missing Vercel client IP does not create one shared bucket', () => {
  const request={headers:{}};
  for(let i=0;i<100;i++){
    const result=checkCatalogRequestLimit(request,config,1000);
    assert.equal(result.allowed,true);
    assert.equal(result.reason,'NO_CLIENT_IP');
  }
});

test('cross-site catalog requests are rejected before quota accounting', () => {
  const blocked=checkCatalogRequestProvenance(req('203.0.113.9',{
    'sec-fetch-site':'cross-site',
    origin:'https://evil.example'
  }));
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.code,'CATALOG_CROSS_SITE_BLOCKED');
});

test('enforcement emits 429 Retry-After and catalog limit headers', () => {
  const request=req();
  for(let i=0;i<3;i++){
    const response=resRecorder();
    assert.equal(enforceCatalogRequestGuard(request,response,config),true);
  }

  const response=resRecorder();
  assert.equal(enforceCatalogRequestGuard(request,response,config),false);
  assert.equal(response.statusCode,429);
  assert.equal(response.body.code,'CATALOG_CLIENT_RATE_LIMITED');
  assert.ok(Number(response.headers['Retry-After'])>=1);
  assert.equal(response.headers['X-RateLimit-Catalog-Minute-Limit'],'3');
  assert.equal(response.headers['X-RateLimit-Catalog-Hour-Limit'],'5');
});
