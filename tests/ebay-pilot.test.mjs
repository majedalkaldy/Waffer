import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEbayPilotSample } from '../lib/price-providers/ebay-pilot.js';

test('pilot builder preserves production evidence in evaluator-compatible shape', async () => {
  const provider={
    id:'ebay-us-browse-shadow',
    environment:'production',
    async lookup(input){
      return {
        checkedAt:'2026-10-03T10:00:00.000Z',
        marketRange:null,
        bestOffer:{
          partNumber:input.part.number,
          finalUnitPrice:42.5,
          currency:'USD',
          seller:'seller',
          sourceUrl:'https://www.ebay.com/itm/123',
          inStock:true,
          verifiedIdentity:true,
          vehicleVerified:true
        }
      };
    }
  };

  const sample=await buildEbayPilotSample({
    provider,
    environment:'production',
    cases:[{
      caseId:'c1',
      partName:'Brake pad',
      partNumber:'BC123',
      vehicle:{year:'2024',make:'Ford',model:'F-150'}
    }]
  });

  assert.equal(sample.environment,'production');
  assert.equal(sample.market,'US');
  assert.equal(sample.currency,'USD');
  assert.equal(sample.cases[0].requestedPartNumber,'BC123');
  assert.equal(sample.cases[0].bestOffer.finalUnitPrice,42.5);
  assert.equal(sample.cases[0].runnerStatus,'DATA_RETURNED');
});

test('pilot builder records provider failures without aborting the batch', async () => {
  const provider={
    id:'ebay-us-browse-shadow-sandbox',
    environment:'sandbox',
    async lookup(){ const error=new Error('no data'); error.code='NO_DATA'; throw error; }
  };

  const sample=await buildEbayPilotSample({
    provider,
    environment:'sandbox',
    cases:[
      {caseId:'bad',partNumber:'A1',vehicle:{}},
      {caseId:'missing',partNumber:'',vehicle:{}}
    ]
  });

  assert.equal(sample.environment,'sandbox');
  assert.equal(sample.cases[0].runnerStatus,'NO_DATA');
  assert.equal(sample.cases[1].runnerStatus,'PART_NUMBER_REQUIRED');
});

for (const environment of [undefined, null, '', 'sandbbox', 'staging']) {
  test(`pilot rejects invalid environment ${JSON.stringify(environment)} before lookup`, async () => {
    let calls = 0;
    const provider = {id: 'ebay-us-browse-shadow', environment: 'production', lookup() { calls++; }};
    await assert.rejects(buildEbayPilotSample({provider, environment, cases: [{partNumber: 'A1'}]}), /explicit sandbox or production/);
    assert.equal(calls, 0);
  });
}

test('pilot refuses missing provider provenance and environment mismatch', async () => {
  let calls = 0;
  for (const environment of [undefined, 'sandbox', 'staging']) {
    const provider = {id: 'ebay-us-browse-shadow-sandbox', environment, lookup() { calls++; }};
    await assert.rejects(buildEbayPilotSample({provider, environment: 'production', cases: [{partNumber: 'A1'}]}));
  }
  assert.equal(calls, 0);
});

test('pilot preserves missing evidence timestamps instead of inventing freshness', async () => {
  const provider = {
    id: 'ebay-us-browse-shadow', environment: 'production',
    async lookup() { return {bestOffer: {partNumber: 'A1'}}; }
  };
  const sample = await buildEbayPilotSample({provider, environment: 'production', cases: [{partNumber: 'A1'}]});
  assert.equal(sample.cases[0].checkedAt, null);
});
