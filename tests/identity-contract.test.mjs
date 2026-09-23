import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasUsablePartNumber,
  hasUsableVin,
  hasUsableVehicleId,
  hasUsableVehicleIdentity
} from '../lib/identity.js';
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

test('placeholder part numbers are not treated as verified identity', () => {
  for (const value of [
    '', 'غير ظاهر', 'غير متوفر', 'غير معروف', 'غير محدد',
    'not visible', 'not available', 'not provided', 'unknown', 'N/A', '—'
  ]) {
    assert.equal(hasUsablePartNumber(value), false, value);
  }

  assert.equal(hasUsablePartNumber('BRK-12345'), true);
  assert.equal(hasUsablePartNumber('04465-0K240'), true);
});

test('vehicle identity requires a numeric vehicle id or a valid 17-character VIN', () => {
  assert.equal(hasUsableVin('1HGCM82633A004352'), true);
  assert.equal(hasUsableVin('INVALIDVIN'), false);
  assert.equal(hasUsableVehicleId('9445'), true);
  assert.equal(hasUsableVehicleId('0'), false);
  assert.equal(hasUsableVehicleId('FORD'), false);

  assert.equal(hasUsableVehicleIdentity({ vin: 'INVALIDVIN' }), false);
  assert.equal(hasUsableVehicleIdentity({ vehicleId: 'abc' }), false);
  assert.equal(hasUsableVehicleIdentity({ vehicleId: 9445 }), true);
  assert.equal(hasUsableVehicleIdentity({ vin: '1HGCM82633A004352' }), true);
});

test('price comparison does not promote placeholder identities to ready-for-verification', async () => {
  const res = responseRecorder();

  await priceCompareHandler({
    method: 'POST',
    body: {
      partName: 'Brake pad',
      partNumber: 'غير ظاهر',
      workshopPrice: 300,
      quantity: 1,
      market: 'SA',
      vehicle: { vin: 'INVALIDVIN' }
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.verification?.identity, 'PART_NUMBER_MISSING');
  assert.equal(res.body?.verification?.compatibility, 'INSUFFICIENT_IDENTITY');
  assert.equal(res.body?.confidence?.identity, 25);
  assert.equal(res.body?.confidence?.compatibility, 20);
  assert.equal(res.body?.saving?.status, 'NOT_CALCULATED');
});

test('price comparison becomes ready only with usable part and vehicle identity', async () => {
  const res = responseRecorder();

  await priceCompareHandler({
    method: 'POST',
    body: {
      partName: 'Brake pad',
      partNumber: 'BRK-12345',
      workshopPrice: 300,
      quantity: 1,
      market: 'SA',
      vehicle: { vin: '1HGCM82633A004352' }
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.verification?.identity, 'PART_NUMBER_PRESENT');
  assert.equal(res.body?.verification?.compatibility, 'READY_FOR_VERIFICATION');
  assert.equal(res.body?.confidence?.identity, 60);
  assert.equal(res.body?.confidence?.compatibility, 50);
  assert.equal(res.body?.marketPrice?.source, null);
  assert.equal(res.body?.saving?.status, 'NOT_CALCULATED');
});


test('price comparison rejects whitespace-only part identity', async () => {
  const res = responseRecorder();

  await priceCompareHandler({
    method: 'POST',
    body: {
      partName: '   ',
      partNumber: '   ',
      market: 'SA'
    }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, 'PART_IDENTITY_REQUIRED');
});

test('price comparison rejects a non-numeric workshop price', async () => {
  const res = responseRecorder();

  await priceCompareHandler({
    method: 'POST',
    body: {
      partName: 'Brake pad',
      partNumber: 'BRK-12345',
      workshopPrice: 'not-a-number',
      quantity: 2,
      market: 'SA',
      vehicle: { vehicleId: 9445 }
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.workshop?.unitPrice, null);
  assert.equal(res.body?.workshop?.totalPrice, null);
  assert.equal(res.body?.inputValidation?.workshopPrice, 'INVALID_OR_MISSING');
});

test('price comparison defaults invalid quantity to one and keeps a finite total', async () => {
  const res = responseRecorder();

  await priceCompareHandler({
    method: 'POST',
    body: {
      partName: 'Brake pad',
      partNumber: 'BRK-12345',
      workshopPrice: 300,
      quantity: -7,
      market: 'SA',
      vehicle: { vehicleId: 9445 }
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.part?.quantity, 1);
  assert.equal(res.body?.workshop?.unitPrice, 300);
  assert.equal(res.body?.workshop?.totalPrice, 300);
  assert.equal(res.body?.inputValidation?.quantity, 'DEFAULTED_TO_1');
});
