import test from 'node:test';
import assert from 'node:assert/strict';
import {retainFreshPricing,nextPricingExpiry,summarizeVerifiedPricing} from '../lib/pricing-client.js';
const now=Date.parse('2026-10-06T14:00:00.000Z');
const entry=checkedAt=>({index:0,data:{pricingProvider:{checkedAt},matchedListing:{seller:'synthetic-private-seller',sourceUrl:'https://www.ebay.com/itm/synthetic'},saving:{amount:100,status:'CALCULATED_FROM_VERIFIED_OFFER'}}});
test('expired/future/invalid responses are removed with their whole provider payload and aggregate saving',()=>{
 const entries=[entry(new Date(now-300001).toISOString()),entry(new Date(now+31000).toISOString()),entry('invalid')];
 const fresh=retainFreshPricing(entries,now);assert.deepEqual(fresh,[]);
 assert.equal(summarizeVerifiedPricing(fresh).verifiedSaving,0);assert.doesNotMatch(JSON.stringify(fresh),/seller|sourceUrl/);
});
test('expiry uses provider timestamp, preserves fresh entry until boundary and never triggers fetch',()=>{
 const item=entry(new Date(now-250000).toISOString());assert.deepEqual(retainFreshPricing([item],now),[item]);
 assert.equal(nextPricingExpiry([item]),now+50000);assert.deepEqual(retainFreshPricing([item],now+50001),[]);assert.equal(nextPricingExpiry([]),null);
});
