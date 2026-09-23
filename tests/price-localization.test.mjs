import test from 'node:test';
import assert from 'node:assert/strict';

import priceCompareHandler from '../api/price-compare.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return value; }
  };
}

test('English price comparison returns English human-readable message with stable machine codes', async () => {
  const res = responseRecorder();
  await priceCompareHandler({
    method: 'POST',
    body: {
      partName: 'Brake pad',
      partNumber: 'BRK-123',
      workshopPrice: 300,
      quantity: 1,
      market: 'SA',
      locale: 'en-SA',
      currency: 'USD',
      vehicle: { vehicleId: 9445 }
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.context.locale, 'en-SA');
  assert.equal(res.body.context.currency, 'SAR');
  assert.equal(res.body.status, 'WAITING_FOR_VERIFIED_PRICE_SOURCE');
  assert.equal(res.body.saving.status, 'NOT_CALCULATED');
  assert.equal(res.body.verification.identity, 'PART_NUMBER_PRESENT');
  assert.ok(res.body.message.startsWith('Market price and savings were not calculated'));
  assert.equal(/[\u0600-\u06FF]/.test(res.body.message), false);
});

test('Arabic price comparison keeps Arabic human-readable message', async () => {
  const res = responseRecorder();
  await priceCompareHandler({
    method: 'POST',
    body: {
      partName: 'فحمات فرامل',
      partNumber: 'BRK-123',
      workshopPrice: 300,
      market: 'SA',
      locale: 'ar-SA',
      vehicle: { vehicleId: 9445 }
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.context.locale, 'ar-SA');
  assert.ok(res.body.message.includes('لم يتم احتساب سعر السوق أو التوفير'));
});

test('missing part identity error follows requested locale', async () => {
  const en = responseRecorder();
  await priceCompareHandler({
    method: 'POST',
    body: { partName: ' ', partNumber: ' ', locale: 'en-SA', market: 'SA' }
  }, en);

  assert.equal(en.statusCode, 400);
  assert.equal(en.body.code, 'PART_IDENTITY_REQUIRED');
  assert.equal(en.body.error, 'A part name or part number is required.');

  const ar = responseRecorder();
  await priceCompareHandler({
    method: 'POST',
    body: { partName: ' ', partNumber: ' ', locale: 'ar-SA', market: 'SA' }
  }, ar);

  assert.equal(ar.statusCode, 400);
  assert.equal(ar.body.code, 'PART_IDENTITY_REQUIRED');
  assert.ok(ar.body.error.includes('يلزم اسم القطعة'));
});

test('unsupported market error follows requested locale without changing code', async () => {
  const res = responseRecorder();
  await priceCompareHandler({
    method: 'POST',
    body: {
      partName: 'Brake pad',
      locale: 'en-SA',
      market: 'ZZ'
    }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'UNSUPPORTED_MARKET');
  assert.equal(res.body.error, 'The requested market is not supported yet.');
});
