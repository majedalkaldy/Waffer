// SYNTHETIC TRANSPORT FIXTURES ONLY. Never use as market, pilot or release evidence.
import { createHash } from 'node:crypto';
export const fixtureNow = Date.parse('2026-10-04T17:00:00.000Z');
export const vehicle = {vin:'1HGCM82633A004352',year:'2024',make:'Ford',model:'F-150',trim:'XLT Crew Cab Pickup 4-Door',engine:'3.5L 3496CC V6 GAS DOHC Turbocharged'};
export const input = {market:'US',currency:'USD',part:{name:'Synthetic test part',number:'FIXTURE-123',manufacturer:'Fixture Brand'},vehicle,quantity:1};
export function listing(environment = 'production') { return {
  partNumber:'FIXTURE-123',manufacturer:'Fixture Brand',identityBasis:'EXACT_MPN_AND_BRAND',
  itemPrice:40,shippingEstimate:5,currency:'USD',seller:'synthetic-seller',
  sourceUrl:environment === 'sandbox' ? 'https://www.sandbox.ebay.com/itm/synthetic' : 'https://www.ebay.com/itm/synthetic',
  environment,inStock:true,verifiedIdentity:true,vehicleVerified:true,requestedQuantity:1,
  fitmentEvidence:{source:'EBAY_TAXONOMY',...vehicle,compatibilityStatus:'COMPATIBLE'},
  totalPrice:null,totalVerified:false,quantityAvailability:'CONFIRMED'
}; }
export function releaseFixture() {
  const sample = {captureContract:'ebay-us-matched-listing-v1',evidenceKind:'REAL_PROVIDER_CAPTURE',synthetic:false,providerId:'ebay-us-browse-shadow',environment:'production',market:'US',currency:'USD',
    cases:Array.from({length:20},(_,i)=>({caseId:'case-'+i,requestedPartNumber:'PART-'+i,requestedManufacturer:'Fixture Brand',requestedVehicle:{...vehicle},checkedAt:new Date(fixtureNow).toISOString(),runnerStatus:'DATA_RETURNED',matchedListing:{...listing(),partNumber:'PART-'+i}}))};
  return {schemaVersion:1,status:'PASS',environment:'production',market:'US',reviewedAt:new Date(fixtureNow).toISOString(),expiresAt:new Date(fixtureNow+86400000).toISOString(),reviewedBy:'SYNTHETIC TEST ONLY',productionApprovalReference:'SYNTHETIC TEST ONLY',evidenceKind:'REAL_PROVIDER_CAPTURE',sampleSha256:createHash('sha256').update(JSON.stringify(sample)).digest('hex'),sample};
}
export const productionEnv = {WAFFER_PRICE_PROVIDER_MODE:'production',VERCEL_ENV:'production',EBAY_BUY_PRODUCTION_APPROVED:'true',EBAY_CLIENT_ID:'synthetic-client',EBAY_CLIENT_SECRET:'synthetic-secret'};
export function fixtureTransport({environment='production', item={}, compatibility='COMPATIBLE', empty=false, status=200, retryFirst=false, delay=false, retryAfter=null}={}) {
  const calls=[];
  let searched=0;
  const fetchImpl=async(url,options={})=>{
    calls.push({url:String(url),method:options.method,body:options.body,redirect:options.redirect});
    if(delay) return new Promise(()=>{});
    let payload;
    let code=200;
    if(String(url).includes('/oauth2/token')) payload={access_token:'synthetic-token',expires_in:7200};
    else if(String(url).includes('/item_summary/search?')) {
      searched++;
      code=retryFirst && searched===1 ? 503 : status;
      payload={itemSummaries:empty?[]:[{itemId:'synthetic',categoryId:'33559'}]};
    } else if(String(url).endsWith('/check_compatibility')) payload={compatibilityStatus:compatibility};
    else if(String(url).includes('/get_compatibility_properties?')) payload={compatibilityProperties:['Year','Make','Model','Trim','Engine'].map(name=>({name}))};
    else if(String(url).includes('/get_compatibility_property_values?')) {
      const key=new URL(url).searchParams.get('compatibility_property').toLowerCase();
      payload={compatibilityPropertyValues:[{value:vehicle[key]}]};
    } else payload={itemId:'synthetic',categoryId:'33559',mpn:'FIXTURE-123',brand:'Fixture Brand',buyingOptions:['FIXED_PRICE'],price:{value:'40',currency:'USD'},shippingOptions:[{shippingCost:{value:'5',currency:'USD'}}],estimatedAvailabilities:[{estimatedAvailabilityStatus:'IN_STOCK',estimatedAvailableQuantity:3}],seller:{username:'synthetic-seller'},itemWebUrl:listing(environment).sourceUrl,...item};
    return {ok:code>=200&&code<300,status:code,headers:{get:()=>retryAfter},json:async()=>payload};
  };
  return {calls,fetchImpl};
}
