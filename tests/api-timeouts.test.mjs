import test from 'node:test';
import assert from 'node:assert/strict';

import productsHandler from '../api/products.js';
import articlesHandler from '../api/articles.js';
import criteriaHandler from '../api/article-criteria.js';
import vinHandler from '../api/vin.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';

const originalFetch = globalThis.fetch;
const originalKey = process.env.AUTOPARTS_API_KEY;
const originalTimeouts = {
  catalogProductsTimeoutMs: RUNTIME_CONFIG.catalogProductsTimeoutMs,
  catalogArticlesTimeoutMs: RUNTIME_CONFIG.catalogArticlesTimeoutMs,
  catalogCriteriaTimeoutMs: RUNTIME_CONFIG.catalogCriteriaTimeoutMs,
  vinTimeoutMs: RUNTIME_CONFIG.vinTimeoutMs
};

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

function abortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

function hangingBody(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
  });
}

test.before(() => {
  process.env.AUTOPARTS_API_KEY = 'test-key';
  RUNTIME_CONFIG.catalogProductsTimeoutMs = 20;
  RUNTIME_CONFIG.catalogArticlesTimeoutMs = 20;
  RUNTIME_CONFIG.catalogCriteriaTimeoutMs = 20;
  RUNTIME_CONFIG.vinTimeoutMs = 20;
});

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.AUTOPARTS_API_KEY;
  else process.env.AUTOPARTS_API_KEY = originalKey;
  Object.assign(RUNTIME_CONFIG, originalTimeouts);
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('products timeout covers response.json()', async () => {
  globalThis.fetch = async (_url, { signal }) => ({
    ok: true,
    status: 200,
    json: () => hangingBody(signal)
  });

  const res = responseRecorder();
  await productsHandler({ method: 'GET', query: { vehicleId: '123' } }, res);

  assert.equal(res.statusCode, 504);
  assert.equal(res.body?.code, 'CATALOG_TIMEOUT');
});

test('articles timeout covers response.json()', async () => {
  globalThis.fetch = async (_url, { signal }) => ({
    ok: true,
    status: 200,
    json: () => hangingBody(signal)
  });

  const res = responseRecorder();
  await articlesHandler({ method: 'GET', query: { vehicleId: '123', productId: '9' } }, res);

  assert.equal(res.statusCode, 504);
  assert.equal(res.body?.code, 'CATALOG_TIMEOUT');
});

test('article criteria timeout covers response.text()', async () => {
  globalThis.fetch = async (_url, { signal }) => ({
    ok: true,
    status: 200,
    text: () => hangingBody(signal)
  });

  const res = responseRecorder();
  await criteriaHandler({ method: 'GET', query: { articleId: '77' } }, res);

  assert.equal(res.statusCode, 504);
  assert.equal(res.body?.code, 'CATALOG_TIMEOUT');
});

test('VIN timeout covers response.text()', async () => {
  globalThis.fetch = async (_url, { signal }) => ({
    ok: true,
    status: 200,
    text: () => hangingBody(signal)
  });

  const res = responseRecorder();
  await vinHandler({ method: 'GET', query: { vin: '1HGCM82633A004352' } }, res);

  assert.equal(res.statusCode, 504);
  assert.equal(res.body?.code, 'VIN_TIMEOUT');
});
