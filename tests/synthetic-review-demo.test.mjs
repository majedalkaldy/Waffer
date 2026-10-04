import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEMO_VEHICLES, DEMO_PARTS, DEMO_SCENARIOS, simulateReview } from '../review-demo/fixtures.js';
import { hasConfiguredPriceProvider, normalizeVerifiedOffer } from '../lib/price-provider.js';
import { evaluatePriceProviderSample } from '../lib/price-provider-sample-validator.js';
import { validateEbayPilotInput } from '../lib/price-providers/ebay-pilot-input.js';
import priceCompare from '../api/price-compare.js';
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const input = { vehicleId: 'demo-sedan', partId: 'demo-filter', scenarioId: 'match', quantity: 1 };

test('every synthetic scenario is explicit and cannot become a production offer', () => {
  for (const vehicle of DEMO_VEHICLES) for (const part of DEMO_PARTS) for (const scenario of DEMO_SCENARIOS) for (const quantity of [1, 2, 3, 4]) {
    const result = simulateReview({ vehicleId: vehicle.id, partId: part.id, scenarioId: scenario.id, quantity });
    assert.equal(result.productionEligible, false);
    assert.equal(result.mode, 'synthetic-review');
    assert.equal(result.status, `SIMULATED_${scenario.id.toUpperCase()}`);
    assert.equal(result.bestOffer, undefined);
    assert.equal(result.checkedAt, undefined);
    assert.equal(result.sourceUrl, undefined);
    assert.equal(normalizeVerifiedOffer(result.illustration, {expectedCurrency:'USD', requestedPartNumber: part.number}), null);
    if (scenario.id === 'match') assert.equal(result.illustration.totalCents, part.cents * quantity + 400);
    else assert.equal(result.illustration, null);
    assert.equal(validateEbayPilotInput({ cases: [result] }, {environment: 'sandbox'}).valid, false);
    assert.equal(evaluatePriceProviderSample({ cases: [result] }).productionEligible, false);
  }
});

test('unknown choices and invalid quantities fail closed; reruns do not share mutable results', () => {
  for (const patch of [{vehicleId:'real-car'}, {partId:'real-part'}, {scenarioId:'production'}, {quantity:0}, {quantity:5}, {quantity:1.5}, {quantity:'1'}]) {
    assert.equal(simulateReview({...input, ...patch}).status, 'INVALID_DEMO_INPUT');
  }
  const first = simulateReview(input); first.illustration.totalCents = 0;
  assert.equal(simulateReview(input).illustration.totalCents, 2200);
});

test('normal public pricing stays unconfigured even if demo fields and fake offers are submitted', async () => {
  for (const market of ['US', 'SA']) {
    assert.equal(hasConfiguredPriceProvider(market), false);
    const res = { setHeader() {}, status(code) {this.statusCode=code;return this;}, json(body) {this.body=body;} };
    await priceCompare({method:'POST', body:{ market, locale:'en-US', partNumber:'DEMO-FILTER-001', partName:'Fictional oil filter', vehicle:{vehicleId:123}, workshopPrice:100, demo:true, scenario:'match', bestOffer:simulateReview(input).illustration }}, res);
    assert.equal(res.body.pricingProvider.status, 'NOT_CONFIGURED');
    assert.equal(res.body.status, 'WAITING_FOR_VERIFIED_PRICE_SOURCE');
    assert.equal(res.body.bestOffer, null);
    assert.equal(res.body.marketPrice.median, null);
    assert.equal(res.body.saving.amount, null);
  }
});

test('fixture graph is isolated from production code and has no network or persistence operations', () => {
  const walk = directory => fs.readdirSync(new URL(`../${directory}`, import.meta.url), {withFileTypes:true}).flatMap(item => item.isDirectory() ? walk(`${directory}/${item.name}`) : [`${directory}/${item.name}`]);
  for (const file of [...walk('api'), ...walk('lib'), 'app.js', 'app-module.js', 'index.html', 'vin-ui.js', 'parts-match.js']) {
    assert.doesNotMatch(read(file), /review-demo|simulateReview|DEMO-FILTER-001/, file);
  }
  for (const file of ['review-demo/app.js', 'review-demo/fixtures.js']) {
    assert.doesNotMatch(read(file), /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|serviceWorker|https?:\/\//, file);
  }
  assert.doesNotMatch(read('sw.js').split('const SHELL = ')[1].split(';')[0], /review-demo/);
  assert.match(read('sw.js'), /url\.pathname\.startsWith\('\/review-demo\/'\)\) return/);
});

test('demo uses strong labels, same-origin assets, responsive layout and explicit no-index/no-cache metadata', () => {
  const html = read('review-demo/index.html');
  assert.match(html, /Synthetic demo · Fictional data · No live eBay calls/);
  assert.match(html, /not eBay Sandbox API evidence/);
  assert.match(html, /VERIFIED_PRICE_PROVIDER_MISSING/);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(html, /<style\b|style=|\son\w+=|https?:\/\//);
  assert.match(html, /aria-live="polite"/);
  assert.match(read('review-demo/styles.css'), /@media\(max-width:720px\)/);
  const rule = JSON.parse(read('vercel.json')).headers.find(rule => rule.source === '/review-demo(.*)');
  assert.ok(rule.headers.some(h => h.key === 'Cache-Control' && h.value === 'no-store'));
  assert.ok(rule.headers.some(h => h.key === 'X-Robots-Tag' && h.value === 'noindex, nofollow'));
});
