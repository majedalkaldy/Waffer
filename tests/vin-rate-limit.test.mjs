import test from 'node:test';
import assert from 'node:assert/strict';

import vinHandler from '../api/vin.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { resetCatalogRequestGuardForTests } from '../lib/catalog-abuse-guard.js';

const originalFetch=globalThis.fetch;
const originalKey=process.env.AUTOPARTS_API_KEY;
const originalBurst=RUNTIME_CONFIG.vinRateLimitBurstMax;
const originalHourly=RUNTIME_CONFIG.vinRateLimitHourlyMax;

function responseRecorder(){
  return {
    statusCode:200,
    body:null,
    headers:{},
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return value;}
  };
}

function request(){
  return {
    method:'GET',
    query:{vin:'1HGCM82633A004352'},
    headers:{'x-forwarded-for':'198.51.100.20'}
  };
}

test.before(()=>{
  process.env.AUTOPARTS_API_KEY='test-key';
  RUNTIME_CONFIG.vinRateLimitBurstMax=1;
  RUNTIME_CONFIG.vinRateLimitHourlyMax=10;
});

test.after(()=>{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined) delete process.env.AUTOPARTS_API_KEY;
  else process.env.AUTOPARTS_API_KEY=originalKey;
  RUNTIME_CONFIG.vinRateLimitBurstMax=originalBurst;
  RUNTIME_CONFIG.vinRateLimitHourlyMax=originalHourly;
  resetCatalogRequestGuardForTests();
});

test.beforeEach(()=>resetCatalogRequestGuardForTests());

test('VIN guard rejects excess lookup before provider fetch',async()=>{
  let calls=0;
  globalThis.fetch=async()=>{
    calls+=1;
    return {
      ok:true,
      status:200,
      text:async()=>JSON.stringify({ok:true})
    };
  };

  const first=responseRecorder();
  const second=responseRecorder();

  await vinHandler(request(),first);
  await vinHandler(request(),second);

  assert.equal(first.statusCode,200);
  assert.equal(second.statusCode,429);
  assert.equal(second.body?.code,'VIN_CLIENT_RATE_LIMITED');
  assert.ok(Number(second.headers['Retry-After'])>=1);
  assert.equal(calls,1);
});
