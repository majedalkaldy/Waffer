import test from 'node:test';
import assert from 'node:assert/strict';

import {
  probeCatalogHealth,
  resetCatalogHealthProbeForTests
} from '../lib/catalog-health-probe.js';

const marketConfig = {
  market: 'SA',
  catalog: {
    typeId: 1,
    langId: 4,
    countryFilterId: 63
  }
};

test.beforeEach(() => resetCatalogHealthProbeForTests());

test('catalog health probe reuses a fresh result within the cache TTL', async () => {
  let calls = 0;
  let now = 1_000;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true };
  };

  const first = await probeCatalogHealth({
    marketConfig,
    apiKey: 'test-key',
    timeoutMs: 100,
    cacheMs: 60_000,
    fetchImpl,
    clock: () => now
  });

  const second = await probeCatalogHealth({
    marketConfig,
    apiKey: 'test-key',
    timeoutMs: 100,
    cacheMs: 60_000,
    fetchImpl,
    clock: () => now
  });

  assert.equal(first.upstream, 'reachable');
  assert.equal(first.cache, 'miss');
  assert.equal(second.upstream, 'reachable');
  assert.equal(second.cache, 'hit');
  assert.equal(calls, 1);

  now += 60_001;
  const third = await probeCatalogHealth({
    marketConfig,
    apiKey: 'test-key',
    timeoutMs: 100,
    cacheMs: 60_000,
    fetchImpl,
    clock: () => now
  });

  assert.equal(third.cache, 'miss');
  assert.equal(calls, 2);
});

test('concurrent health requests coalesce onto one upstream probe', async () => {
  let calls = 0;
  let resolveFetch;
  const fetchImpl = () => {
    calls += 1;
    return new Promise(resolve => {
      resolveFetch = resolve;
    });
  };

  const firstPromise = probeCatalogHealth({
    marketConfig,
    apiKey: 'test-key',
    timeoutMs: 1000,
    cacheMs: 60_000,
    fetchImpl
  });

  const secondPromise = probeCatalogHealth({
    marketConfig,
    apiKey: 'test-key',
    timeoutMs: 1000,
    cacheMs: 60_000,
    fetchImpl
  });

  assert.equal(calls, 1);
  resolveFetch({ ok: true });

  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(first.upstream, 'reachable');
  assert.equal(second.upstream, 'reachable');
  assert.equal(first.cache, 'miss');
  assert.equal(second.cache, 'coalesced');
  assert.equal(calls, 1);
});

test('temporary upstream failure is cached briefly to avoid provider hammering', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error('provider unavailable');
  };

  const first = await probeCatalogHealth({
    marketConfig,
    apiKey: 'test-key',
    timeoutMs: 100,
    cacheMs: 60_000,
    fetchImpl
  });

  const second = await probeCatalogHealth({
    marketConfig,
    apiKey: 'test-key',
    timeoutMs: 100,
    cacheMs: 60_000,
    fetchImpl
  });

  assert.equal(first.upstream, 'unreachable');
  assert.equal(second.upstream, 'unreachable');
  assert.equal(second.cache, 'hit');
  assert.equal(calls, 1);
});

test('missing catalog key never performs an upstream request', async () => {
  let calls = 0;
  const result = await probeCatalogHealth({
    marketConfig,
    apiKey: '',
    timeoutMs: 100,
    cacheMs: 60_000,
    fetchImpl: async () => {
      calls += 1;
      return { ok: true };
    }
  });

  assert.equal(result.upstream, 'not_configured');
  assert.equal(result.cache, 'none');
  assert.equal(calls, 0);
});

test('health cache retains only operational status, not catalog response content', async () => {
  let calls = 0;
  const response = { ok:true, json() { throw new Error('Must not consume catalog data'); },
    text() { throw new Error('Must not consume catalog data'); } };
  const options = { marketConfig, apiKey:'test-key', timeoutMs:100, cacheMs:60_000,
    fetchImpl:async()=>{ calls++; return response; }, clock:()=>1000 };
  const first=await probeCatalogHealth(options);
  const second=await probeCatalogHealth(options);
  assert.equal(calls,1);
  assert.equal(first.cache,'miss'); assert.equal(second.cache,'hit');
  assert.deepEqual(Object.keys(second).sort(), ['ageMs','cache','checkedAt','latencyMs','upstream']);
  assert.deepEqual(second,{upstream:'reachable',latencyMs:0,checkedAt:1000,cache:'hit',ageMs:0});
});
