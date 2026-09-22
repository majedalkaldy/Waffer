import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { requestJSON, RunScope } from '../lib/client-http.js';
import { MAX_UPLOAD_BYTES, validateFile, validVIN, idOf, vehicleCandidates, classifyPart, requestedAxle, criteriaAxle, lineType, matchProduct, articleKey, shortlist, arrayAt, validateAnalysis } from '../lib/client-core.js';
import { matchCatalog } from '../lib/client-matcher.js';
const VIN='AAAAAAAAAAAAAAAAA';
const vehicle={ vehicleId:'42',vin:VIN };
const part = name => ({ name, itemType:'part' });
const json = (data,status=200) => ({ ok:status>=200 && status<300,status,json:async()=>data });
const abortable = (signal,delay=1000,data={}) => new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve(data);},delay);
  function abort(){clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));}
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
});
const analysis=()=>({total:'غير مذكور',status:'Needs verification',transparency:0,identityConfidence:0,compatibilityConfidence:0,priceConfidence:0,overallConfidence:0,missing:[],conflicts:[],nextActions:[],items:[part('Oil filter')]});

test('file validation: absent and empty rejected',()=>{assert.equal(validateFile().code,'NO_FILE');assert.equal(validateFile({size:0,type:'image/png'}).code,'EMPTY_FILE');});
test('file validation: safe payload boundary',()=>{assert.equal(validateFile({size:MAX_UPLOAD_BYTES,name:'a.png',type:'image/png'}).code,null);assert.equal(validateFile({size:MAX_UPLOAD_BYTES+1,type:'image/png'}).code,'FILE_TOO_LARGE');});
test('base64 encoded maximum remains below request budget',()=>assert.ok(4*Math.ceil(MAX_UPLOAD_BYTES/3)+10000<4400000));
test('Android empty MIME may infer a recognized extension',()=>assert.equal(validateFile({size:10,name:'QUOTE.PDF',type:''}).mimeType,'application/pdf'));
test('unknown or conflicting unsupported MIME is rejected',()=>{assert.equal(validateFile({size:10,name:'a.png',type:'text/html'}).code,'UNSUPPORTED_FILE');assert.equal(validateFile({size:10,name:'a.exe'}).code,'UNSUPPORTED_FILE');});
test('VIN validation is syntax only and excludes I O Q',()=>{assert.ok(validVIN(VIN));assert.ok(!validVIN('I'.repeat(17)));assert.ok(!validVIN(VIN.slice(1)));});
test('IDs are positive digit strings, not NaN or objects',()=>{assert.equal(idOf('123'),'123');for(const x of ['0','-1','NaN','12x',{},null])assert.equal(idOf(x),null);});
test('known array envelopes are accepted; unknown is an error',()=>{assert.deepEqual(arrayAt({data:{criteria:{array:[]}}},'criteria'),[]);assert.throws(()=>arrayAt({unexpected:[]},'criteria'));});
test('multiple VIN candidates are preserved, never first-selected',()=>{const c=vehicleCandidates({data:{matchingVehicles:{array:[{vehicleId:1},{vehicleId:2}]}}});assert.equal(c.length,2);});
test('VIN maps linked manufacturer/model and exact year',()=>{const c=vehicleCandidates({matchingVehicles:[{vehicleId:1,manuId:8,modelId:7,year:2020}],matchingManufacturers:[{manuId:9,manuName:'Wrong'},{manuId:8,manuName:'Toyota'}],matchingModels:[{modelId:7,modelName:'Camry'}]})[0];assert.equal(c.manufacturerName,'Toyota');assert.equal(c.modelName,'Camry');assert.equal(c.year,'2020');});
test('VIN never infers year from production range',()=>{assert.equal(vehicleCandidates({matchingVehicles:[{vehicleId:1,yearOfConstructionFrom:2010,yearOfConstructionTo:2015}]})[0].year,'');});
test('unlinked VIN manufacturer is not assigned from first result',()=>{const c=vehicleCandidates({matchingVehicles:[{vehicleId:1,manuId:99}],matchingManufacturers:[{manuId:1,manuName:'Wrong'}]})[0];assert.equal(c.manufacturerName,'');});
test('duplicate VIN candidate IDs removed',()=>assert.equal(vehicleCandidates({matchingVehicles:[{id:1},{id:1}]}).length,1));
test('cabins do not accidentally match engine air filters',()=>assert.equal(classifyPart('cabin air filter'),'cabin_filter'));
test('Arabic aliases and diacritics supported',()=>assert.equal(classifyPart('فَحْمَات أمامية'),'brake_pad'));
test('pad accessories are not the pad',()=>assert.equal(classifyPart('Brake pad wear indicator'),'unknown'));
test('front and rear simultaneously is ambiguous',()=>assert.equal(requestedAxle('فحمات أمامية وخلفية front rear'),'ambiguous'));
test('contradictory criteria cannot verify front',()=>assert.equal(criteriaAxle([{criteriaName:'Fitting Position',criteriaValue:'Front Axle'},{criteriaName:'Fitting Position',criteriaValue:'Rear Axle'}]),'ambiguous'));
test('no fitting-position evidence means unknown',()=>assert.equal(criteriaAxle([{criteriaName:'Notes',criteriaValue:'Front Axle'}]),null));
test('labor lines overridden even when AI mislabeled part',()=>assert.equal(lineType({name:'أجرة تركيب فحمات',itemType:'part'}),'labor'));
test('missing item type is unknown rather than silently part',()=>assert.equal(lineType({name:'something'}),'unknown'));
test('known service is not sent to parts',()=>assert.equal(lineType({name:'ضبط زوايا',itemType:'part'}),'service'));
test('bad catalog product ID cannot match',()=>assert.equal(matchProduct(part('oil filter'),[{productId:null,productName:'Oil filter'}]),null));
test('unknown part names require exact match, not partial overlap',()=>assert.equal(matchProduct(part('unrecognized valve'),[{productId:1,productName:'valve'}]),null));
test('supplier+part number identities are distinct',()=>assert.notEqual(articleKey({articleNo:'123',supplierName:'A'}),articleKey({articleNo:'123',supplierName:'B'})));
test('one supplier shortlist never repeats a cloned object',()=>{const a=shortlist([{articleNo:'A',supplierName:'S'},{articleNo:'B',supplierName:'S'}]);assert.equal(a.length,2);assert.equal(new Set(a.map(articleKey)).size,2);});
test('shortlist prefers diversity and caps at three',()=>{const a=shortlist([{articleNo:'1',supplierName:'A'},{articleNo:'2',supplierName:'A'},{articleNo:'3',supplierName:'B'},{articleNo:'4',supplierName:'C'}],99);assert.deepEqual(a.map(x=>x.supplierName),['A','B','C']);});
test('Toe link / OE text never classifies genuine or OEM',()=>assert.equal(shortlist([{articleId:1,articleProductName:'Toe link OE original equipment'}])[0].qualityStatus,'UNVERIFIED'));
test('zero confidence and unavailable printed total are valid extraction outcomes',()=>assert.deepEqual(validateAnalysis(analysis()),[]));
test('missing scores are rejected before client rendering',()=>{const a=analysis();delete a.transparency;assert.ok(validateAnalysis(a).includes('transparency'));});
test('null or string line items are invalid',()=>{const a=analysis();a.items=[null,'text'];assert.equal(validateAnalysis(a).filter(x=>x.startsWith('items.')).length,2);});
test('invalid score types and array strings are rejected',()=>{const a=analysis();a.priceConfidence='100';a.missing='none';assert.ok(validateAnalysis(a).includes('missing'));assert.ok(validateAnalysis(a).includes('priceConfidence'));});
test('server-invalid contract stays invalid on client',()=>{const a=analysis();a.acceptance={schemaValid:false};assert.ok(validateAnalysis(a).includes('server.schemaValid'));});
test('last-run wins, including reset',()=>{const s=new RunScope();const a=s.begin();const b=s.begin();assert.equal(a.current(),false);assert.equal(a.signal.aborted,true);assert.equal(b.current(),true);s.cancel();assert.equal(b.current(),false);});
test('HTTP error stays error, never becomes empty match',async()=>{await assert.rejects(requestJSON('/x',{fetchImpl:async()=>json({code:'RATE_LIMITED'},429)}),{code:'RATE_LIMITED',status:429});});
test('invalid JSON stays distinct from HTTP errors',async()=>{await assert.rejects(requestJSON('/x',{fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw Error('HTML');}})}),{code:'INVALID_RESPONSE'});});
test('request timeout covers body after headers arrive',async()=>{let aborted=false;await assert.rejects(requestJSON('/x',{timeoutMs:20,fetchImpl:async(_,o)=>{o.signal.addEventListener('abort',()=>{aborted=true;});return{ok:true,status:200,json:()=>abortable(o.signal)};}}),{code:'TIMEOUT'});assert.equal(aborted,true);});
test('external cancellation stays AbortError',async()=>{const c=new AbortController();const p=requestJSON('/x',{signal:c.signal,fetchImpl:(_,o)=>abortable(o.signal)});c.abort();await assert.rejects(p,{name:'AbortError'});});
test('successful requests clear timeout',async()=>assert.deepEqual(await requestJSON('/x',{timeoutMs:20,fetchImpl:async()=>json({ok:true})}),{ok:true}));
test('no VIN does not throw ReferenceError or call provider',async()=>{let calls=0;const r=await matchCatalog({items:[part('oil filter')],fetchImpl:()=>{calls++;}});assert.equal(r.status,'NOT_APPLICABLE');assert.equal(calls,0);});
test('labor-only quote is index-preserved and sends no requests',async()=>{const r=await matchCatalog({vehicle,items:[{name:'Labor',itemType:'labor'}],fetchImpl:()=>{throw Error('Must not fetch');}});assert.equal(r.status,'NO_PART_ITEMS');assert.equal(r.results[0].index,0);assert.equal(r.results[0].status,'SKIPPED');});
test('unsupported market does not silently use Saudi data',async()=>assert.equal((await matchCatalog({vehicle,context:{market:'US'},items:[part('oil filter')],fetchImpl:()=>{throw Error('Must not fetch');}})).status,'UNSUPPORTED_MARKET'));
test('mixed quote retains source indexes and shared queries once',async()=>{
 const calls=[];const r=await matchCatalog({vehicle,items:[{name:'Labor',itemType:'labor'},part('oil filter'),part('oil filter')],fetchImpl:async u=>{calls.push(u);return u.startsWith('/api/products')?json({products:[{productId:3,productName:'Oil filter'}]}):json({articles:[{articleId:4,articleNo:'X',supplierName:'A'}]});}});
 assert.equal(r.status,'COMPLETED');assert.equal(r.results.length,3);assert.equal(r.results[0].status,'SKIPPED');assert.equal(r.results[1].index,1);assert.equal(calls.length,2);assert.equal(r.itemsWithCandidates,2);
});
test('a failed article lookup is PARTIAL, not verified success',async()=>{
 const r=await matchCatalog({vehicle,items:[part('oil filter')],fetchImpl:async u=>u.startsWith('/api/products')?json({products:[{productId:1,productName:'Oil filter'}]}):json({},503)});
 assert.equal(r.status,'PARTIAL');assert.equal(r.results[0].status,'ERROR');assert.equal(r.itemsWithCandidates,0);
});
test('catalog with no products is completed with zero candidates',async()=>{const r=await matchCatalog({vehicle,items:[part('oil filter')],fetchImpl:async()=>json({products:[]})});assert.equal(r.status,'COMPLETED');assert.equal(r.results[0].status,'NO_PRODUCT_MATCH');});
test('front requested excludes rear and missing criteria',async()=>{
 const r=await matchCatalog({vehicle,items:[part('فحمات أمامية')],fetchImpl:async u=>{
 if(u.startsWith('/api/products'))return json({products:[{productId:1,productName:'Brake pad set'}]});
 if(u.startsWith('/api/articles'))return json({articles:[{articleId:1,articleNo:'F',supplierName:'A'},{articleId:2,articleNo:'R',supplierName:'B'},{articleId:3,articleNo:'U',supplierName:'C'}]});
 const id=new URL(u,'http://local').searchParams.get('articleId');return json({criteria:id==='3'?[]:[{criteriaName:'Fitting Position',criteriaValue:id==='1'?'Front Axle':'Rear Axle'}]});}});
 assert.deepEqual(r.results[0].articles.map(a=>a.articleNo),['F']);assert.equal(r.results[0].axleVerified,1);assert.equal(r.results[0].inspected,3);
});
test('concurrent criteria requests never exceed three',async()=>{
 let concurrent=0,max=0;const r=await matchCatalog({vehicle,items:[part('front brake pads')],fetchImpl:async u=>{
 if(u.startsWith('/api/products'))return json({products:[{productId:1,productName:'Brake pad set'}]});
 if(u.startsWith('/api/articles'))return json({articles:Array.from({length:20},(_,i)=>({articleId:i+1}))});
 concurrent++;max=Math.max(max,concurrent);await new Promise(r=>setTimeout(r,3));concurrent--;return json({criteria:[{criteriaName:'Fitting Position',criteriaValue:'Front Axle'}]});}});
 assert.ok(max<=3);assert.equal(r.results[0].inspected,12);assert.ok(r.results[0].articles.length<=3);
});
test('ambiguous front and rear does not return a single front part',async()=>{const r=await matchCatalog({vehicle,items:[part('front rear brake pads')],fetchImpl:async()=>json({products:[{productId:1,productName:'Brake pad set'}]})});assert.equal(r.results[0].status,'POSITION_AMBIGUOUS');assert.equal(r.results[0].articles.length,0);});
test('global deadline aborts the actual network operation',async()=>{let aborted=false;const r=await matchCatalog({vehicle,items:[part('oil filter')],totalTimeoutMs:15,fetchImpl:(_,o)=>{o.signal.addEventListener('abort',()=>{aborted=true;});return abortable(o.signal);}});assert.equal(r.status,'TIMED_OUT');assert.ok(aborted);});
test('cancelled catalog run is explicitly CANCELED',async()=>{const c=new AbortController();const p=matchCatalog({vehicle,items:[part('oil filter')],signal:c.signal,fetchImpl:(_,o)=>abortable(o.signal)});c.abort();assert.equal((await p).status,'CANCELED');});
test('service worker never intercepts API, external or query requests',()=>{
 const handlers={};const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 vm.runInNewContext(source,{self:{location:{origin:'https://local'},addEventListener:(key,fn)=>handlers[key]=fn},URL,Response});
 for(const [url,method] of [['https://local/api/analyze','POST'],['https://local/api/health','GET'],['https://other/x','GET'],['https://local/ui/app.js?secret=x','GET'],['https://local/unknown','GET']]){
 let used=false;handlers.fetch({request:{url,method},respondWith:()=>{used=true;}});assert.equal(used,false);
 }
});
