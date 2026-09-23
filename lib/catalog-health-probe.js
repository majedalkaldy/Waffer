const STORE_KEY = Symbol.for('waffer.catalog-health-probe.v1');

function getStore() {
  if (!globalThis[STORE_KEY]) globalThis[STORE_KEY] = new Map();
  return globalThis[STORE_KEY];
}

function probeKey(marketConfig = {}) {
  const catalog = marketConfig?.catalog || {};
  return [
    marketConfig?.market || 'unknown',
    catalog.typeId ?? 'unknown',
    catalog.countryFilterId ?? 'unknown',
    catalog.langId ?? 'unknown'
  ].join('|');
}

export async function probeCatalogHealth({
  marketConfig,
  apiKey,
  timeoutMs,
  cacheMs,
  fetchImpl = globalThis.fetch,
  clock = () => Date.now()
} = {}) {
  if (!apiKey) {
    return {
      upstream: 'not_configured',
      latencyMs: null,
      cache: 'none',
      checkedAt: null,
      ageMs: null
    };
  }

  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  const key = probeKey(marketConfig);
  const now = clock();
  const ttl = Math.max(0, Number(cacheMs) || 0);
  const store = getStore();
  const current = store.get(key);

  if (current?.result && now < current.expiresAt) {
    return {
      ...current.result,
      cache: 'hit',
      ageMs: Math.max(0, now - current.result.checkedAt)
    };
  }

  if (current?.promise) {
    const result = await current.promise;
    return {
      ...result,
      cache: 'coalesced',
      ageMs: Math.max(0, clock() - result.checkedAt)
    };
  }

  const promise = (async () => {
    const startedAt = clock();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 1));

    let upstream = 'unreachable';
    try {
      const response = await fetchImpl(
        'https://auto-parts-catalog.apiprofile.com/api/v2/manufacturers/list/type-id/' +
          encodeURIComponent(marketConfig?.catalog?.typeId),
        {
          headers: {
            Accept: 'application/json',
            'x-apiprofile-key': apiKey
          },
          signal: controller.signal
        }
      );
      upstream = response.ok ? 'reachable' : 'error';
    } catch {
      upstream = 'unreachable';
    } finally {
      clearTimeout(timer);
    }

    const checkedAt = clock();
    const result = {
      upstream,
      latencyMs: Math.max(0, checkedAt - startedAt),
      checkedAt
    };

    store.set(key, {
      result,
      expiresAt: checkedAt + ttl,
      promise: null
    });

    return result;
  })();

  store.set(key, {
    result: current?.result || null,
    expiresAt: current?.expiresAt || 0,
    promise
  });

  const result = await promise;
  return {
    ...result,
    cache: 'miss',
    ageMs: 0
  };
}

export function resetCatalogHealthProbeForTests() {
  globalThis[STORE_KEY]?.clear?.();
}
