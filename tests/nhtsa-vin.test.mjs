import test from 'node:test';
import assert from 'node:assert/strict';

import handler, { normalizeNhtsaVinResult } from '../api/vin-us.js';

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

test('NHTSA VIN normalization extracts US fitment identity without inventing fields', () => {
  const normalized=normalizeNhtsaVinResult({
    Results:[{
      Make:'FORD',
      Model:'F-150',
      ModelYear:'2024',
      Trim:'XLT',
      DisplacementL:'3.5',
      EngineCylinders:'6',
      FuelTypePrimary:'Gasoline',
      BodyClass:'Pickup',
      DriveType:'4WD/4-Wheel Drive/4x4',
      ErrorCode:'0',
      ErrorText:'0 - VIN decoded clean.'
    }]
  }, '1FTFW1E85RFA00001');

  assert.equal(normalized.source,'NHTSA_VPIC');
  assert.equal(normalized.make,'FORD');
  assert.equal(normalized.model,'F-150');
  assert.equal(normalized.year,'2024');
  assert.equal(normalized.trim,'XLT');
  assert.equal(normalized.engine,'3.5L 6-cyl Gasoline');
  assert.equal(normalized.decoded,true);
});

test('NHTSA normalization does not claim exact data when decoded values are empty', () => {
  const normalized=normalizeNhtsaVinResult({
    Results:[{
      Make:'',
      Model:'',
      ModelYear:'',
      Trim:'',
      EngineModel:'',
      ErrorCode:'1',
      ErrorText:'1 - Check Digit (9th position) does not calculate properly'
    }]
  }, '1FTFW1E85RFA00001');

  assert.equal(normalized.decoded,false);
  assert.equal(normalized.make,null);
  assert.equal(normalized.trim,null);
  assert.equal(normalized.engine,null);
  assert.equal(normalized.errorCode,'1');
});

test('NHTSA endpoint rejects malformed VINs before any upstream call', async () => {
  const res=responseRecorder();
  await handler({method:'GET',query:{vin:'BAD'}},res);
  assert.equal(res.statusCode,400);
  assert.equal(res.body.code,'INVALID_VIN');
});
