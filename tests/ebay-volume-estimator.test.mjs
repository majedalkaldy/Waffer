import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateEbayApiVolume } from '../lib/price-providers/ebay-volume-estimator.js';

test('eBay volume estimator derives daily and peak-hour calls from explicit assumptions', () => {
  const report=estimateEbayApiVolume({
    dailyActiveUsers:100,
    searchesPerUser:2,
    candidateItemsInspectedPerSearch:3,
    fitmentEligibleCandidateRate:0.5,
    taxonomyCacheMissRate:0.25,
    peakHourShare:0.2
  });

  assert.equal(report.valid,true);
  assert.deepEqual(report.daily,{
    browseSearch:200,
    browseGetItem:600,
    browseCheckCompatibility:300,
    taxonomyGetCompatibilityProperties:50,
    taxonomyGetCompatibilityPropertyValues:200,
    total:1350
  });
  assert.deepEqual(report.peakHourly,{
    browseSearch:40,
    browseGetItem:120,
    browseCheckCompatibility:60,
    taxonomyGetCompatibilityProperties:10,
    taxonomyGetCompatibilityPropertyValues:40,
    total:270
  });
});

test('volume estimator refuses invented traffic assumptions', () => {
  const report=estimateEbayApiVolume({});
  assert.equal(report.valid,false);
  assert.ok(report.errors.includes('DAILY_ACTIVE_USERS_REQUIRED'));
  assert.equal(report.daily,null);
});

const base = {dailyActiveUsers: 1, searchesPerUser: 1, candidateItemsInspectedPerSearch: 10,
  fitmentEligibleCandidateRate: 1, taxonomyCacheMissRate: 1, peakHourShare: 0.5};

test('explicit cold-category/retry/OAuth scenario includes all ten categories and independent token budget', () => {
  const r = estimateEbayApiVolume({...base, taxonomyCategoriesPerSearch: 10, automaticRetryRate: 1, oauthTokenRequests: 3});
  assert.equal(r.planningInputsComplete, true);
  assert.equal(r.evidenceType, 'HYPOTHETICAL_PLAN_NOT_ACTUAL_TRAFFIC');
  assert.equal(r.daily.taxonomyGetCompatibilityProperties, 10);
  assert.equal(r.daily.taxonomyGetCompatibilityPropertyValues, 40);
  assert.equal(r.daily.total, 71);
  assert.equal(r.dailyRequestBudget.automaticRetryRequests, 71);
  assert.equal(r.dailyRequestBudget.oauthTokenRequests, 3);
  assert.equal(r.dailyRequestBudget.total, 145);
  assert.equal(r.peakHourlyRequestBudget.oauthTokenRequests, 3);
  assert.equal(r.peakHourlyRequestBudget.total, 75);
});

test('legacy defaults are explicitly incomplete and fractional retry counts round up by endpoint', () => {
  const legacy = estimateEbayApiVolume(base);
  assert.equal(legacy.planningInputsComplete, false);
  assert.equal(legacy.dailyRequestBudget.total, legacy.daily.total);
  const r = estimateEbayApiVolume({...base, taxonomyCategoriesPerSearch: 1, automaticRetryRate: 0.1, oauthTokenRequests: 0});
  assert.equal(r.dailyRequestBudget.automaticRetryRequests, 5);
  assert.equal(r.dailyRequestBudget.total, 31);
  assert.equal(r.dailyRequestBudget.oauthTokenRequests, 0);
});

test('new planning assumptions and unsafe totals fail closed', () => {
  for (const patch of [{taxonomyCategoriesPerSearch: 11}, {taxonomyCategoriesPerSearch: 0},
    {taxonomyCategoriesPerSearch: 4, candidateItemsInspectedPerSearch: 3},
    {automaticRetryRate: -1}, {automaticRetryRate: 1.1}, {automaticRetryRate: null},
    {oauthTokenRequests: -1}, {oauthTokenRequests: 1.5}, {oauthTokenRequests: null},
    {dailyActiveUsers: 1e308}, {oauthTokenRequests: Number.MAX_SAFE_INTEGER}]) {
    assert.equal(estimateEbayApiVolume({...base,...patch}).valid, false, JSON.stringify(patch));
  }
});

test('cold ten-category budget matches actual adapter traversal using only injected synthetic transport', async () => {
  const {createEbayUsShadowProvider} = await import('../lib/price-providers/ebay-us.js');
  const attempts = new Map();
  let requests = 0;
  const values = {Make:'Ford', Model:'F-150', Trim:'XLT', Engine:'3.5L V6'};
  const fetchImpl = async raw => {
    requests++;
    const url = new URL(raw);
    const token = url.pathname.includes('/oauth2/token');
    const count = (attempts.get(url.href) || 0) + 1;
    attempts.set(url.href, count);
    if (!token && count === 1) return {ok:false, status:503, headers:{get:()=> '0.001'}};
    let payload;
    if (token) payload = {access_token:'synthetic-only', expires_in:7200};
    else if (url.pathname.endsWith('/item_summary/search')) payload = {itemSummaries:Array.from({length:10}, (_,i)=>({itemId:String(i), categoryId:String(100+i)}))};
    else if (url.pathname.endsWith('/get_compatibility_properties')) payload = {compatibilityProperties:['Year','Make','Model','Trim','Engine'].map(name=>({name}))};
    else if (url.pathname.endsWith('/get_compatibility_property_values')) payload = {compatibilityPropertyValues:[{value:values[url.searchParams.get('compatibility_property')]}]};
    else if (url.pathname.endsWith('/check_compatibility')) payload = {compatibilityStatus:'NOT_COMPATIBLE'};
    else if (/\/item\/\d+$/.test(url.pathname)) payload = {mpn:'TEST-123', brand:'Test', buyingOptions:['FIXED_PRICE'], estimatedAvailabilities:[{estimatedAvailabilityStatus:'IN_STOCK'}]};
    else throw new Error('Unexpected synthetic request: '+url.pathname);
    return {ok:true,status:200,headers:{get:()=>null},json:async()=>payload};
  };
  const provider = createEbayUsShadowProvider({clientId:'synthetic',clientSecret:'synthetic',productionAccessApproved:true,fetchImpl});
  await provider.lookup({market:'US',currency:'USD',part:{number:'TEST-123',manufacturer:'Test'},vehicle:{year:2024,make:'Ford',model:'F-150',trim:'XLT',engine:'3.5L V6'}});
  const estimate = estimateEbayApiVolume({...base,taxonomyCategoriesPerSearch:10,automaticRetryRate:1,oauthTokenRequests:1});
  assert.equal(requests,143);
  assert.equal(requests,estimate.dailyRequestBudget.total);
  assert.equal([...attempts.entries()].filter(([url])=>url.includes('get_compatibility_properties')).length,10);
  assert.equal([...attempts.entries()].find(([url])=>url.includes('/oauth2/token'))[1],1);
});
