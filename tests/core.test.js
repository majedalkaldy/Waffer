import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fetchJSON, MAX_UPLOAD_BYTES, validateFile, fileType, validateYear, score, assertAnalysis, mapLimit } from '../lib/client-core.js';
import { classify, bestProduct, shortlistArticles, requestedAxle, criteriaPositions, matchParts } from '../parts-match.js';
import { readVinCandidates, createVinResolver } from '../vin-ui.js';
import { getMarketConfig } from '../lib/market-config.js';
import { t } from '../lib/i18n.js';
const config = getMarketConfig({});
const result = (body, status=200) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json'}});
const sampleVehicle = (id, make='Toyota', year=2020) => ({ data:{
  matchingManufacturers:{array:[{manuId:5,manuName:make}]},
  matchingModels:{array:[{modelId:9,modelName:'Camry'}]},
  matchingVehicles:{array:[{vehicleId:id,modelId:9,manufacturerId:5,year}]}
} });

for (const type of ['image/jpeg','image/png','image/webp','application/pdf']) test('file accepts '+type, () => {
  assert.equal(validateFile({name:'quote',size:100,type}),null);
});
test('file rejects unsupported, empty, and oversize inputs', () => {
  assert.equal(validateFile(null),'FILE_REQUIRED');
  assert.equal(validateFile({size:0,type:'image/png'}),'FILE_EMPTY');
  assert.equal(validateFile({size:100,type:'text/html'}),'FILE_TYPE');
  assert.equal(validateFile({size:MAX_UPLOAD_BYTES+1,type:'application/pdf'}),'FILE_TOO_LARGE');
});
test('file handles missing mobile MIME using extension', () => {
  assert.equal(fileType({name:'QUOTE.PDF',type:''}),'application/pdf');
  assert.equal(validateFile({name:'quote.jpg',size:100,type:''}),null);
  assert.equal(validateFile({name:'quote.pdf',size:100,type:'text/html'}),'FILE_TYPE');
});
test('raw file limit leaves room below 4.5 MB JSON transport limit', () => {
  assert.ok(4 * Math.ceil(MAX_UPLOAD_BYTES/3) + 15000 < 4500000);
});
test('year validates without accepting partial numeric strings', () => {
  assert.ok(validateYear('2020',2026)); assert.ok(validateYear('',2026));
  assert.ok(!validateYear('20200',2026)); assert.ok(!validateYear('200x',2026)); assert.ok(!validateYear('9999',2026));
});
test('zero scores remain zero; missing or invalid scores are unknown', () => {
  assert.equal(score(0),0); assert.equal(score(null),null); assert.equal(score('99'),null); assert.equal(score(101),null);
});
test('analysis validation does not silently accept corrupted line items', () => {
  assert.throws(()=>assertAnalysis({items:[null]}));
  assert.throws(()=>assertAnalysis({items:[{name:''}]}));
  assert.throws(()=>assertAnalysis({items:[],acceptance:{schemaValid:false}}));
  assert.deepEqual(assertAnalysis({items:[]}),{items:[]});
  assert.equal(assertAnalysis({items:[{name:'filter',price:0}]}).items[0].price,0);
});
test('JSON success',async()=>assert.deepEqual(await fetchJSON('/x',{fetchImpl:async()=>result({ok:true})}),{ok:true}));
test('rate limit keeps a machine-readable status without leaking raw errors',async()=>{
  await assert.rejects(fetchJSON('/x',{fetchImpl:async()=>result({error:'secret-upstream-info'},429)}),e=>e.code==='RATE_LIMITED'&&e.status===429&&!e.message.includes('secret'));
});
test('HTML payload-too-large response is not misreported as generic JSON error',async()=>{
  await assert.rejects(fetchJSON('/x',{fetchImpl:async()=>new Response('<html>413</html>',{status:413})}),e=>e.code==='FILE_TOO_LARGE');
});
test('deadline remains active after headers, while response body is stalled',async()=>{
  const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const start=Date.now();
    await assert.rejects(fetchJSON('http://127.0.0.1:'+server.address().port,{timeoutMs:45}),e=>e.code==='TIMEOUT');
    assert.ok(Date.now()-start<1000);
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
test('cancelled request is not converted to successful empty result',async()=>{
  const c=new AbortController();c.abort();let calls=0;
  await assert.rejects(fetchJSON('/x',{signal:c.signal,fetchImpl:async()=>{calls++;return result({});}}),e=>e.name==='AbortError');
  assert.equal(calls,0);
});
test('mapLimit preserves positions and bounds concurrency',async()=>{
  let active=0,max=0;
  const values=await mapLimit([1,2,3,4,5],2,async n=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;return n*2;});
  assert.deepEqual(values,[2,4,6,8,10]);assert.equal(max,2);
});
test('cabin air filter takes precedence over generic air filter',()=>assert.equal(classify('cabin air filter').type,'cabin_filter'));
test('Arabic normalization recognizes axle variants',()=>{
  assert.equal(requestedAxle('فحمات أمامية'),'front');assert.equal(requestedAxle('خلفية'),'rear');
  assert.equal(requestedAxle('front and rear'),'both');assert.equal(requestedAxle('مساعد'),null);
});
test('brake accessories cannot win the brake-pad category',()=>{
  const products=[{productId:1,productName:'Accessory kit, brake pad set'},{productId:2,productName:'Brake Pad Set'}];
  assert.equal(bestProduct('فحمات أمامية',products).productId,2);
});
test('unknown text cannot win through an unrelated partial word',()=>assert.equal(bestProduct('water hose',[{productId:1,productName:'Water Pump'}]),null));
test('shortlist is unique even when all alternatives share one supplier',()=>{
  const articles=[{supplierName:'A',articleNo:'1'},{supplierName:'A',articleNo:'2'},{supplierName:'A',articleNo:'3'}];
  assert.deepEqual(shortlistArticles([...articles,articles[0]]).map(x=>x.articleNo),['1','2','3']);
});
test('same part number under different suppliers is not wrongly merged',()=>{
  assert.equal(shortlistArticles([{supplierName:'A',articleNo:'123'},{supplierName:'B',articleNo:'123'}]).length,2);
});
test('shortlist prefers diverse brands without fabricating OEM labels',()=>{
  const articles=[{supplierName:'A',articleNo:'1',articleProductName:'Toe link'},{supplierName:'A',articleNo:'2'},{supplierName:'B',articleNo:'3'}];
  const selected=shortlistArticles(articles,2);assert.deepEqual(selected.map(x=>x.supplierName),['A','B']);assert.ok(selected.every(x=>x.qualityLabel===undefined));
});
test('only fitting-position criteria count as axle evidence',()=>{
  assert.equal(criteriaPositions([{name:'Marketing',value:'front'}]).size,0);
  assert.ok(criteriaPositions({criteria:[{criteriaName:'Fitting Position',criteriaValue:'Front Axle'}]}).has('front'));
  assert.equal(criteriaPositions({criteria:[{criteriaName:'Fitting Position',criteriaValue:'Rear Axle'}]}).has('front'),false);
});
test('absent vehicle returns NOT_REQUESTED without undefined error or network request',async()=>{
  let calls=0;const r=await matchParts({items:[{name:'filter'}]},null,config,{request:async()=>{calls++;}});
  assert.equal(r.status,'NOT_REQUESTED');assert.equal(calls,0);
});
test('labor-only quote skips the catalog entirely',async()=>{
  let calls=0;const r=await matchParts({items:[{name:'labor',itemType:'labor'}]},'123',config,{request:async()=>{calls++;}});
  assert.equal(r.status,'NOT_APPLICABLE');assert.equal(r.matches[0].status,'SKIPPED');assert.equal(calls,0);
});
test('matcher retains row alignment and filters rear parts from front request',async()=>{
  const request=async url=>{
    if(url.startsWith('/api/products'))return {products:[{productId:1,productName:'Brake Pad Set'}]};
    if(url.startsWith('/api/articles'))return {articles:[{articleId:11,articleNo:'F',supplierName:'A'},{articleId:12,articleNo:'R',supplierName:'B'}]};
    return {criteria:[{name:'Fitting Position',value:url.includes('articleId=11')?'Front Axle':'Rear Axle'}]};
  };
  const r=await matchParts({items:[{name:'labor',itemType:'labor'},{name:'فحمات أمامية',itemType:'part'}]},'123',config,{request});
  assert.equal(r.status,'COMPLETED');assert.equal(r.matches.length,2);assert.equal(r.matches[0].status,'SKIPPED');
  assert.equal(r.matches[1].index,1);assert.deepEqual(r.matches[1].articles.map(x=>x.articleNo),['F']);
});
test('a failed article request is not called a successful no-match',async()=>{
  const r=await matchParts({items:[{name:'oil filter'}]},'123',config,{request:async url=>{
    if(url.startsWith('/api/products'))return {products:[{productId:1,productName:'Oil Filter'}]};throw new Error('down');
  }});
  assert.equal(r.status,'PARTIAL');assert.equal(r.matches[0].status,'ERROR');
});
test('global deadline aborts outstanding catalog requests',async()=>{
  let aborted=false;
  const r=await matchParts({items:[{name:'oil filter'}]},'123',config,{timeoutMs:20,request:async(url,{signal})=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('abort','AbortError'));},{once:true});
  })});
  assert.equal(r.status,'TIMED_OUT');assert.equal(aborted,true);
});
test('catalog memoization avoids repeating requests for identical categories',async()=>{
  let articleCalls=0;const r=await matchParts({items:[{name:'oil filter'},{name:'oil filter'}]},'1',config,{request:async url=>{
    if(url.startsWith('/api/products'))return {products:[{productId:1,productName:'Oil Filter'}]};
    articleCalls++;return {articles:[{articleNo:'O1',supplierName:'A'}]};
  }});
  assert.equal(articleCalls,1);assert.equal(r.candidateLines,2);
});
test('VIN candidate names and year come from the matching records',()=>{
  const candidates=readVinCandidates(sampleVehicle(123),'1HGCM82633A004352');
  assert.equal(candidates.length,1);assert.equal(candidates[0].manufacturerName,'Toyota');assert.equal(candidates[0].year,'2020');
});
test('multiple VIN candidates are not silently reduced to the first vehicle',async()=>{
  const data=sampleVehicle(123);data.data.matchingVehicles.array.push({vehicleId:456,manufacturerId:5,modelId:9,year:2021});
  const resolver=createVinResolver({request:async()=>data});
  const result=await resolver.resolve('1HGCM82633A004352');assert.equal(result.selected,null);assert.equal(result.candidates.length,2);
});
test('VIN rejects I/O/Q and invalid lengths without network',async()=>{
  let calls=0;const resolver=createVinResolver({request:async()=>{calls++;}});
  await assert.rejects(resolver.resolve('INVALID-VIN'));assert.equal(calls,0);
});
test('late VIN A cannot overwrite newer VIN B, even if transport ignores cancellation',async()=>{
  const pending=[],updates=[];
  const resolver=createVinResolver({request:()=>new Promise(resolve=>pending.push(resolve)),onUpdate:r=>updates.push(r.vin)});
  const a=resolver.resolve('1HGCM82633A004352');const aHandled=a.catch(e=>e.name);
  const b=resolver.resolve('1HGCM82633A004353');
  pending[1](sampleVehicle(222,'Toyota'));await b;
  pending[0](sampleVehicle(111,'Ford'));assert.equal(await aHandled,'AbortError');
  assert.deepEqual(updates,['1HGCM82633A004353']);
});
test('repeat VIN resolution is cached without repeated provider requests',async()=>{
  let calls=0;const resolver=createVinResolver({request:async()=>{calls++;return sampleVehicle(123);}});
  await resolver.resolve('1HGCM82633A004352');await resolver.resolve('1HGCM82633A004352');assert.equal(calls,1);
});
test('reset invalidates an in-flight VIN response',async()=>{
  let finish,updates=0;const resolver=createVinResolver({request:()=>new Promise(r=>{finish=r;}),onUpdate:()=>updates++});
  const pending=resolver.resolve('1HGCM82633A004352').catch(e=>e.name);resolver.clear();finish(sampleVehicle(123));
  assert.equal(await pending,'AbortError');assert.equal(updates,0);
});
test('all frontend DOM references and translations exist',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size,'duplicate HTML ids');
  for(const match of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(match[1]),'Missing DOM ID '+match[1]);
  for(const match of html.matchAll(/data-i18n="([^"]+)"/g))for(const locale of ['ar-SA','en-SA'])assert.notEqual(t(locale,match[1]),match[1],'Missing '+match[1]);
  assert.ok(!/\son(click|change|keydown)=/.test(html),'Inline handlers are not used');
});
test('all application JavaScript files parse',()=>{
  const base=path.resolve(new URL('..',import.meta.url).pathname);
  for(const file of ['app.js','parts-match.js','vin-ui.js','sw.js','lib/client-core.js','lib/i18n.js','lib/market-config.js']) {
    const result=spawnSync(process.execPath,['--check',path.join(base,file)],{encoding:'utf8'});
    assert.equal(result.status,0,file+'\n'+result.stderr);
  }
});
test('missing products array is an invalid response, not a successful empty catalog',async()=>{
  const r=await matchParts({items:[{name:'oil filter'}]},'123',config,{request:async()=>({unexpected:'shape'})});
  assert.equal(r.status,'FAILED');assert.equal(r.errorCode,'INVALID_RESPONSE');
});
test('unknown articles response is reported as a failed line',async()=>{
  const r=await matchParts({items:[{name:'oil filter'}]},'123',config,{request:async url=>url.startsWith('/api/products')
    ? {products:[{productId:1,productName:'Oil Filter'}]} : {unexpected:'shape'}});
  assert.equal(r.status,'PARTIAL');assert.equal(r.matches[0].errorCode,'INVALID_RESPONSE');
});
