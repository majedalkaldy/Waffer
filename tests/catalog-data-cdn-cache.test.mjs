import test from 'node:test';
import assert from 'node:assert/strict';

import productsHandler from '../api/products.js';
import articlesHandler from '../api/articles.js';
import criteriaHandler from '../api/article-criteria.js';
import vinHandler from '../api/vin.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';

function assertNoStore(res) {
  for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) {
    assert.equal(res.headers[header], 'no-store', header);
  }
}

const originalFetch=globalThis.fetch;
const originalKey=process.env.AUTOPARTS_API_KEY;

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

test.afterEach(()=>{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined) delete process.env.AUTOPARTS_API_KEY;
  else process.env.AUTOPARTS_API_KEY=originalKey;
});

test('products success forbids storage at every cache layer',async()=>{
  process.env.AUTOPARTS_API_KEY='test-key';
  globalThis.fetch=async()=>({
    ok:true,
    status:200,
    json:async()=>[{productId:55,productName:'Brake Pad'}]
  });

  const res=resRecorder();
  await productsHandler({method:'GET',query:{vehicleId:'9445',market:'SA'},headers:{}},res);

  assert.equal(res.statusCode,200);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assertNoStore(res);
});

test('articles success forbids storage at every cache layer',async()=>{
  process.env.AUTOPARTS_API_KEY='test-key';
  globalThis.fetch=async()=>({
    ok:true,
    status:200,
    json:async()=>({articles:[{articleId:1001,articleNo:'PAD-1'}]})
  });

  const res=resRecorder();
  await articlesHandler({
    method:'GET',
    query:{vehicleId:'9445',productId:'55',market:'SA'},
    headers:{}
  },res);

  assert.equal(res.statusCode,200);
  assertNoStore(res);
});

test('article criteria success forbids storage at every cache layer',async()=>{
  process.env.AUTOPARTS_API_KEY='test-key';
  globalThis.fetch=async()=>({
    ok:true,
    status:200,
    text:async()=>JSON.stringify([{criteriaName:'Fitting Position',criteriaValue:'Front Axle'}])
  });

  const res=resRecorder();
  await criteriaHandler({method:'GET',query:{articleId:'1001',market:'SA'},headers:{}},res);

  assert.equal(res.statusCode,200);
  assertNoStore(res);
});

test('upstream catalog errors are never marked cacheable',async()=>{
  process.env.AUTOPARTS_API_KEY='test-key';
  globalThis.fetch=async()=>({
    ok:false,
    status:503,
    json:async()=>({error:'down'})
  });

  const res=resRecorder();
  await productsHandler({method:'GET',query:{vehicleId:'9445',market:'SA'},headers:{}},res);

  assert.equal(res.statusCode,502);
  assertNoStore(res);
});

test('VIN responses remain private and are never CDN cached',async()=>{
  process.env.AUTOPARTS_API_KEY='test-key';
  globalThis.fetch=async()=>({
    ok:true,
    status:200,
    text:async()=>JSON.stringify({vehicles:[{vehicleId:9445}]})
  });

  const res=resRecorder();
  await vinHandler({
    method:'GET',
    query:{vin:'1HGCM82633A004352'},
    headers:{}
  },res);

  assert.equal(res.statusCode,200);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.equal(res.headers['Vercel-CDN-Cache-Control'],undefined);
});

test('catalog CDN storage and stale reuse are disabled',()=>{
  for (const key of ['catalogDataCdnCacheSeconds','catalogDataCdnStaleSeconds','catalogCriteriaCdnCacheSeconds','catalogCriteriaCdnStaleSeconds']) assert.equal(RUNTIME_CONFIG[key],0,key);
});

// Synthetic transport only: every return path must keep the no-retention policy.
const { default: manufacturersHandler } = await import('../api/vehicles.js');
for (const [name, handler] of [
  ['products', productsHandler], ['articles', articlesHandler],
  ['criteria', criteriaHandler], ['manufacturers', manufacturersHandler]
]) {
  const request = (overrides = {}) => ({ method: 'GET', headers: {},
    query: { vehicleId: '123', productId: '456', articleId: '789', market: 'US' }, ...overrides });
  for (const [scenario, req, key, expected] of [
    ['unsupported method', request({ method: 'POST' }), 'test-key', 405],
    ['missing API key', request(), '', 500],
    ['unsupported market', request({ query: { vehicleId:'123', productId:'456', articleId:'789', market:'INVALID' } }), 'test-key', 400],
    ['cross-site request', request({ headers: { 'sec-fetch-site':'cross-site' } }), 'test-key', 403]
  ]) test(name + ' prohibits caching on ' + scenario, async () => {
    process.env.AUTOPARTS_API_KEY = key;
    globalThis.fetch = async () => { throw new Error('Unexpected provider call'); };
    const res = resRecorder();
    await handler(req, res);
    assert.equal(res.statusCode, expected);
    assertNoStore(res);
  });

  for (const malformed of [false, true]) test(name + ' prohibits caching on ' + (malformed ? 'malformed response' : 'upstream failure'), async () => {
    process.env.AUTOPARTS_API_KEY = 'test-key';
    globalThis.fetch = async () => ({ ok: malformed, status: malformed ? 200 : 503,
      json: async () => { if (malformed) throw new SyntaxError('fixture'); return { error:'fixture' }; },
      text: async () => malformed ? 'invalid fixture' : '{"error":"fixture"}' });
    const res = resRecorder();
    await handler(request(), res);
    assert.equal(res.statusCode, 502);
    assertNoStore(res);
  });

  test(name + ' does not reuse a response across requests', async () => {
    process.env.AUTOPARTS_API_KEY = 'test-key';
    let calls = 0;
    globalThis.fetch = async () => { calls++; return { ok:true, status:200,
      json:async()=>[], text:async()=>'[]' }; };
    for (let i=0; i<2; i++) {
      const res=resRecorder(); await handler(request(),res);
      assert.equal(res.statusCode,200); assertNoStore(res);
    }
    assert.equal(calls,2);
  });
}
