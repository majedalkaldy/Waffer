import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pricingCapabilityEnabled,
  selectPriceableItems,
  buildPriceComparePayload,
  summarizeVerifiedPricing
} from '../lib/pricing-client.js';

const vehicle={
  vehicleId:9445,
  make:'FORD',
  model:'Expedition',
  year:'2013',
  vin:'1HGCM82633A004352'
};

test('pricing capability is enabled only by explicit verifiedMarketPricing true',()=>{
  assert.equal(pricingCapabilityEnabled({verifiedMarketPricing:true}),true);
  assert.equal(pricingCapabilityEnabled({verifiedMarketPricing:false}),false);
  assert.equal(pricingCapabilityEnabled({}),false);
  assert.equal(pricingCapabilityEnabled(null),false);
});

test('priceable selection requires part type, usable part number, price and vehicle identity',()=>{
  const analysis={
    items:[
      {name:'Brake pad',itemType:'part',partNumber:'BRK-123',price:'1,250 SAR'},
      {name:'Labor',itemType:'labor',partNumber:'LAB-1',price:'200'},
      {name:'Unknown part',itemType:'part',partNumber:'not visible',price:'300'},
      {name:'No price',itemType:'part',partNumber:'ABC-1',price:'not stated'},
      {name:'Oil',itemType:'part',partNumber:'OIL-5',price:80}
    ]
  };

  const selected=selectPriceableItems(analysis,vehicle);
  assert.deepEqual(selected.map(x=>x.index),[0,4]);
  assert.equal(selectPriceableItems(analysis,{}).length,0);
});

test('price payload normalizes numeric price and quantity without changing market identity',()=>{
  const payload=buildPriceComparePayload({
    item:{name:'Brake pad',partNumber:'BRK-123',price:'1,250 SAR',quantity:'2'},
    vehicle,
    market:'SA',
    locale:'en-SA',
    currency:'SAR'
  });

  assert.equal(payload.workshopPrice,1250);
  assert.equal(payload.quantity,2);
  assert.equal(payload.partNumber,'BRK-123');
  assert.equal(payload.market,'SA');
  assert.equal(payload.locale,'en-SA');
  assert.equal(payload.currency,'SAR');
  assert.equal(payload.vehicle.vehicleId,9445);
});

test('summary counts ranges and offers but sums only CALCULATED_FROM_VERIFIED_OFFER',()=>{
  const summary=summarizeVerifiedPricing([
    {
      data:{
        marketPrice:{median:250},
        bestOffer:{finalUnitPrice:220},
        saving:{status:'CALCULATED_FROM_VERIFIED_OFFER',amount:160}
      }
    },
    {
      data:{
        marketPrice:{median:400},
        bestOffer:null,
        saving:{status:'NOT_CALCULATED',amount:null}
      }
    },
    {
      data:{
        marketPrice:{median:null},
        bestOffer:{finalUnitPrice:500},
        saving:{status:'NO_POSITIVE_SAVING',amount:0}
      }
    }
  ],'SAR');

  assert.deepEqual(summary,{
    checkedItems:3,
    verifiedOfferCount:2,
    marketRangeCount:2,
    verifiedSavingCount:1,
    verifiedSaving:160,
    currency:'SAR'
  });
});

test('market median alone can never become confirmed saving',()=>{
  const summary=summarizeVerifiedPricing([
    {data:{marketPrice:{median:100},bestOffer:null,saving:{status:'NOT_CALCULATED',amount:null}}}
  ],'SAR');

  assert.equal(summary.marketRangeCount,1);
  assert.equal(summary.verifiedOfferCount,0);
  assert.equal(summary.verifiedSaving,0);
  assert.equal(summary.verifiedSavingCount,0);
});
