import test from 'node:test';
import assert from 'node:assert/strict';

import productsHandler from '../api/products.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { resetCatalogRequestGuardForTests } from '../lib/catalog-abuse-guard.js';

const originalFetch=globalThis.fetch;
const originalKey=process.env.AUTOPARTS_API_KEY;
const originalBurst=RUNTIME_CONFIG.catalogRateLimitBurstMax;
const originalHourly=RUNTIME_CONFIG.catalogRateLimitHourlyMax;

function res(){
  return {
    statusCode:200,
    body:null,
    headers:{},
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return value;}
  };
}

function req(vehicleId){
  return {
    method:'GET',
    query:{vehicleId,market:'SA'},
    headers:{'x-forwarded-for':'198.51.100.10'}
  };
}

test.before(()=>{
  process.env.AUTOPARTS_API_KEY='test-key';
  RUNTIME_CONFIG.catalogRateLimitBurstMax=2;
  RUNTIME_CONFIG.catalogRateLimitHourlyMax=20;
});

test.after(()=>{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined) delete process.env.AUTOPARTS_API_KEY;
  else process.env.AUTOPARTS_API_KEY=originalKey;
  RUNTIME_CONFIG.catalogRateLimitBurstMax=originalBurst;
  RUNTIME_CONFIG.catalogRateLimitHourlyMax=originalHourly;
  resetCatalogRequestGuardForTests();
});

test.beforeEach(()=>resetCatalogRequestGuardForTests());

test('catalog guard rejects excess valid calls before provider fetch',async()=>{
  let calls=0;
  globalThis.fetch=async()=>{
    calls+=1;
    return {ok:true,status:200,json:async()=>[]};
  };

  const bad=res();
  await productsHandler(req('bad'),bad);
  assert.equal(bad.statusCode,400);
  assert.equal(calls,0);

  const first=res();
  const second=res();
  const third=res();

  await productsHandler(req('9445'),first);
  await productsHandler(req('9445'),second);
  await productsHandler(req('9445'),third);

  assert.equal(first.statusCode,200);
  assert.equal(second.statusCode,200);
  assert.equal(third.statusCode,429);
  assert.equal(third.body?.code,'CATALOG_CLIENT_RATE_LIMITED');
  assert.equal(calls,2);
});
