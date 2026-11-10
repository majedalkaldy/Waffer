import test from 'node:test';
import assert from 'node:assert/strict';

import vehiclesHandler from '../api/vehicles.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';

function assertNoStore(res) {
  for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) {
    assert.equal(res.headers[header], 'no-store', header);
  }
}

const originalFetch = globalThis.fetch;
const originalKey = process.env.AUTOPARTS_API_KEY;

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

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.AUTOPARTS_API_KEY;
  else process.env.AUTOPARTS_API_KEY = originalKey;
});

test('manufacturer success forbids storage at every cache layer', async () => {
  process.env.AUTOPARTS_API_KEY = 'test-key';
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        manufacturers: [
          { manufacturerId: 5, manufacturerName: 'Ford' },
          { manufacturerId: 16, manufacturerName: 'Toyota' }
        ]
      })
    };
  };

  const res = responseRecorder();
  await vehiclesHandler({ method:'GET', query:{} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assertNoStore(res);
  assert.equal(res.body.count, 2);
  assert.deepEqual(
    res.body.manufacturers.map(item => item.manufacturerName),
    ['Ford','Toyota']
  );
});

test('upstream manufacturer failure is never marked cacheable', async () => {
  process.env.AUTOPARTS_API_KEY = 'test-key';

  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error:'provider unavailable' })
  });

  const res = responseRecorder();
  await vehiclesHandler({ method:'GET', query:{} }, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'CATALOG_UPSTREAM_ERROR');
  assertNoStore(res);
});

test('invalid upstream body is never marked cacheable', async () => {
  process.env.AUTOPARTS_API_KEY = 'test-key';

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new SyntaxError('bad json'); }
  });

  const res = responseRecorder();
  await vehiclesHandler({ method:'GET', query:{} }, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'CATALOG_INVALID_RESPONSE');
  assertNoStore(res);
});

test('manufacturer CDN storage and stale reuse are disabled',()=>{
  assert.equal(RUNTIME_CONFIG.manufacturersCdnCacheSeconds,0);
  assert.equal(RUNTIME_CONFIG.manufacturersCdnStaleSeconds,0);
});
