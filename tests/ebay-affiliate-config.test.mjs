import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getEbayAffiliateCampaignConfig } from '../lib/price-providers/ebay-affiliate-config.js';
import { createEbayUsShadowProvider } from '../lib/price-providers/ebay-us.js';
import { getEbayRuntimeReadiness, createConfiguredEbayRuntimeProvider } from '../lib/price-providers/ebay-runtime-registry.js';
import { getEbayShadowReadiness, createConfiguredEbayShadowProvider, createConfiguredEbaySandboxProvider } from '../lib/price-providers/ebay-shadow-registry.js';
import { createPriceCompareHandler } from '../api/price-compare.js';
import { lookupVerifiedPricing } from '../lib/price-provider.js';
import { fixtureNow, input, vehicle, listing, releaseFixture, productionEnv, fixtureTransport } from './fixtures/ebay-runtime-fixture.mjs';

// Fictional identifiers used only by offline transport; not assigned/verified campaigns.
const campaign = '1234567890';
const options = () => ({ releaseEvidence: releaseFixture(), now: fixtureNow, clock: () => fixtureNow });
const shadowEnv = { ...productionEnv, EBAY_SHADOW_ENABLED: 'true' };
const sandboxEnv = { VERCEL_ENV: 'preview', WAFFER_PRICE_PROVIDER_MODE: 'sandbox', EBAY_SANDBOX_CLIENT_ID: 'synthetic', EBAY_SANDBOX_CLIENT_SECRET: 'synthetic', EBAY_SANDBOX_SHADOW_ENABLED: 'true' };

for (const value of [undefined, null, '']) test('absent campaign '+String(value)+' preserves non-affiliate operation', () => {
  assert.deepEqual(getEbayAffiliateCampaignConfig(value), { configured: false, valid: true, campaignId: null });
});
for (const value of ['8008550', '123456789', '12345678901', '１２３４５６７８９０', '١٢٣٤٥٦٧٨٩٠', ' 1234567890', '1234567890 ', '1234567890\n', '1234567890,affiliateReferenceId=x', '1234567890\r\nInjected: yes', ' ', 1234567890, true, {}]) {
  test('invalid explicit campaign '+JSON.stringify(value)+' blocks production before transport', () => {
    const transport = fixtureTransport();
    assert.equal(getEbayAffiliateCampaignConfig(value).valid, false);
    assert.throws(() => createEbayUsShadowProvider({ affiliateCampaignId: value, fetchImpl: transport.fetchImpl }), /EBAY_AFFILIATE_CAMPAIGN_ID_INVALID/);
    const env = { ...shadowEnv, EBAY_AFFILIATE_CAMPAIGN_ID: value };
    assert.equal(getEbayShadowReadiness(env).ready, false);
    assert.equal(createConfiguredEbayShadowProvider(env, { fetchImpl: transport.fetchImpl }), null);
    assert.equal(createConfiguredEbayRuntimeProvider(env, { ...options(), fetchImpl: transport.fetchImpl }), null);
    assert.ok(getEbayRuntimeReadiness(env, options()).blockers.includes('EBAY_AFFILIATE_CAMPAIGN_ID_INVALID'));
    assert.equal(transport.calls.length, 0);
  });
}

for (const route of ['adapter', 'runtime', 'shadow']) test(route+' sends configured campaign to Browse only', async () => {
  const transport = fixtureTransport();
  const env = { ...shadowEnv, EBAY_AFFILIATE_CAMPAIGN_ID: campaign };
  const provider = route === 'adapter'
    ? createEbayUsShadowProvider({ clientId: 'synthetic', clientSecret: 'synthetic', productionAccessApproved: true, affiliateCampaignId: campaign, fetchImpl: transport.fetchImpl })
    : route === 'runtime' ? createConfiguredEbayRuntimeProvider(env, { ...options(), fetchImpl: transport.fetchImpl })
      : createConfiguredEbayShadowProvider(env, { fetchImpl: transport.fetchImpl });
  assert.ok((await provider.lookup(input)).matchedListing);
  assert.ok(transport.calls.some(c => c.url.includes('/buy/browse/')));
  assert.ok(transport.calls.some(c => c.url.includes('/commerce/taxonomy/')));
  assert.ok(transport.calls.some(c => c.url.includes('/oauth2/token')));
  for (const call of transport.calls) {
    assert.equal(call.headers['X-EBAY-C-ENDUSERCTX'], call.url.includes('/buy/browse/') ? 'affiliateCampaignId='+campaign : undefined);
    assert.ok(!String(call.body || '').includes('affiliateCampaignId'));
  }
});

test('absent campaign makes no attribution header or fabricated affiliate URL', async () => {
  const transport = fixtureTransport();
  const provider = createConfiguredEbayRuntimeProvider(productionEnv, { ...options(), fetchImpl: transport.fetchImpl });
  const result = await provider.lookup(input);
  assert.equal(result.matchedListing.sourceUrl, listing().sourceUrl);
  assert.ok(transport.calls.every(c => c.headers['X-EBAY-C-ENDUSERCTX'] === undefined));
});

for (const value of [campaign, '8008550']) test('Sandbox registries ignore production campaign '+value, async () => {
  for (const factory of [createConfiguredEbayRuntimeProvider, createConfiguredEbaySandboxProvider]) {
    const transport = fixtureTransport({ environment: 'sandbox' });
    const provider = factory({ ...sandboxEnv, EBAY_AFFILIATE_CAMPAIGN_ID: value }, { fetchImpl: transport.fetchImpl });
    const result = await provider.lookup(input);
    assert.equal(result.matchedListing, null);
    assert.equal(result.bestOffer, null);
    assert.equal(result.sandboxPreview?.mock, true);
    assert.ok(transport.calls.every(c => c.url.startsWith('https://api.sandbox.ebay.com/') && c.headers['X-EBAY-C-ENDUSERCTX'] === undefined));
  }
});

test('direct Sandbox adapter never transmits even a valid campaign', async () => {
  const transport = fixtureTransport({ environment: 'sandbox' });
  const provider = createEbayUsShadowProvider({ clientId: 'synthetic', clientSecret: 'synthetic', environment: 'sandbox', affiliateCampaignId: campaign, fetchImpl: transport.fetchImpl });
  await provider.lookup(input);
  assert.ok(transport.calls.every(c => c.headers['X-EBAY-C-ENDUSERCTX'] === undefined));
});

for (const affiliateUrl of ['https://www.ebay.com/itm/synthetic?campid='+campaign+'&customid=fixture', null]) test('returned affiliate URL or plain fallback remains unchanged: '+affiliateUrl, async () => {
  const transport = fixtureTransport({ item: { itemAffiliateWebUrl: affiliateUrl } });
  const provider = createConfiguredEbayRuntimeProvider({ ...productionEnv, EBAY_AFFILIATE_CAMPAIGN_ID: campaign }, { ...options(), fetchImpl: transport.fetchImpl });
  const result = await provider.lookup(input);
  assert.equal(result.matchedListing.sourceUrl, affiliateUrl || listing().sourceUrl);
  assert.equal(result.bestOffer, null);
  assert.equal(result.matchedListing.totalVerified, false);
});

test('request bodies cannot override server campaign or add end-user context', async () => {
  const transport = fixtureTransport();
  const provider = createConfiguredEbayRuntimeProvider({ ...productionEnv, EBAY_AFFILIATE_CAMPAIGN_ID: campaign }, { ...options(), fetchImpl: transport.fetchImpl });
  let args;
  const handler = createPriceCompareHandler({ lookupPricing: value => {
    args = value;
    return lookupVerifiedPricing({ ...value, provider, now: fixtureNow });
  } });
  let status;
  await handler({ method: 'POST', body: { partName: input.part.name, partNumber: input.part.number, manufacturer: input.part.manufacturer, vehicle, market: 'US', currency: 'USD', affiliateCampaignId: '9999999999', EBAY_AFFILIATE_CAMPAIGN_ID: '9999999999', affiliateReferenceId: 'private-reference', contextualLocation: 'private-location', headers: { 'X-EBAY-C-ENDUSERCTX': 'injected' } } }, { setHeader() {}, status(n) { status=n; return this; }, json() {} });
  assert.equal(status, 200);
  assert.equal(args.affiliateCampaignId, undefined);
  for (const call of transport.calls) {
    assert.equal(call.headers['X-EBAY-C-ENDUSERCTX'], call.url.includes('/buy/browse/') ? 'affiliateCampaignId='+campaign : undefined);
    assert.doesNotMatch(JSON.stringify(call), /9999999999|private-reference|private-location|injected/);
  }
});

test('campaign does not open pending production or disabled gates', () => {
  const env = { ...productionEnv, EBAY_AFFILIATE_CAMPAIGN_ID: campaign };
  assert.equal(createConfiguredEbayRuntimeProvider(env), null);
  assert.ok(getEbayRuntimeReadiness(env).blockers.includes('RELEASE_REVIEW_REQUIRED'));
  assert.equal(createConfiguredEbayRuntimeProvider({ ...env, WAFFER_PRICE_PROVIDER_MODE: 'disabled' }, options()), null);
});

test('cached provider identity changes with production campaign and remains isolated in Sandbox', async () => {
  // Isolated temporary module graph with the existing synthetic release fixture.
  // Never modify committed evidence, create credentials or call any provider.
  const dir = mkdtempSync(join(tmpdir(), 'waffer-affiliate-fixture-'));
  const originalNow = Date.now;
  try {
    const root = new URL('../', import.meta.url);
    cpSync(new URL('lib', root), join(dir, 'lib'), { recursive: true });
    cpSync(new URL('docs', root), join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    writeFileSync(join(dir, 'docs/EBAY_PRICING_RELEASE.json'), JSON.stringify(releaseFixture()));
    Date.now = () => fixtureNow;
    const registry = await import(pathToFileURL(join(dir, 'lib/price-providers/ebay-runtime-registry.js')));
    const env = { ...productionEnv, EBAY_AFFILIATE_CAMPAIGN_ID: campaign };
    const first = registry.createConfiguredEbayRuntimeProvider(env);
    assert.ok(first);
    assert.equal(first, registry.createConfiguredEbayRuntimeProvider(env));
    const changed = registry.createConfiguredEbayRuntimeProvider({ ...env, EBAY_AFFILIATE_CAMPAIGN_ID: '0987654321' });
    assert.notEqual(first, changed);
    const removed = registry.createConfiguredEbayRuntimeProvider(productionEnv);
    assert.notEqual(changed, removed);
    assert.equal(registry.createConfiguredEbayRuntimeProvider({ ...env, EBAY_AFFILIATE_CAMPAIGN_ID: '8008550' }), null);
    assert.notEqual(removed, registry.createConfiguredEbayRuntimeProvider(productionEnv));
    const sandbox = registry.createConfiguredEbayRuntimeProvider(sandboxEnv);
    assert.equal(sandbox, registry.createConfiguredEbayRuntimeProvider({ ...sandboxEnv, EBAY_AFFILIATE_CAMPAIGN_ID: campaign }));
  } finally {
    Date.now = originalNow;
    rmSync(dir, { recursive: true, force: true });
  }
});
