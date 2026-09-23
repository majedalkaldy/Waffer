import test from 'node:test';
import assert from 'node:assert/strict';

import productsHandler from '../api/products.js';
import articlesHandler from '../api/articles.js';
import criteriaHandler from '../api/article-criteria.js';
import vinHandler from '../api/vin.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';

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

test('products success is cached only at Vercel CDN',async()=>{
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
  assert.equal(
    res.headers['Vercel-CDN-Cache-Control'],
    'public, max-age='+RUNTIME_CONFIG.catalogDataCdnCacheSeconds+
      ', stale-while-revalidate='+RUNTIME_CONFIG.catalogDataCdnStaleSeconds
  );
});

test('articles success uses public catalog CDN policy',async()=>{
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
  assert.equal(
    res.headers['Vercel-CDN-Cache-Control'],
    'public, max-age='+RUNTIME_CONFIG.catalogDataCdnCacheSeconds+
      ', stale-while-revalidate='+RUNTIME_CONFIG.catalogDataCdnStaleSeconds
  );
});

test('article criteria success uses longer CDN policy',async()=>{
  process.env.AUTOPARTS_API_KEY='test-key';
  globalThis.fetch=async()=>({
    ok:true,
    status:200,
    text:async()=>JSON.stringify([{criteriaName:'Fitting Position',criteriaValue:'Front Axle'}])
  });

  const res=resRecorder();
  await criteriaHandler({method:'GET',query:{articleId:'1001',market:'SA'},headers:{}},res);

  assert.equal(res.statusCode,200);
  assert.equal(
    res.headers['Vercel-CDN-Cache-Control'],
    'public, max-age='+RUNTIME_CONFIG.catalogCriteriaCdnCacheSeconds+
      ', stale-while-revalidate='+RUNTIME_CONFIG.catalogCriteriaCdnStaleSeconds
  );
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
  assert.equal(res.headers['Vercel-CDN-Cache-Control'],undefined);
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

test('catalog CDN durations are positive and stale windows are longer',()=>{
  assert.ok(RUNTIME_CONFIG.catalogDataCdnCacheSeconds>0);
  assert.ok(RUNTIME_CONFIG.catalogDataCdnStaleSeconds>=RUNTIME_CONFIG.catalogDataCdnCacheSeconds);
  assert.ok(RUNTIME_CONFIG.catalogCriteriaCdnCacheSeconds>=RUNTIME_CONFIG.catalogDataCdnCacheSeconds);
  assert.ok(RUNTIME_CONFIG.catalogCriteriaCdnStaleSeconds>=RUNTIME_CONFIG.catalogCriteriaCdnCacheSeconds);
});
