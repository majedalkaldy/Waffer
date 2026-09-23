import test from 'node:test';
import assert from 'node:assert/strict';

import productsHandler from '../api/products.js';
import vinHandler from '../api/vin.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { resetCatalogRequestGuardForTests } from '../lib/catalog-abuse-guard.js';

const originalFetch=globalThis.fetch;
const originalKey=process.env.AUTOPARTS_API_KEY;
const originalLimits={
  catalogRateLimitBurstWindowMs:RUNTIME_CONFIG.catalogRateLimitBurstWindowMs,
  catalogRateLimitBurstMax:RUNTIME_CONFIG.catalogRateLimitBurstMax,
  catalogRateLimitHourlyWindowMs:RUNTIME_CONFIG.catalogRateLimitHourlyWindowMs,
  catalogRateLimitHourlyMax:RUNTIME_CONFIG.catalogRateLimitHourlyMax
};

function resRecorder(){
  return {
    statusCode:200,
    body:null,
    headers:{},
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return value;}
  };
}

function headers(ip='203.0.113.77', extra={}){
  return {
    'x-forwarded-for':ip,
    host:'waffer.example',
    origin:'https://waffer.example',
    'sec-fetch-site':'same-origin',
    ...extra
  };
}

test.before(()=>{
  process.env.AUTOPARTS_API_KEY='test-key';
  RUNTIME_CONFIG.catalogRateLimitBurstWindowMs=60_000;
  RUNTIME_CONFIG.catalogRateLimitBurstMax=2;
  RUNTIME_CONFIG.catalogRateLimitHourlyWindowMs=3_600_000;
  RUNTIME_CONFIG.catalogRateLimitHourlyMax=10;
});

test.after(()=>{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined) delete process.env.AUTOPARTS_API_KEY;
  else process.env.AUTOPARTS_API_KEY=originalKey;
  Object.assign(RUNTIME_CONFIG,originalLimits);
  resetCatalogRequestGuardForTests();
});

test.beforeEach(()=>{
  resetCatalogRequestGuardForTests();
  globalThis.fetch=originalFetch;
});

test('third valid products request is blocked before AutoParts upstream',async()=>{
  let calls=0;
  globalThis.fetch=async()=>{
    calls+=1;
    return {ok:true,status:200,json:async()=>[]};
  };

  const request={
    method:'GET',
    headers:headers(),
    query:{vehicleId:'9445',market:'SA'}
  };

  const first=resRecorder(), second=resRecorder(), third=resRecorder();
  await productsHandler(request,first);
  await productsHandler(request,second);
  await productsHandler(request,third);

  assert.equal(first.statusCode,200);
  assert.equal(second.statusCode,200);
  assert.equal(third.statusCode,429);
  assert.equal(third.body.code,'CATALOG_CLIENT_RATE_LIMITED');
  assert.equal(calls,2);
});

test('invalid products request does not consume catalog quota',async()=>{
  let calls=0;
  globalThis.fetch=async()=>{
    calls+=1;
    return {ok:true,status:200,json:async()=>[]};
  };

  const invalid=resRecorder();
  await productsHandler({
    method:'GET',
    headers:headers(),
    query:{vehicleId:'bad',market:'SA'}
  },invalid);
  assert.equal(invalid.statusCode,400);

  const validReq={
    method:'GET',
    headers:headers(),
    query:{vehicleId:'9445',market:'SA'}
  };
  const first=resRecorder(),second=resRecorder(),third=resRecorder();
  await productsHandler(validReq,first);
  await productsHandler(validReq,second);
  await productsHandler(validReq,third);

  assert.equal(first.statusCode,200);
  assert.equal(second.statusCode,200);
  assert.equal(third.statusCode,429);
  assert.equal(calls,2);
});

test('cross-site VIN request is blocked before AutoParts upstream',async()=>{
  let calls=0;
  globalThis.fetch=async()=>{
    calls+=1;
    throw new Error('upstream must not be called');
  };

  const res=resRecorder();
  await vinHandler({
    method:'GET',
    headers:headers('203.0.113.88',{
      'sec-fetch-site':'cross-site',
      origin:'https://evil.example'
    }),
    query:{vin:'1HGCM82633A004352'}
  },res);

  assert.equal(res.statusCode,403);
  assert.equal(res.body.code,'CATALOG_CROSS_SITE_BLOCKED');
  assert.equal(calls,0);
});
