// These server-contract checks are also runnable without a browser installation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {startFixtureServer} from './fixture-server.mjs';
import {input, vehicle} from '../fixtures/ebay-runtime-fixture.mjs';
const payload = {partName: input.part.name, partNumber: input.part.number, manufacturer: input.part.manufacturer,
  vehicle, market: 'US', locale: 'en-US', currency: 'USD', workshopPrice: 90, quantity: 2};

test('fixture server binds loopback and serves only explicitly allowed files', async () => {
  const server = await startFixtureServer();
  try {
    assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const home = await fetch(server.origin);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /SYNTHETIC TEST ONLY/);
    assert.equal(home.headers.get('cache-control'), 'no-store');
    assert.match(home.headers.get('content-security-policy'), /connect-src 'self'/);
    for (const path of ['/api/price-compare.js', '/package.json', '/.env', '/tests/fixtures/ebay-runtime-fixture.mjs', '/%2e%2e%2fpackage.json', '/lib/price-providers/ebay-us.js']) {
      assert.equal((await fetch(server.origin + path)).status, 404, path);
    }
    assert.equal((await fetch(server.origin + '/lib/pricing-view.js')).status, 200);
    assert.equal((await fetch(server.origin + '/api/price-compare')).status, 404);
    assert.equal((await fetch(server.origin + '/api/analyze', {method: 'DELETE'})).status, 405);
  } finally { await server.close(); }
});

test('fixture HTTP price route always runs real handler, eBay adapter and pricing contract', async () => {
  const server = await startFixtureServer();
  try {
    for (const [scenario, status] of [
      ['matched', 'MATCHED_LISTING_TOTAL_UNVERIFIED'], ['unknown-shipping', 'MATCHED_LISTING_TOTAL_UNVERIFIED'],
      ['sandbox', 'SANDBOX_TEST_DATA_ONLY'], ['stale', 'PRICE_SOURCE_STALE'],
      ['empty', 'NO_VERIFIED_PRICE_AVAILABLE'], ['provider-error', 'PRICE_SOURCE_UNAVAILABLE'],
      ['wrong-brand', 'NO_VERIFIED_PRICE_AVAILABLE'], ['incompatible', 'NO_VERIFIED_PRICE_AVAILABLE']
    ]) {
      server.setScenario(scenario);
      const response = await fetch(server.origin + '/api/price-compare', {
        method: 'POST', headers: {'Content-Type': 'application/json', Origin: server.origin}, body: JSON.stringify(payload)
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.status, status, scenario);
      assert.equal(data.saving.amount, null);
      assert.equal(data.marketPrice.median, null);
      assert.equal(data.bestOffer, null);
      assert.doesNotMatch(JSON.stringify(data), /synthetic-secret|synthetic-client|synthetic-token/);
      const transport = server.state.transports.at(-1);
      assert.ok(transport.calls.some(call => call.url.includes('/item_summary/search?')));
      if (scenario === 'matched') {
        assert.equal(data.matchedListing.manufacturer, input.part.manufacturer);
        assert.equal(data.matchedListing.fitmentEvidence.engine, vehicle.engine);
        assert.equal(data.matchedListing.requestedQuantity, 2);
      }
      if (scenario === 'unknown-shipping') assert.equal(data.matchedListing.shippingEstimate, null);
      if (scenario === 'sandbox') {
        assert.equal(data.matchedListing, null);
        assert.equal(data.sandboxPreview.environment, 'sandbox');
      }
    }
    assert.deepEqual(server.state.failures, []);
    assert.deepEqual(server.state.unexpected, []);
  } finally { await server.close(); }
});

test('fixture API preserves actual cross-origin provenance checks', async () => {
  const server = await startFixtureServer();
  try {
    const response = await fetch(server.origin + '/api/price-compare', {
      method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'http://untrusted.invalid'}, body: JSON.stringify(payload)
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'PRICE_ORIGIN_MISMATCH');
    assert.equal(server.state.transports[0].calls.length, 0, 'Blocked requests must never enter even the synthetic transport');
  } finally { await server.close(); }
});


test('unavailable HTTP 503 health fixture disables all pricing without creating a provider transport', async () => {
  const server = await startFixtureServer({scenario: 'health-not-ready'});
  try {
    const response = await fetch(server.origin + '/api/health?market=US&locale=en-US&currency=USD');
    const health = await response.json();
    assert.equal(response.status, 503);
    assert.equal(health.ok, false);
    assert.equal(health.status, 'unavailable');
    assert.deepEqual(health.configured, {analysis: false, catalog: false, pricing: false});
    assert.equal(health.synthetic, true);
    assert.equal(health.capabilities.verifiedMarketPricing, false);
    assert.equal(health.capabilities.sandboxPricingPreview, false);
    assert.equal(server.state.transports.length, 0);
    assert.doesNotMatch(JSON.stringify(health), /synthetic-secret|synthetic-client|synthetic-token/);
  } finally { await server.close(); }
});
