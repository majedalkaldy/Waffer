import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePriceProviderSample } from '../lib/price-provider-sample-validator.js';

const NOW = Date.parse('2026-09-28T06:00:00.000Z');

function validOfferCase(index, overrides = {}) {
  const part = 'PART-' + String(index).padStart(3, '0');
  return {
    caseId: 'case-' + index,
    requestedPartNumber: part,
    checkedAt: '2026-09-28T05:30:00.000Z',
    marketRange: {
      min: 90,
      median: 100,
      max: 120,
      currency: 'SAR',
      sampleSize: 4
    },
    bestOffer: {
      partNumber: part,
      finalUnitPrice: 95,
      currency: 'SAR',
      seller: 'Pilot Seller',
      sourceUrl: 'https://seller.example/parts/' + index,
      verifiedIdentity: true,
      vehicleVerified: true,
      inStock: true
    },
    ...overrides
  };
}

test('20 fresh valid offers pass the verified-offer shadow gate', () => {
  const report = evaluatePriceProviderSample({
    providerId:'pilot-provider',
    market:'SA',
    currency:'SAR',
    cases:Array.from({length:20},(_,i)=>validOfferCase(i+1))
  }, { now:NOW });

  assert.equal(report.status,'PASS_FOR_VERIFIED_OFFER_SHADOW');
  assert.equal(report.schemaValid,true);
  assert.equal(report.summary.caseCount,20);
  assert.equal(report.summary.validOfferCount,20);
  assert.equal(report.summary.verifiedOfferCoverage,1);
  assert.equal(report.summary.freshCoverage,1);
  assert.equal(report.summary.verifiedOfferPilotReady,true);
});

test('fresh market ranges without verified offers are range-shadow only', () => {
  const cases=Array.from({length:20},(_,i)=>{
    const item=validOfferCase(i+1);
    delete item.bestOffer;
    return item;
  });
  const report=evaluatePriceProviderSample({
    providerId:'range-provider',
    market:'SA',
    currency:'SAR',
    cases
  }, { now:NOW });

  assert.equal(report.status,'PASS_FOR_MARKET_RANGE_SHADOW_ONLY');
  assert.equal(report.summary.verifiedOfferPilotReady,false);
  assert.equal(report.summary.marketRangePilotReady,true);
  assert.equal(report.summary.marketRangeCoverage,1);
});

test('wrong currency, mismatched identity and stale evidence prevent offer readiness', () => {
  const cases=Array.from({length:20},(_,i)=>validOfferCase(i+1));
  cases[0].bestOffer.currency='USD';
  cases[1].bestOffer.partNumber='DIFFERENT';
  cases[2].checkedAt='2026-09-20T00:00:00.000Z';

  const report=evaluatePriceProviderSample({
    providerId:'bad-provider',
    market:'SA',
    currency:'SAR',
    cases
  }, {
    now:NOW,
    minVerifiedOfferCoverage:0.95,
    minFreshCoverage:0.95
  });

  assert.equal(report.status,'PASS_FOR_MARKET_RANGE_SHADOW_ONLY');
  assert.equal(report.summary.validOfferCount,18);
  assert.equal(report.summary.verifiedOfferCoverage,0.9);
  assert.equal(report.summary.staleTimestampCount,1);
  assert.equal(report.summary.verifiedOfferPilotReady,false);
  assert.ok(report.cases[0].reasons.includes('VERIFIED_OFFER_CONTRACT_REJECTED'));
  assert.ok(report.cases[1].reasons.includes('VERIFIED_OFFER_CONTRACT_REJECTED'));
  assert.ok(report.cases[2].reasons.includes('CHECKED_AT_STALE'));
});

test('future timestamps and invalid sample schema fail shadow readiness', () => {
  const report=evaluatePriceProviderSample({
    market:'SA',
    currency:'SAR',
    cases:[{
      caseId:'future',
      requestedPartNumber:'ABC-1',
      checkedAt:'2026-09-29T00:00:00.000Z',
      bestOffer:{
        partNumber:'ABC-1',
        finalUnitPrice:100,
        currency:'SAR',
        seller:'Seller',
        sourceUrl:'https://seller.example/abc-1',
        verifiedIdentity:true,
        vehicleVerified:true,
        inStock:true
      }
    }]
  }, { now:NOW, minCases:1 });

  assert.equal(report.schemaValid,false);
  assert.ok(report.inputErrors.includes('PROVIDER_ID_REQUIRED'));
  assert.equal(report.summary.futureTimestampCount,1);
  assert.equal(report.status,'NOT_READY_FOR_SHADOW');
});

test('sample below minimum case count never passes pilot readiness', () => {
  const report=evaluatePriceProviderSample({
    providerId:'small-provider',
    market:'SA',
    currency:'SAR',
    cases:Array.from({length:10},(_,i)=>validOfferCase(i+1))
  }, { now:NOW });

  assert.equal(report.summary.sampleSizeReady,false);
  assert.equal(report.summary.verifiedOfferPilotReady,false);
  assert.equal(report.status,'NOT_READY_FOR_SHADOW');
});
