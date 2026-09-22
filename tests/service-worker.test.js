import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const origin='https://waffer.test';
const CACHE='waffer-shell-stability-20260922';
function harness() {
  const listeners={}, stores=new Map(), deleted=[];
  let fetches=0, offline=false, status=200;
  const key=request=>typeof request==='string'?request:request.url;
  const cacheFor=name=>{
    if(!stores.has(name))stores.set(name,new Map());
    const data=stores.get(name);
    return {addAll:async urls=>urls.forEach(url=>data.set(origin+url,{cached:url})),
      put:async(request,response)=>data.set(key(request),response),match:async request=>data.get(key(request))};
  };
  const self={location:{origin},addEventListener:(event,fn)=>listeners[event]=fn,skipWaiting:()=>{},clients:{claim:async()=>{}}};
  const response=()=>({ok:status>=200&&status<300,type:'basic',status,clone(){return {copy:true,status:this.status};}});
  vm.runInNewContext(source,{self,URL,Response,caches:{open:async name=>cacheFor(name),keys:async()=>[...stores.keys()],delete:async name=>{deleted.push(name);stores.delete(name);}},fetch:async()=>{fetches++;if(offline)throw new Error('offline');return response();}});
  const request=(url,method='GET')=>{
    let reply=null;listeners.fetch({request:{url,method},respondWith:p=>reply=p});return reply;
  };
  return {listeners,stores,deleted,request,setOffline:v=>offline=v,setStatus:v=>status=v,fetches:()=>fetches};
}
test('service worker ignores all APIs, external URLs, writes, and unknown query strings',()=>{
  const h=harness();
  for(const [url,method] of [[origin+'/api/analyze','POST'],[origin+'/api/health','GET'],['https://other.test/app.js','GET'],[origin+'/app.js?vin=secret','GET'],[origin+'/account','GET']])
    assert.equal(h.request(url,method),null,url);
  assert.equal(h.fetches(),0);
});
test('successful shell asset is cached; failed response is not cached',async()=>{
  const h=harness();await h.request(origin+'/app.js');assert.equal(h.stores.get(CACHE).get(origin+'/app.js').status,200);
  h.setStatus(404);await h.request(origin+'/index.html');assert.equal(h.stores.get(CACHE).has(origin+'/index.html'),false);
});
test('offline missing JavaScript never falls back to HTML',async()=>{
  const h=harness();h.setOffline(true);const response=await h.request(origin+'/app.js');assert.equal(response.type,'error');
});
test('activation only deletes Waffer-owned caches',async()=>{
  const h=harness();h.stores.set('other-app-private-cache',new Map());h.stores.set('waffer-shell-v19',new Map());h.stores.set(CACHE,new Map());
  let finished;h.listeners.activate({waitUntil:p=>finished=p});await finished;
  assert.deepEqual(h.deleted,['waffer-shell-v19']);assert.ok(h.stores.has('other-app-private-cache'));
});
test('install precaches the versioned module dependencies and never API paths',async()=>{
  const h=harness();let finished;h.listeners.install({waitUntil:p=>finished=p});await finished;
  const keys=[...h.stores.get(CACHE).keys()];assert.ok(keys.includes(origin+'/lib/i18n.js?v=20260922-stability'));
  assert.ok(keys.every(key=>!key.includes('/api/')));
});
