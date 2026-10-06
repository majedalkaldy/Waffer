// SYNTHETIC TEST ONLY. This local harness must never be deployed or used as market evidence.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createPriceCompareHandler } from '../../api/price-compare.js';
import { createEbayUsShadowProvider } from '../../lib/price-providers/ebay-us.js';
import { lookupVerifiedPricing } from '../../lib/price-provider.js';
import { fixtureTransport, input, vehicle } from '../fixtures/ebay-runtime-fixture.mjs';

const ROOT = new URL('../../', import.meta.url);
// Never resolve a request path against the filesystem. Only these literal assets are served.
const ASSETS = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/styles.css', 'styles.css'],
  ['/app.js', 'app.js'], ['/app-module.js', 'app-module.js'], ['/vin-ui.js', 'vin-ui.js'],
  ['/parts-match.js', 'parts-match.js'],
  ...['i18n', 'runtime-config', 'total-check', 'image-optimization', 'identity',
    'pricing-client', 'pricing-view', 'matched-listing', 'field-test-client', 'diagnostic-privacy',
    'field-test-fixtures', 'field-test-evidence-validator'].map(name => [`/lib/${name}.js`, `lib/${name}.js`])
]);
const SCENARIOS = new Set(['matched', 'unknown-shipping', 'sandbox', 'stale', 'empty',
  'provider-error', 'wrong-brand', 'incompatible', 'hostile-seller', 'health-not-ready']);
const BANNER = '<aside id="syntheticTestBanner" class="card" role="note">SYNTHETIC TEST ONLY · Fictional fixtures · No live provider calls · Not release or market evidence</aside>';
const SYNTHETIC_SECRET = 'synthetic-secret';
const SAFE_HOSTS = new Set(['api.ebay.com', 'api.sandbox.ebay.com']);

function json(res, value, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

async function bodyOf(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error('Fixture request too large');
  }
  return JSON.parse(body || '{}');
}

function analysisFixture(body, sequence) {
  return {
    synthetic: true, requestId: `SYNTHETIC-TEST-${sequence}`, engineVersion: 'mvp-2026-09',
    completedAt: new Date().toISOString(),
    engineContext: {market: 'US', locale: body.vehicle?.locale || 'en-US', currency: 'USD'},
    total: '180.00 USD', calculatedTotal: '180.00 USD', status: 'SYNTHETIC TEST ONLY',
    transparency: 70, identityConfidence: 60, compatibilityConfidence: 50,
    priceConfidence: 0, overallConfidence: 50, missing: [], conflicts: [], nextActions: [],
    items: [{name: 'Fixture Brand synthetic test part', manufacturer: input.part.manufacturer,
      partNumber: input.part.number, price: '90.00 USD', quantity: 2, itemType: 'part',
      identityConfidence: 60, compatibility: 'SYNTHETIC TEST ONLY',
      priceAssessment: 'Not a verified checkout total', conflict: 'None in fictional fixture'}],
    acceptance: {schemaValid: true, hasItems: true, hasPrintedTotal: true, hasConfidence: true, itemCount: 1}
  };
}

export async function startFixtureServer({scenario = 'matched'} = {}) {
  if (!SCENARIOS.has(scenario)) throw new Error(`Unknown fixture scenario: ${scenario}`);
  const state = {scenario, requests: [], analyses: [], prices: [], transports: [], unexpected: [], failures: []};
  const pending = new Set();
  let nextPriceHold = null;
  let origin;

  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      if (req.headers.host !== new URL(origin).host) return json(res, {error: 'Fixture host required'}, 403);
      const url = new URL(req.url, origin);
      const route = url.pathname;
      state.requests.push({method: req.method, path: route});
      if (req.method === 'POST' && route === '/api/analyze') {
        const body = await bodyOf(req);
        state.analyses.push(body);
        return json(res, analysisFixture(body, state.analyses.length));
      }
      if (req.method === 'POST' && route === '/api/price-compare') {
        const body = await bodyOf(req);
        const mode = state.scenario;
        const hold = nextPriceHold;
        nextPriceHold = null;
        const record = {scenario: mode, request: body, response: null, completed: false};
        state.prices.push(record);
        const environment = mode === 'sandbox' ? 'sandbox' : 'production';
        const transport = fixtureTransport({
          environment,
          empty: mode === 'empty',
          status: mode === 'provider-error' ? 503 : 200,
          compatibility: mode === 'incompatible' ? 'NOT_COMPATIBLE' : 'COMPATIBLE',
          item: mode === 'unknown-shipping' ? {shippingOptions: []}
            : mode === 'wrong-brand' ? {brand: 'Wrong Fixture Brand'}
              : mode === 'hostile-seller' ? {seller: {username: '<img src=x onerror=alert(1)>'}} : {}
        });
        state.transports.push(transport);
        const now = Date.now();
        // This adapter sees fictional credentials only and cannot reach global fetch.
        const provider = createEbayUsShadowProvider({
          clientId: 'synthetic-client', clientSecret: SYNTHETIC_SECRET,
          environment, productionAccessApproved: true, requireBrand: true,
          now: () => now - (mode === 'stale' ? 300_001 : 0),
          fetchImpl: async (target, options) => {
            if (!SAFE_HOSTS.has(new URL(target).hostname)) throw new Error('Unexpected fixture transport target');
            return transport.fetchImpl(target, options);
          }
        });
        const handler = createPriceCompareHandler({
          lookupPricing: args => lookupVerifiedPricing({...args, provider, now})
        });
        const adapter = {
          setHeader: (key, value) => res.setHeader(key, value),
          status(code) { res.statusCode = code; return this; },
          json(value) { record.response = value; }
        };
        await handler({method: req.method, headers: req.headers, body}, adapter);
        if (hold) await hold.promise;
        record.completed = true;
        if (!res.destroyed) json(res, record.response, res.statusCode);
        return;
      }
      if (req.method !== 'GET') return json(res, {error: 'Fixture method not allowed'}, 405);
      if (route === '/api/health') {
        if (state.scenario === 'health-not-ready') return json(res, {
          ok: false, status: 'unavailable', service: 'waffer', synthetic: true,
          configured: {analysis: false, catalog: false, pricing: false},
          upstream: {analysis: 'not_configured', catalog: 'not_configured'},
          verification: {analysis: 'unavailable', catalog: 'unavailable'},
          latency: {catalogMs: null},
          capabilities: {
            quoteAnalysis: false, quoteAnalysisVerified: false, vinAndCatalog: false,
            verifiedMarketPricing: false, sandboxPricingPreview: false,
            ebayShadowPricingReady: false, ebaySandboxReady: false, persistentAccounts: false
          }
        }, 503);
        return json(res, {
          ok: true, status: 'ready', synthetic: true, capabilities: {
            verifiedMarketPricing: state.scenario !== 'sandbox', sandboxPricingPreview: state.scenario === 'sandbox'
          }
        });
      }
      if (route === '/api/vehicles') return json(res, {manufacturers: [{manufacturerId: 1, manufacturerName: vehicle.make}]});
      if (route === '/api/vin') return json(res, {
        matchingManufacturers: [{manufacturerId: 1, manufacturerName: vehicle.make}],
        matchingModels: [{modelId: 2, manufacturerId: 1, modelName: vehicle.model}],
        matchingVehicles: [{vehicleId: 3, modelId: 2, manufacturerId: 1, year: vehicle.year,
          vehicleTypeDescription: `SYNTHETIC TEST ONLY ${vehicle.trim}`}]
      });
      if (route === '/api/vin-us') return json(res, {...vehicle, source: 'NHTSA_VPIC', decoded: true, clean: true, synthetic: true});
      if (route === '/api/products') return json(res, {products: []});
      if (route === '/docs/FIELD_TEST_RESULTS.json' || route === '/docs/FIELD_TEST_AUTOMATION.json') {
        return json(res, {synthetic: true, status: 'PENDING', scenarios: []});
      }
      if (route === '/manifest.webmanifest') return json(res, {name: 'SYNTHETIC TEST ONLY', short_name: 'Fixture', start_url: '/', display: 'standalone', icons: []});
      if (route === '/favicon.ico') { res.statusCode = 204; return res.end(); }
      if (route === '/sw.js') {
        // Deliberately no caching/fetch interception: browser tests cannot hide network paths in a worker.
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        return res.end("// SYNTHETIC TEST ONLY. No caching or external requests.\nself.addEventListener('install', () => self.skipWaiting());\n");
      }
      if (route === '/__fixture/away') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Synthetic navigation</title></head><body>${BANNER}<p id="away">SYNTHETIC navigation destination</p></body></html>`);
      }
      const asset = ASSETS.get(route);
      if (!asset) {
        state.unexpected.push(route);
        return json(res, {error: 'Not on the fixture asset allowlist'}, 404);
      }
      let content = await readFile(new URL(asset, ROOT), 'utf8');
      if (asset === 'index.html') content = content.replace('<body>', `<body>${BANNER}`);
      res.setHeader('Content-Type', asset.endsWith('.js') ? 'text/javascript; charset=utf-8'
        : asset.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8');
      res.end(content);
    } catch (error) {
      state.failures.push(error.message);
      if (!res.destroyed) json(res, {error: 'Synthetic fixture server failed'}, 500);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, state,
    setScenario(value) {
      if (!SCENARIOS.has(value)) throw new Error(`Unknown fixture scenario: ${value}`);
      state.scenario = value;
    },
    holdNextPrice() {
      if (nextPriceHold) throw new Error('A held request is already scheduled');
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      const hold = {promise, release: () => { pending.delete(hold); release(); }};
      nextPriceHold = hold;
      pending.add(hold);
      return hold.release;
    },
    async close() {
      for (const hold of pending) hold.release();
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  };
}
