import test from 'node:test';
import assert from 'node:assert/strict';

import { getRequestQuery } from '../lib/request-query.js';

test('HTTP requests use WHATWG URL parsing without touching legacy req.query', () => {
  let legacyReads = 0;
  const req = { url: '/api/readiness?market=ZZ&locale=en-SA' };
  Object.defineProperty(req, 'query', {
    get() {
      legacyReads += 1;
      throw new Error('legacy req.query should not be read');
    }
  });

  const query = getRequestQuery(req);

  assert.equal(legacyReads, 0);
  assert.equal(query.market, 'ZZ');
  assert.equal(query.locale, 'en-SA');
});

test('query-object fallback preserves unit-test and non-HTTP adapter compatibility', () => {
  const query = getRequestQuery({
    query: { market: 'SA', locale: 'ar-SA', vehicleId: '123' }
  });

  assert.deepEqual(query, {
    market: 'SA',
    locale: 'ar-SA',
    vehicleId: '123'
  });
});
