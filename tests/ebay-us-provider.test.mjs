import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEbayVehicleCompatibility,
  createEbayUsShadowProvider
} from '../lib/price-providers/ebay-us.js';

test('eBay US compatibility requires Year Make Model Trim and Engine', () => {
  assert.equal(buildEbayVehicleCompatibility({
    year: 2024,
    make: 'Ford',
    model: 'F-150',
    trim: 'XLT'
  }), null);

  assert.deepEqual(buildEbayVehicleCompatibility({
    year: 2024,
    make: 'Ford',
    model: 'F-150',
    trim: 'XLT',
    engine: '3.5L V6'
  }), [
    { name: 'Year', value: '2024' },
    { name: 'Make', value: 'Ford' },
    { name: 'Model', value: 'F-150' },
    { name: 'Trim', value: 'XLT' },
    { name: 'Engine', value: '3.5L V6' }
  ]);
});

test('eBay shadow provider refuses production calls until access is explicitly approved', async () => {
  const provider=createEbayUsShadowProvider({
    clientId:'id',
    clientSecret:'secret',
    fetchImpl:async()=>{ throw new Error('network should not be called'); }
  });

  await assert.rejects(
    provider.lookup({
      market:'US',
      currency:'USD',
      part:{ number:'BC123' },
      vehicle:{ year:2024,make:'Ford',model:'F-150',trim:'XLT',engine:'3.5L V6' }
    }),
    error => error?.code === 'EBAY_PRODUCTION_ACCESS_REQUIRED'
  );
});

test('eBay shadow provider preserves source ordering and accepts only explicit MPN + fitment + stock', async () => {
  const calls=[];
  const responses=[
    { access_token:'token', expires_in:7200 },
    { itemSummaries:[{itemId:'first'},{itemId:'second'}] },
    {
      itemId:'first',
      mpn:'WRONG',
      price:{value:'40',currency:'USD'},
      shippingOptions:[{shippingCost:{value:'0',currency:'USD'}}],
      estimatedAvailabilities:[{estimatedAvailabilityStatus:'IN_STOCK'}],
      seller:{username:'seller-one'},
      itemWebUrl:'https://www.ebay.com/itm/first'
    },
    {
      itemId:'second',
      mpn:'BC-123',
      price:{value:'45.00',currency:'USD'},
      shippingOptions:[{shippingCost:{value:'5.50',currency:'USD'}}],
      estimatedAvailabilities:[{estimatedAvailabilityStatus:'IN_STOCK'}],
      seller:{username:'seller-two'},
      itemWebUrl:'https://www.ebay.com/itm/second'
    },
    { compatibilityStatus:'COMPATIBLE' }
  ];
  const fetchImpl=async(url,options={})=>{
    calls.push({url:String(url),method:options.method||'GET',body:options.body});
    const payload=responses.shift();
    return { ok:true, status:200, async json(){ return payload; } };
  };

  const provider=createEbayUsShadowProvider({
    clientId:'id',
    clientSecret:'secret',
    productionAccessApproved:true,
    fetchImpl,
    now:()=>Date.parse('2026-10-03T10:00:00.000Z')
  });
  const result=await provider.lookup({
    market:'US',
    currency:'USD',
    part:{name:'brake pads',number:'BC123'},
    vehicle:{year:2024,make:'Ford',model:'F-150',trim:'XLT',engine:'3.5L V6'}
  });

  assert.equal(result.sourceLabel,'eBay Motors (US)');
  assert.equal(result.bestOffer.partNumber,'BC123');
  assert.equal(result.bestOffer.finalUnitPrice,50.5);
  assert.equal(result.bestOffer.seller,'seller-two');
  assert.equal(result.bestOffer.vehicleVerified,true);
  assert.equal(result.bestOffer.verifiedIdentity,true);
  assert.equal(calls.filter(call=>call.url.includes('/check_compatibility')).length,1);
  assert.ok(calls[1].url.includes('buyingOptions%3A%7BFIXED_PRICE%7D'));
});
