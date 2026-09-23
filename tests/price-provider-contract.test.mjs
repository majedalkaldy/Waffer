import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeVerifiedMarketRange,
  normalizeVerifiedOffer,
  lookupVerifiedPricing,
  calculateVerifiedOfferSaving,
  hasConfiguredPriceProvider
} from '../lib/price-provider.js';

const marketConfig = {
  market:'SA',
  locale:'en-SA',
  currency:'SAR'
};

const vehicle = {
  vehicleId:9445,
  make:'FORD',
  model:'Expedition',
  year:'2013',
  vin:'1HGCM82633A004352'
};

test('production registry remains empty until a trusted provider is explicitly connected', () => {
  assert.equal(hasConfiguredPriceProvider('SA'), false);
});

test('verified market range requires correct currency and monotonic range', () => {
  assert.deepEqual(
    normalizeVerifiedMarketRange({
      min:200,
      median:250,
      max:300,
      currency:'SAR',
      sampleSize:5
    }, 'SAR'),
    {
      min:200,
      median:250,
      max:300,
      currency:'SAR',
      sampleSize:5
    }
  );

  assert.equal(
    normalizeVerifiedMarketRange({ min:200, median:250, max:300, currency:'USD' }, 'SAR'),
    null
  );
  assert.equal(
    normalizeVerifiedMarketRange({ min:300, median:250, max:200, currency:'SAR' }, 'SAR'),
    null
  );
});

test('verified offer requires exact normalized part identity, vehicle verification, stock and HTTPS evidence', () => {
  const valid = normalizeVerifiedOffer({
    partNumber:'brk123',
    finalUnitPrice:220,
    currency:'SAR',
    seller:'Trusted Seller',
    sourceUrl:'https://seller.example/offer/1',
    verifiedIdentity:true,
    vehicleVerified:true,
    inStock:true
  }, {
    expectedCurrency:'SAR',
    requestedPartNumber:'BRK-123'
  });

  assert.equal(valid.finalUnitPrice, 220);
  assert.equal(valid.partNumber, 'brk123');
  assert.equal(valid.seller, 'Trusted Seller');
  assert.ok(valid.sourceUrl.startsWith('https://'));

  assert.equal(normalizeVerifiedOffer({
    partNumber:'OTHER-999',
    finalUnitPrice:220,
    currency:'SAR',
    seller:'Trusted Seller',
    sourceUrl:'https://seller.example/offer/1',
    verifiedIdentity:true,
    vehicleVerified:true,
    inStock:true
  }, { expectedCurrency:'SAR', requestedPartNumber:'BRK-123' }), null);

  assert.equal(normalizeVerifiedOffer({
    partNumber:'BRK-123',
    finalUnitPrice:220,
    currency:'SAR',
    seller:'Trusted Seller',
    sourceUrl:'http://seller.example/offer/1',
    verifiedIdentity:true,
    vehicleVerified:true,
    inStock:true
  }, { expectedCurrency:'SAR', requestedPartNumber:'BRK-123' }), null);

  assert.equal(normalizeVerifiedOffer({
    partNumber:'BRK-123',
    finalUnitPrice:220,
    currency:'SAR',
    seller:'Trusted Seller',
    sourceUrl:'https://seller.example/offer/1',
    verifiedIdentity:true,
    vehicleVerified:false,
    inStock:true
  }, { expectedCurrency:'SAR', requestedPartNumber:'BRK-123' }), null);

  assert.equal(normalizeVerifiedOffer({
    partNumber:'BRK-123',
    finalUnitPrice:220,
    currency:'SAR',
    seller:'Trusted Seller',
    sourceUrl:'https://seller.example/offer/1',
    verifiedIdentity:true,
    vehicleVerified:true,
    inStock:false
  }, { expectedCurrency:'SAR', requestedPartNumber:'BRK-123' }), null);
});

test('trusted provider lookup returns validated range and offer only with sufficient identity', async () => {
  let calls = 0;
  let captured;
  const provider = {
    id:'test-provider',
    label:'Test Prices',
    async lookup(input) {
      calls += 1;
      captured = input;
      return {
        checkedAt:'2026-09-23T18:00:00.000Z',
        sourceLabel:'Test Prices',
        marketRange:{
          min:200,
          median:250,
          max:300,
          currency:'SAR',
          sampleSize:4
        },
        bestOffer:{
          partNumber:'BRK123',
          finalUnitPrice:220,
          currency:'SAR',
          seller:'Trusted Seller',
          sourceUrl:'https://seller.example/offer/1',
          verifiedIdentity:true,
          vehicleVerified:true,
          inStock:true
        }
      };
    }
  };

  const result = await lookupVerifiedPricing({
    provider,
    marketConfig,
    part:{ name:'Brake pad', number:'BRK-123' },
    vehicle,
    quantity:2
  });

  assert.equal(calls, 1);
  assert.equal(captured.currency, 'SAR');
  assert.equal(captured.part.number, 'BRK-123');
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.providerId, 'test-provider');
  assert.equal(result.marketRange.median, 250);
  assert.equal(result.bestOffer.finalUnitPrice, 220);
});

test('insufficient identity prevents provider lookup entirely', async () => {
  let calls = 0;
  const provider = {
    id:'test-provider',
    async lookup() {
      calls += 1;
      return {};
    }
  };

  const result = await lookupVerifiedPricing({
    provider,
    marketConfig,
    part:{ name:'Brake pad', number:'not visible' },
    vehicle,
    quantity:1
  });

  assert.equal(result.status, 'INSUFFICIENT_IDENTITY');
  assert.equal(calls, 0);
});

test('price provider timeout aborts the adapter and returns PROVIDER_TIMEOUT', async () => {
  let capturedSignal = null;
  const provider = {
    id:'slow-provider',
    async lookup(input) {
      capturedSignal = input.signal;
      return new Promise((resolve, reject) => {
        input.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once:true });
      });
    }
  };

  const started = Date.now();
  const result = await lookupVerifiedPricing({
    provider,
    marketConfig,
    part:{ name:'Brake pad', number:'BRK-123' },
    vehicle,
    timeoutMs:20
  });

  assert.equal(result.status, 'PROVIDER_TIMEOUT');
  assert.equal(result.marketRange, null);
  assert.equal(result.bestOffer, null);
  assert.equal(capturedSignal?.aborted, true);
  assert.ok(Date.now() - started < 500);
});

test('provider failures and untraceable responses never create verified price data', async () => {
  const failed = await lookupVerifiedPricing({
    provider:{
      id:'failed-provider',
      async lookup() { throw new Error('down'); }
    },
    marketConfig,
    part:{ name:'Brake pad', number:'BRK-123' },
    vehicle
  });
  assert.equal(failed.status, 'PROVIDER_ERROR');
  assert.equal(failed.marketRange, null);
  assert.equal(failed.bestOffer, null);

  const noTimestamp = await lookupVerifiedPricing({
    provider:{
      id:'bad-evidence',
      async lookup() {
        return {
          marketRange:{ min:1, median:2, max:3, currency:'SAR' }
        };
      }
    },
    marketConfig,
    part:{ name:'Brake pad', number:'BRK-123' },
    vehicle
  });
  assert.equal(noTimestamp.status, 'NO_VERIFIED_PRICE');
  assert.equal(noTimestamp.marketRange, null);
});

test('saving is calculated only from a validated offer and never from market median', () => {
  const saving = calculateVerifiedOfferSaving({
    workshopUnitPrice:300,
    quantity:2,
    bestOffer:{ finalUnitPrice:220 }
  });

  assert.deepEqual(saving, {
    amount:160,
    status:'CALCULATED_FROM_VERIFIED_OFFER',
    workshopTotal:600,
    offerTotal:440
  });

  const noPositive = calculateVerifiedOfferSaving({
    workshopUnitPrice:200,
    quantity:2,
    bestOffer:{ finalUnitPrice:220 }
  });
  assert.equal(noPositive.amount, 0);
  assert.equal(noPositive.status, 'NO_POSITIVE_SAVING');

  const noOffer = calculateVerifiedOfferSaving({
    workshopUnitPrice:300,
    quantity:2,
    bestOffer:null
  });
  assert.equal(noOffer.amount, null);
  assert.equal(noOffer.status, 'NOT_CALCULATED');
});
