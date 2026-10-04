import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createEbayUsShadowProvider } from '../lib/price-providers/ebay-us.js';
import { getEbayRuntimeReadiness, createConfiguredEbayRuntimeProvider, evaluateEbayPricingRelease } from '../lib/price-providers/ebay-runtime-registry.js';
import { getPriceProviderForMarket, lookupVerifiedPricing, calculateVerifiedOfferSaving } from '../lib/price-provider.js';
import { createPriceCompareHandler } from '../api/price-compare.js';
import { normalizeMatchedListing } from '../lib/matched-listing.js';
import { fixtureNow, vehicle, input, listing, releaseFixture, productionEnv, fixtureTransport } from './fixtures/ebay-runtime-fixture.mjs';
const options = () => ({releaseEvidence:releaseFixture(),now:fixtureNow,clock:()=>fixtureNow});
const lookup = provider => lookupVerifiedPricing({provider,marketConfig:{market:'US',currency:'USD',locale:'en-US'},part:input.part,vehicle,now:fixtureNow});

for (const [name,env] of [
 ['absent configuration',{}],['missing secret',{...productionEnv,EBAY_CLIENT_SECRET:''}],
 ['no production approval',{...productionEnv,EBAY_BUY_PRODUCTION_APPROVED:'false'}],
 ['production provider in preview',{...productionEnv,VERCEL_ENV:'preview'}],
 ['unknown mode',{...productionEnv,WAFFER_PRICE_PROVIDER_MODE:'sandbbox'}],
 ['disabled mode',{...productionEnv,WAFFER_PRICE_PROVIDER_MODE:'disabled'}],
 ['sandbox cannot fall back to production credentials',{...productionEnv,VERCEL_ENV:'preview',WAFFER_PRICE_PROVIDER_MODE:'sandbox'}],
 ['sandbox forbidden in production',{...productionEnv,WAFFER_PRICE_PROVIDER_MODE:'sandbox',EBAY_SANDBOX_CLIENT_ID:'fixture',EBAY_SANDBOX_CLIENT_SECRET:'fixture'}]
]) test(name+' fails closed without network calls',()=>{
 const transport=fixtureTransport();
 assert.equal(createConfiguredEbayRuntimeProvider(env,{...options(),fetchImpl:transport.fetchImpl}),null);
 assert.equal(getEbayRuntimeReadiness(env,options()).ready,false);
 assert.equal(transport.calls.length,0);
});

test('real deployment cannot be enabled with credentials and flags alone',()=>{
 const r=getEbayRuntimeReadiness(productionEnv);
 assert.equal(r.productionReady,false);
 assert.ok(r.blockers.includes('RELEASE_REVIEW_REQUIRED'));
 assert.equal(getPriceProviderForMarket('US',productionEnv),null);
 assert.equal(getPriceProviderForMarket('SA',productionEnv,options()),null);
 const committed=JSON.parse(readFileSync(new URL('../docs/EBAY_PRICING_RELEASE.json',import.meta.url)));
 assert.equal(committed.status,'PENDING'); assert.equal(committed.sample,null);
});

for(const [name,mutate] of [
 ['sandbox evidence',r=>{r.environment='sandbox';}],['synthetic evidence',r=>{r.evidenceKind='SYNTHETIC';}],
 ['missing approval evidence',r=>{r.productionApprovalReference=null;}],['unreviewed evidence',r=>{r.reviewedBy=null;}],
 ['expired evidence',r=>{r.expiresAt=new Date(fixtureNow-1).toISOString();}],
 ['future review',r=>{r.reviewedAt=new Date(fixtureNow+1).toISOString();}],
 ['changed sample',r=>{r.sample.cases.pop();}],['duplicate cases',r=>{r.sample.cases[0].caseId=r.sample.cases[1].caseId;r.sampleSha256=createHash('sha256').update(JSON.stringify(r.sample)).digest('hex');}],
 ['stale captured evidence',r=>{r.sample.cases[0].checkedAt='2025-01-01T00:00:00Z';r.sampleSha256=createHash('sha256').update(JSON.stringify(r.sample)).digest('hex');}]
])test(name+' cannot open production gate',()=>{
 const release=releaseFixture();mutate(release);
 assert.equal(evaluateEbayPricingRelease(release,{now:fixtureNow}).ready,false);
});

test('incomplete field-test evidence blocks even a reviewed fixture sample',()=>{
 const r=evaluateEbayPricingRelease(releaseFixture(),{now:fixtureNow,fieldTestResults:{scenarios:[]}});
 assert.equal(r.ready,false);assert.ok(r.blockers.includes('FIELD_TEST_INCOMPLETE'));
});

test('SYNTHETIC transport travels through production registry, adapter, contract and API without becoming savings',async()=>{
 const transport=fixtureTransport();
 const provider=getPriceProviderForMarket('US',productionEnv,{...options(),fetchImpl:transport.fetchImpl});
 assert.ok(provider);
 const handler=createPriceCompareHandler({lookupPricing:args=>lookupVerifiedPricing({...args,provider,now:fixtureNow})});
 let body;let status;
 const res={setHeader(){},status(n){status=n;return this;},json(value){body=value;return value;}};
 await handler({method:'POST',body:{partName:input.part.name,partNumber:input.part.number,manufacturer:input.part.manufacturer,vehicle,market:'US',currency:'USD',quantity:2,workshopPrice:90}},res);
 assert.equal(status,200);assert.equal(body.status,'MATCHED_LISTING_TOTAL_UNVERIFIED');
 assert.equal(body.matchedListing.itemPrice,40);assert.equal(body.matchedListing.requestedQuantity,2);
 assert.equal(body.matchedListing.shippingEstimate,5);assert.equal(body.matchedListing.totalPrice,null);
 assert.equal(body.matchedListing.quantityAvailability,'CONFIRMED');
 assert.equal(body.bestOffer,null);assert.equal(body.marketPrice.median,null);assert.equal(body.saving.amount,null);
 assert.equal(body.saving.status,'NOT_CALCULATED');
 assert.ok(transport.calls.every(call=>call.url.startsWith('https://api.ebay.com/')&&call.redirect==='error'));
 assert.ok(!JSON.stringify(body).includes('synthetic-secret'));
});

test('Sandbox registry uses only sandbox credentials/hosts and cannot fill live fields',async()=>{
 const transport=fixtureTransport({environment:'sandbox'});
 const env={WAFFER_PRICE_PROVIDER_MODE:'sandbox',VERCEL_ENV:'preview',EBAY_SANDBOX_CLIENT_ID:'fixture',EBAY_SANDBOX_CLIENT_SECRET:'fixture'};
 const provider=getPriceProviderForMarket('US',env,{fetchImpl:transport.fetchImpl,clock:()=>fixtureNow});
 const result=await lookup(provider);
 assert.equal(result.status,'SANDBOX_ONLY');assert.equal(result.bestOffer,null);assert.equal(result.marketRange,null);assert.equal(result.matchedListing,null);
 assert.equal(result.sandboxPreview.environment,'sandbox');
 assert.ok(transport.calls.every(call=>call.url.startsWith('https://api.sandbox.ebay.com/')));
 assert.equal(getEbayRuntimeReadiness(env).productionReady,false);
});

for(const [name,config,expected] of [
 ['empty results',{empty:true},'NO_VERIFIED_PRICE'],['incompatible part',{compatibility:'NOT_COMPATIBLE'},'NO_VERIFIED_PRICE'],
 ['unverified compatibility',{compatibility:'UNDETERMINED'},'NO_VERIFIED_PRICE'],
 ['wrong MPN',{item:{mpn:'OTHER'}},'NO_VERIFIED_PRICE'],['wrong manufacturer',{item:{brand:'OTHER'}},'NO_VERIFIED_PRICE'],
 ['inferred MPN only',{item:{mpn:null,inferredMpn:'FIXTURE-123'}},'NO_VERIFIED_PRICE'],
 ['wrong currency',{item:{price:{value:'40',currency:'EUR'}}},'NO_VERIFIED_PRICE'],
 ['null price',{item:{price:{value:null,currency:'USD'}}},'NO_VERIFIED_PRICE'],
 ['auction only',{item:{buyingOptions:['AUCTION']}},'NO_VERIFIED_PRICE'],
 ['out of stock',{item:{estimatedAvailabilities:[{estimatedAvailabilityStatus:'OUT_OF_STOCK'}]}},'NO_VERIFIED_PRICE'],
 ['off-site listing',{item:{itemWebUrl:'https://evil.example/itm/1'}},'NO_VERIFIED_PRICE'],
 ['missing shipping',{item:{shippingOptions:[]}},'MATCHED_LISTING'],
 ['unknown stock quantity',{item:{estimatedAvailabilities:[{estimatedAvailabilityStatus:'IN_STOCK'}]}},'MATCHED_LISTING']
])test(name+' is handled conservatively',async()=>{
 const transport=fixtureTransport(config);
 const provider=createConfiguredEbayRuntimeProvider(productionEnv,{...options(),fetchImpl:transport.fetchImpl});
 const result=await lookup(provider);
 assert.equal(result.status,expected);assert.equal(result.bestOffer,null);
 assert.equal(calculateVerifiedOfferSaving({workshopUnitPrice:100,bestOffer:result.bestOffer}).amount,null);
 if(name==='missing shipping') assert.equal(result.matchedListing.shippingEstimate,null);
 if(name==='unknown stock quantity') assert.equal(result.matchedListing.quantityAvailability,'UNCONFIRMED');
});

test('missing brand and incomplete vehicle cannot trigger a claimed verified listing',async()=>{
 const transport=fixtureTransport();
 const provider=createConfiguredEbayRuntimeProvider(productionEnv,{...options(),fetchImpl:transport.fetchImpl});
 const result=await lookupVerifiedPricing({provider,marketConfig:{market:'US',currency:'USD'},part:{number:'FIXTURE-123'},vehicle,now:fixtureNow});
 assert.equal(result.status,'NO_VERIFIED_PRICE');assert.equal(transport.calls.length,0);
 const incomplete=await lookupVerifiedPricing({provider,marketConfig:{market:'US',currency:'USD'},part:input.part,vehicle:{},now:fixtureNow});
 assert.equal(incomplete.status,'INSUFFICIENT_IDENTITY');assert.equal(transport.calls.length,0);
});

test('one transient provider retry succeeds, persistent failure is bounded, auth failure is not retried',async()=>{
 for(const [config,status,count] of [[{retryFirst:true},'MATCHED_LISTING',2],[{status:503},'PROVIDER_ERROR',2],[{status:401},'PROVIDER_ERROR',1]]){
  const transport=fixtureTransport(config);
  const provider=createConfiguredEbayRuntimeProvider(productionEnv,{...options(),fetchImpl:transport.fetchImpl});
  assert.equal((await lookup(provider)).status,status);
  assert.equal(transport.calls.filter(c=>c.url.includes('/item_summary/search?')).length,count);
 }
});

test('hung transport is aborted and priced data is withheld even if transport ignores signal',async()=>{
 const transport=fixtureTransport({delay:true});
 const provider=createEbayUsShadowProvider({clientId:'fixture',clientSecret:'fixture',productionAccessApproved:true,fetchImpl:transport.fetchImpl,requestTimeoutMs:5});
 const started=Date.now();
 assert.equal((await lookup(provider)).status,'PROVIDER_TIMEOUT');assert.ok(Date.now()-started<500);
});

for(const age of [300001,-30001])test('stale or future price '+age+' is rejected',async()=>{
 const provider={id:'synthetic',environment:'production',async lookup(){return{checkedAt:new Date(fixtureNow-age).toISOString(),matchedListing:listing()};}};
 const result=await lookup(provider);
 assert.equal(result.status,'STALE_PRICE');assert.equal(result.matchedListing,null);assert.equal(result.bestOffer,null);
});

test('invalid adapter environment cannot silently choose production',()=>{
 assert.throws(()=>createEbayUsShadowProvider({environment:'sandbbox'}),/EBAY_ENVIRONMENT_INVALID/);
});

test('matched listing URLs and partial prices cannot be misrepresented as final totals',()=>{
 assert.equal(normalizeMatchedListing({...listing(),sourceUrl:'https://www.ebay.com.evil.example/itm/1'},{requestedPartNumber:'FIXTURE-123'}),null);
 const normalized=normalizeMatchedListing({...listing(),totalPrice:45,totalVerified:true,taxStatus:'INCLUDED'},{requestedPartNumber:'FIXTURE-123'});
 assert.equal(normalized.totalPrice,null);assert.equal(normalized.totalVerified,false);assert.equal(normalized.taxStatus,'UNKNOWN');
});


test('explicit synthetic provenance, missing brand binding and malformed samples fail closed',()=>{
 for(const mutate of [r=>{r.sample.synthetic=true;},r=>{r.sample.cases=[null];},r=>{r.sample.cases.forEach(c=>c.matchedListing.manufacturer='');},r=>{r.sample.cases.forEach(c=>c.matchedListing.fitmentEvidence.trim='SE');},r=>{r.sample.cases.forEach(c=>c.requestedPartNumber='PART-1');}]){
  const release=releaseFixture();mutate(release);release.sampleSha256=createHash('sha256').update(JSON.stringify(release.sample)).digest('hex');
  assert.equal(evaluateEbayPricingRelease(release,{now:fixtureNow}).ready,false);
 }
 assert.equal(evaluateEbayPricingRelease(null).ready,false);
});

test('Retry-After HTTP date beyond budget prevents a premature second request',async()=>{
 const transport=fixtureTransport({status:429,retryAfter:new Date(fixtureNow+3600000).toUTCString()});
 const provider=createConfiguredEbayRuntimeProvider(productionEnv,{...options(),fetchImpl:transport.fetchImpl});
 assert.equal((await lookup(provider)).status,'PROVIDER_ERROR');
 assert.equal(transport.calls.filter(c=>c.url.includes('/item_summary/search?')).length,1);
});

test('runtime reuses token-cache owner until credentials or readiness change',()=>{
 const env={WAFFER_PRICE_PROVIDER_MODE:'sandbox',VERCEL_ENV:'preview',EBAY_SANDBOX_CLIENT_ID:'synthetic',EBAY_SANDBOX_CLIENT_SECRET:'synthetic'};
 const first=getPriceProviderForMarket('US',env);
 assert.equal(first,getPriceProviderForMarket('US',env));
 assert.notEqual(first,getPriceProviderForMarket('US',{...env,EBAY_SANDBOX_CLIENT_SECRET:'changed-synthetic'}));
 assert.equal(getPriceProviderForMarket('US',{...env,WAFFER_PRICE_PROVIDER_MODE:'disabled'}),null);
});


test('coverage allowance never admits contradictory Sandbox, brand or fitment evidence',()=>{
 for(const mutate of [c=>{c.matchedListing.environment='sandbox';},c=>{c.matchedListing.manufacturer='Wrong';},c=>{c.matchedListing.fitmentEvidence.year='2000';},c=>{c.synthetic=true;},c=>{c.evidenceKind='SYNTHETIC_TRANSPORT';}]){
  const release=releaseFixture();release.sample.cases.slice(0,4).forEach(mutate);release.sampleSha256=createHash('sha256').update(JSON.stringify(release.sample)).digest('hex');
  const result=evaluateEbayPricingRelease(release,{now:fixtureNow});
  assert.equal(result.ready,false);assert.ok(result.blockers.includes('PILOT_CASE_EVIDENCE_INVALID'));
 }
 const release=releaseFixture();release.sample.cases.slice(0,4).forEach(c=>{c.matchedListing=null;c.runnerStatus='NO_VERIFIED_DATA';});release.sampleSha256=createHash('sha256').update(JSON.stringify(release.sample)).digest('hex');
 assert.equal(evaluateEbayPricingRelease(release,{now:fixtureNow}).ready,true);
});


test('an upstream 401 invalidates the token for the next lookup without replaying a denied request',async()=>{
 const transport=fixtureTransport({status:401});
 const provider=createConfiguredEbayRuntimeProvider(productionEnv,{...options(),fetchImpl:transport.fetchImpl});
 for(let i=0;i<2;i++) assert.equal((await lookup(provider)).status,'PROVIDER_ERROR');
 assert.equal(transport.calls.filter(c=>c.url.includes('/oauth2/token')).length,2);
 assert.equal(transport.calls.filter(c=>c.url.includes('/item_summary/search?')).length,2);
});
