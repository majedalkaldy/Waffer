import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPricingListings} from '../lib/pricing-view.js';
import {summarizeVerifiedPricing} from '../lib/pricing-client.js';
import {listing,fixtureNow} from './fixtures/ebay-runtime-fixture.mjs';
function dom(){
 const doc={createElement:tag=>({tag,textContent:'',children:[],ownerDocument:doc,append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=[...nodes];}})};
 return doc.createElement('div');
}
const text=node=>[node.textContent,...node.children.map(text)].join(' ');
const find=(node,tag)=>[...(node.tag===tag?[node]:[]),...node.children.flatMap(n=>find(n,tag))];
function entry(sandbox=false){return {part:{number:'FIXTURE-123'},pricingProvider:{environment:sandbox?'sandbox':'production'},[sandbox?'sandboxPreview':'matchedListing']:{...listing(sandbox?'sandbox':'production'),checkedAt:new Date(fixtureNow).toISOString()}};}
test('matched listing renderer separates prices and uncertainties without final total or savings',()=>{
 const root=dom();renderPricingListings(root,[entry()],{now:fixtureNow});
 assert.match(text(root),/Price per listing unit: 40.00 USD/);assert.match(text(root),/Shipping estimate: 5.00 USD/);
 assert.match(text(root),/Tax and checkout total: unknown/);assert.match(text(root),/Pack size and units are unverified/);
 assert.equal(find(root,'a').length,1);assert.equal(find(root,'a')[0].rel,'noopener noreferrer');
 assert.doesNotMatch(text(root),/45.00/);
});
test('sandbox renders test labels and cannot produce live links or summary savings',()=>{
 const root=dom();const data=entry(true);renderPricingListings(root,[data],{now:fixtureNow});
 assert.match(text(root),/SANDBOX TEST DATA ONLY/);assert.equal(find(root,'a').length,0);
 const summary=summarizeVerifiedPricing([{data:{...data,bestOffer:{finalUnitPrice:1},saving:{status:'CALCULATED_FROM_VERIFIED_OFFER',amount:900}}}]);
 assert.equal(summary.verifiedOfferCount,0);assert.equal(summary.verifiedSaving,0);
});
test('missing shipping, stale responses and repeated clear render fail closed',()=>{
 const root=dom();const data=entry();data.matchedListing.shippingEstimate=null;
 renderPricingListings(root,[data],{now:fixtureNow});assert.match(text(root),/Shipping: unknown/);
 renderPricingListings(root,[data],{now:fixtureNow+300001});assert.match(text(root),/No fresh matched listing/);assert.equal(find(root,'a').length,0);
 renderPricingListings(root,[],{now:fixtureNow});assert.equal(root.children.length,0);
 renderPricingListings(root,[data],{now:fixtureNow});assert.equal(root.children.length,1);
});
test('Arabic and hostile seller text are handled as plain text nodes',()=>{
 const root=dom();const data=entry();data.matchedListing.seller='<img src=x onerror=alert(1)>';
 renderPricingListings(root,[data],{now:fixtureNow,locale:'ar-US'});
 assert.match(text(root),/غير موثّق/);assert.match(text(root),/<img src=x onerror=alert\(1\)>/);
 assert.equal(find(root,'img').length,0);assert.equal(find(root,'script').length,0);
});

test('only tracked listing links carry conditional compensation disclosure',()=>{
 const root=dom();const data=entry();renderPricingListings(root,[data],{now:fixtureNow});
 assert.doesNotMatch(text(root),/affiliate compensation/);
 data.matchedListing.sourceUrl+='?campid=synthetic-campaign';renderPricingListings(root,[data],{now:fixtureNow});
 assert.match(text(root),/A purchase may result in affiliate compensation/);assert.match(find(root,'a')[0].rel,/sponsored/);
 renderPricingListings(root,[data],{now:fixtureNow,locale:'ar-US'});assert.match(text(root),/تعويض تسويق بالعمولة/);
});
