import test from 'node:test';
import assert from 'node:assert/strict';

import vehiclesHandler from '../api/vehicles.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';

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

test('successful manufacturer response is cacheable only at Vercel CDN', async () => {
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
  assert.equal(
    res.headers['Vercel-CDN-Cache-Control'],
    'public, max-age=' + RUNTIME_CONFIG.manufacturersCdnCacheSeconds +
      ', stale-while-revalidate=' + RUNTIME_CONFIG.manufacturersCdnStaleSeconds
  );
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
  assert.equal(res.headers['Vercel-CDN-Cache-Control'], undefined);
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
  assert.equal(res.headers['Vercel-CDN-Cache-Control'], undefined);
});

test('manufacturer cache durations are positive and stale window is longer', () => {
  assert.ok(RUNTIME_CONFIG.manufacturersCdnCacheSeconds > 0);
  assert.ok(
    RUNTIME_CONFIG.manufacturersCdnStaleSeconds >=
      RUNTIME_CONFIG.manufacturersCdnCacheSeconds
  );
});
