import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadMatcher(fetchImpl) {
  const source=fs.readFileSync(new URL('../parts-match.js',import.meta.url),'utf8');
  const events=[];
  const window={
    WAFFER_RUNTIME:{
      catalogProductsTimeoutMs:100,
      catalogArticlesTimeoutMs:100,
      catalogCriteriaTimeoutMs:100
    },
    wafferVehicleId:'9445',
    wafferAnalysisRunId:1,
    analysis:null,
    dispatchEvent(event){events.push(event);}
  };

  class CustomEvent {
    constructor(type,options={}) {
      this.type=type;
      this.detail=options.detail;
    }
  }

  vm.runInNewContext(source,{
    window,
    fetch:fetchImpl,
    CustomEvent,
    AbortController,
    setTimeout,
    clearTimeout,
    console:{log(){},error(){}}
  });

  return {window,events};
}

test('article origin block propagates instead of becoming an empty catalog match',async()=>{
  const fetchImpl=async url=>{
    const value=String(url);
    if(value.startsWith('/api/products')){
      return {
        ok:true,
        json:async()=>({products:[{productId:55,productName:'brake pad set'}]})
      };
    }
    if(value.startsWith('/api/articles')){
      return {
        ok:false,
        status:403,
        headers:{get(){return null;}},
        json:async()=>({
          error:'blocked',
          code:'CATALOG_ORIGIN_MISMATCH'
        })
      };
    }
    throw new Error('Unexpected fetch: '+value);
  };

  const {window,events}=loadMatcher(fetchImpl);
  const analysis={
    engineContext:{market:'SA'},
    items:[{name:'front brake pad',itemType:'part'}]
  };
  window.analysis=analysis;

  await assert.rejects(
    window.matchWafferParts(analysis,{runId:1,signal:new AbortController().signal}),
    error=>error?.code==='CATALOG_ORIGIN_MISMATCH'
  );

  assert.equal(window.wafferCatalogState.status,'BLOCKED');
  assert.equal(window.wafferCatalogState.code,'CATALOG_ORIGIN_MISMATCH');
  assert.equal(events.length,0);
});

test('criteria rate limit propagates with Retry-After and RATE_LIMITED state',async()=>{
  const fetchImpl=async url=>{
    const value=String(url);
    if(value.startsWith('/api/products')){
      return {
        ok:true,
        json:async()=>({products:[{productId:55,productName:'brake pad set'}]})
      };
    }
    if(value.startsWith('/api/articles')){
      return {
        ok:true,
        json:async()=>({
          articles:[{
            articleId:1001,
            articleNo:'PAD-F',
            supplierName:'Brand F',
            articleProductName:'Brake Pad Set'
          }]
        })
      };
    }
    if(value.startsWith('/api/article-criteria')){
      return {
        ok:false,
        status:429,
        headers:{get(name){return String(name).toLowerCase()==='retry-after'?'42':null;}},
        json:async()=>({
          error:'too many requests',
          code:'CATALOG_CLIENT_RATE_LIMITED'
        })
      };
    }
    throw new Error('Unexpected fetch: '+value);
  };

  const {window,events}=loadMatcher(fetchImpl);
  const analysis={
    engineContext:{market:'SA'},
    items:[{name:'front brake pad',itemType:'part'}]
  };
  window.analysis=analysis;

  await assert.rejects(
    window.matchWafferParts(analysis,{runId:1,signal:new AbortController().signal}),
    error=>{
      assert.equal(error.code,'CATALOG_CLIENT_RATE_LIMITED');
      assert.equal(error.retryAfterSeconds,42);
      return true;
    }
  );

  assert.equal(window.wafferCatalogState.status,'RATE_LIMITED');
  assert.equal(window.wafferCatalogState.retryAfterSeconds,42);
  assert.equal(events.length,0);
});
