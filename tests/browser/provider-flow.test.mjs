// SYNTHETIC TEST ONLY. Never navigates Vercel, eBay, or another external site.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {startFixtureServer} from './fixture-server.mjs';
import {input, vehicle} from '../fixtures/ebay-runtime-fixture.mjs';
import {buildFieldTestPdfBytes} from '../../lib/field-test-fixtures.js';

const VIEWPORTS = [
  {name: 'desktop', width: 1280, height: 900},
  {name: 'mobile', width: 390, height: 844}
];
const SECRET_PATTERNS = /synthetic-secret|synthetic-token|synthetic-client|EBAY_CLIENT_SECRET|OPENAI_API_KEY|AUTOPARTS_API_KEY/;
const upload = {
  name: 'SYNTHETIC-TEST-ONLY.pdf', mimeType: 'application/pdf',
  buffer: Buffer.from(buildFieldTestPdfBytes([
    'SYNTHETIC TEST ONLY - fictional estimate, never market evidence',
    'Fixture Brand FIXTURE-123, quantity 2, unit price 90.00 USD',
    'Total 180.00 USD'
  ]))
};
let browser;
const testPhases = new WeakMap();
function setPhase(page, phase) { testPhases.set(page, phase); }
function errorContext(page) { return {url: page.url(), phase: testPhases.get(page) || 'initializing'}; }
before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.WAFFER_TEST_CHROMIUM_EXECUTABLE ? {executablePath: process.env.WAFFER_TEST_CHROMIUM_EXECUTABLE} : {}),
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run']
  });
});
after(async () => { await browser?.close(); });

async function eventually(predicate, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(message);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function assertNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  assert.ok(dimensions.document <= dimensions.viewport + 1, `Document overflow: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.body <= dimensions.viewport + 1, `Body overflow: ${JSON.stringify(dimensions)}`);
}

async function runFixture(t, viewport, scenario, exercise) {
  const server = await startFixtureServer({scenario});
  const context = await browser.newContext({viewport: {width: viewport.width, height: viewport.height}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const runtimeErrors = [];
  const externalRequests = [];
  const clientLeaks = [];
  const responseChecks = [];
  page.on('pageerror', error => runtimeErrors.push({
    kind: 'pageerror', message: error.message, stack: error.stack || null, ...errorContext(page)
  }));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push({
      kind: 'console', message: message.text(), location: message.location(), ...errorContext(page)
    });
  });
  page.on('dialog', async dialog => {
    runtimeErrors.push({kind: 'dialog', message: `Unexpected dialog: ${dialog.message()}`, ...errorContext(page)});
    await dialog.dismiss();
  });
  context.on('page', newPage => {
    if (newPage !== page) runtimeErrors.push({
      kind: 'popup', message: 'Unexpected popup; listing links must never be followed in fixture tests',
      popupUrl: newPage.url(), ...errorContext(page)
    });
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== server.origin) {
      externalRequests.push(url.toString());
      return route.abort('blockedbyclient');
    }
    await route.continue();
  });
  page.on('response', response => {
    if (!/javascript|json|text\/html/.test(response.headers()['content-type'] || '')) return;
    responseChecks.push(response.text().then(body => {
      if (SECRET_PATTERNS.test(body)) clientLeaks.push(response.url());
    }).catch(() => {})); // An intentionally aborted obsolete response has no readable body.
  });
  try {
    setPhase(page, 'initial page navigation');
    await page.goto(server.origin);
    await page.locator('#syntheticTestBanner').waitFor({state: 'visible'});
    assert.match(await page.locator('#syntheticTestBanner').innerText(), /SYNTHETIC TEST ONLY/);
    await page.waitForFunction(() => typeof window.wafferRenderPricingListings === 'function' && !document.getElementById('make').disabled);
    await assertNoOverflow(page);
    setPhase(page, 'exercise scenario');
    await exercise({page, server});
    setPhase(page, 'final layout and runtime assertions');
    await assertNoOverflow(page);
    await Promise.all(responseChecks);
    assert.deepEqual(runtimeErrors, [], 'Browser runtime/console errors');
    assert.deepEqual(externalRequests, [], 'Requests must stay on the loopback fixture origin');
    assert.deepEqual(clientLeaks, [], 'No credential/token/configuration secrets may reach the client');
    assert.deepEqual(server.state.unexpected, [], 'Every browser request must have an explicit fixture route');
    assert.deepEqual(server.state.failures, [], 'Fixture server failures');
    assert.doesNotMatch(await page.content(), SECRET_PATTERNS);
    for (const transport of server.state.transports) {
      assert.ok(transport.calls.length > 0, 'Actual eBay adapter must use the injected transport');
      assert.ok(transport.calls.every(call => call.redirect === 'error'));
    }
  } catch (error) {
    const directory = resolve('test-results');
    const name = `${viewport.name}-${t.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 110)}`;
    try {
      await mkdir(directory, {recursive: true});
      await page.screenshot({path: resolve(directory, `${name}.png`), fullPage: true});
      await writeFile(resolve(directory, `${name}.json`), JSON.stringify({
        notice: 'SYNTHETIC TEST ONLY. No live/provider release evidence.',
        error: error.stack, ...errorContext(page), runtimeErrors, externalRequests, clientLeaks,
        requests: server.state.requests, unexpected: server.state.unexpected, failures: server.state.failures,
        pricingStatuses: server.state.prices.map(record => ({scenario: record.scenario, status: record.response?.status, completed: record.completed}))
      }, null, 2));
    } catch (artifactError) { t.diagnostic(`Could not save failure artifacts: ${artifactError.message}`); }
    throw error;
  } finally {
    await context.close();
    await server.close();
  }
}

async function beginAnalysis(page, {locale = 'en-US', waitForPrice = true} = {}) {
  setPhase(page, 'analysis: wait for home');
  await page.locator('#home').waitFor({state: 'visible'});
  setPhase(page, `analysis: select locale ${locale}`);
  await page.locator('#localeSelect').selectOption(locale);
  setPhase(page, 'analysis: upload synthetic PDF');
  await page.locator('#file').setInputFiles(upload);
  assert.match(await page.locator('#fileText').innerText(), /SYNTHETIC-TEST-ONLY\.pdf/);
  setPhase(page, 'analysis: enter and resolve vehicle identity');
  await page.locator('#make').selectOption('1');
  await page.locator('#model').fill(vehicle.model);
  await page.locator('#year').fill(vehicle.year);
  await page.locator('#vin').fill(vehicle.vin);
  await page.locator('#vin').blur();
  await page.waitForFunction(engine => window.wafferVehicle?.engine === engine, vehicle.engine);
  const identity = await page.locator('#vehicleInfo').innerText();
  assert.match(identity, /Ford/);
  assert.match(identity, /F-150/);
  assert.ok(identity.includes(vehicle.trim));
  assert.ok(identity.includes(vehicle.engine));
  setPhase(page, 'analysis: submit and wait for result');
  await page.locator('#analyzeBtn').click();
  await page.locator('#result').waitFor({state: 'visible'});
  assert.match(await page.locator('#rVehicleEvidence').innerText(), /Ford.*F-150/);
  assert.match(await page.locator('#currencyContext').innerText(), /USD/);
  await assertNoOverflow(page);
  setPhase(page, 'analysis: open details');
  await page.locator('#detailsBtn').click();
  await page.locator('#advanced').waitFor({state: 'visible'});
  if (waitForPrice) {
    setPhase(page, 'analysis: await pricing result and renderer');
    await page.waitForFunction(() => window.wafferPricingResults?.length === 1);
    await page.locator('#pricingListings article').waitFor({state: 'visible'});
  }
}

function assertUnpriced(response) {
  assert.equal(response.bestOffer, null);
  assert.equal(response.marketPrice.median, null);
  assert.equal(response.saving.amount, null);
  assert.equal(response.saving.status, 'NOT_CALCULATED');
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: actual upload and matched adapter response retain identity, currency and uncertain totals`, {timeout: 35_000}, async t => {
    await runFixture(t, viewport, 'matched', async ({page, server}) => {
      await beginAnalysis(page);
      assert.equal(server.state.analyses.length, 1);
      assert.equal(server.state.analyses[0].mimeType, 'application/pdf');
      assert.ok(server.state.analyses[0].fileData.includes('JVBER'), 'The actual PDF upload must reach the stub analysis route');
      assert.equal(server.state.prices.length, 1);
      const {request, response} = server.state.prices[0];
      assert.equal(request.manufacturer, input.part.manufacturer);
      assert.equal(request.partNumber, input.part.number);
      for (const key of ['vin', 'year', 'make', 'model', 'trim', 'engine']) assert.equal(request.vehicle[key], vehicle[key]);
      assert.equal(response.status, 'MATCHED_LISTING_TOTAL_UNVERIFIED');
      assert.equal(response.matchedListing.manufacturer, 'Fixture Brand');
      assert.equal(response.matchedListing.identityBasis, 'EXACT_MPN_AND_BRAND');
      for (const key of ['year', 'make', 'model', 'trim', 'engine']) assert.equal(response.matchedListing.fitmentEvidence[key], vehicle[key]);
      assert.equal(response.matchedListing.currency, 'USD');
      assert.equal(response.matchedListing.requestedQuantity, 2);
      assertUnpriced(response);
      const text = await page.locator('#pricingListings').innerText();
      assert.match(text, /FIXTURE-123/);
      assert.match(text, /Price per listing unit: 40\.00 USD/);
      assert.match(text, /Shipping estimate: 5\.00 USD/);
      assert.match(text, /Tax and checkout total: unknown/);
      assert.match(text, /No confirmed savings/);
      assert.match(text, /Pack size and units are unverified/);
      assert.doesNotMatch(text, /45\.00|savings.*90\.00/i);
      assert.match(await page.locator('#itemsBody').innerText(), /Fixture Brand/);
      const link = page.locator('#pricingListings a');
      assert.equal(await link.count(), 1);
      assert.equal(await link.getAttribute('href'), 'https://www.ebay.com/itm/synthetic');
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
      assert.match(await page.locator('#confirmedSavingLabel').innerText(), /not calculated/);
      // Inspect the link only. Never navigate it, even though its URL has a genuine provider host.
      for (let i = 0; i < 2; i++) {
        const received = page.waitForResponse(response => response.url() === `${server.origin}/api/price-compare`);
        await page.locator('#pricingRetryBtn').click();
        await (await received).finished();
        await eventually(() => server.state.prices.length === i + 2 && server.state.prices.at(-1).completed, 'Repeated price request did not finish');
        await page.waitForFunction(() => window.wafferPricingResults?.length === 1);
        assert.equal(await page.locator('#pricingListings article').count(), 1);
      }
      await page.locator('#backBtn').click();
      await page.locator('#result').waitFor({state: 'visible'});
      await page.locator('#detailsBtn').click();
      assert.equal(await page.locator('#pricingListings article').count(), 1);
      assert.equal(server.state.prices.length, 3, 'View navigation must not duplicate the provider request');
    });
  });

  test(`${viewport.name}: unknown shipping remains visibly unknown`, {timeout: 30_000}, async t => {
    await runFixture(t, viewport, 'unknown-shipping', async ({page, server}) => {
      await beginAnalysis(page);
      const response = server.state.prices[0].response;
      assert.equal(response.matchedListing.shippingEstimate, null);
      assertUnpriced(response);
      assert.match(await page.locator('#pricingListings').innerText(), /Shipping: unknown/);
      assert.doesNotMatch(await page.locator('#pricingListings').innerText(), /Shipping.*0\.00/);
    });
  });

  test(`${viewport.name}: Sandbox stays visibly test-only and has no purchase link`, {timeout: 30_000}, async t => {
    await runFixture(t, viewport, 'sandbox', async ({page, server}) => {
      await beginAnalysis(page);
      const response = server.state.prices[0].response;
      assert.equal(response.status, 'SANDBOX_TEST_DATA_ONLY');
      assert.equal(response.matchedListing, null);
      assert.equal(response.sandboxPreview.environment, 'sandbox');
      assertUnpriced(response);
      assert.match(await page.locator('#pricingListings').innerText(), /SANDBOX TEST DATA ONLY/);
      assert.match(await page.locator('#confirmedSavingLabel').innerText(), /Sandbox: test data only/);
      assert.match(await page.locator('#savingNote').innerText(), /not real prices/);
      assert.equal(await page.locator('#pricingListings a').count(), 0);
      assert.ok(server.state.transports[0].calls.every(call => new URL(call.url).hostname === 'api.sandbox.ebay.com'));
    });
  });

  test(`${viewport.name}: stale, empty, provider-error and contradictory identity fail closed`, {timeout: 50_000}, async t => {
    await runFixture(t, viewport, 'stale', async ({page, server}) => {
      for (const [index, [scenario, status]] of [
        ['stale', 'PRICE_SOURCE_STALE'], ['empty', 'NO_VERIFIED_PRICE_AVAILABLE'],
        ['provider-error', 'PRICE_SOURCE_UNAVAILABLE'], ['wrong-brand', 'NO_VERIFIED_PRICE_AVAILABLE'],
        ['incompatible', 'NO_VERIFIED_PRICE_AVAILABLE']
      ].entries()) {
        server.setScenario(scenario);
        if (index === 0) await beginAnalysis(page);
        else {
          const received = page.waitForResponse(response => response.url() === `${server.origin}/api/price-compare`);
          await page.locator('#pricingRetryBtn').click();
          await (await received).finished();
          await eventually(() => server.state.prices.length === index + 1 && server.state.prices.at(-1).completed, `${scenario} request did not finish`);
          await page.waitForFunction(status => window.wafferPricingResults?.[0]?.data?.status === status, status);
        }
        const response = server.state.prices.at(-1).response;
        assert.equal(response.status, status);
        assert.equal(response.matchedListing, null);
        assertUnpriced(response);
        assert.match(await page.locator('#pricingListings').innerText(), /No fresh matched listing/);
        assert.equal(await page.locator('#pricingListings a').count(), 0);
        assert.match(await page.locator('#confirmedSavingLabel').innerText(), /not calculated/);
        await assertNoOverflow(page);
      }
      await page.waitForFunction(() => window.wafferCatalogState?.status === 'COMPLETED' && window.wafferCatalogState.matched === 0);
      assert.equal(await page.locator('#catalogMatchLabel').count(), 1, 'Rendered no-match catalog must retain its localized heading');
      setPhase(page, 'catalog no-match: switch locale with rendered results');
      // The language control is in the hidden home section. Force a native select change
      // to exercise the actual locale handler against the populated catalog DOM.
      await page.locator('#localeSelect').selectOption('ar-US', {force: true});
      assert.equal(await page.locator('#catalogMatchLabel').count(), 1);
      assert.match(await page.locator('#catalogMatchLabel').innerText(), /كتالوج/);
      await assertNoOverflow(page);
      await page.locator('#localeSelect').selectOption('en-US', {force: true});
      assert.equal(await page.locator('#catalogMatchLabel').count(), 1);
      assert.match(await page.locator('#catalogMatchLabel').innerText(), /catalog/i);
    });
  });

  test(`${viewport.name}: Arabic RTL uses the real renderer and treats seller markup as text`, {timeout: 30_000}, async t => {
    await runFixture(t, viewport, 'hostile-seller', async ({page, server}) => {
      await beginAnalysis(page, {locale: 'ar-US'});
      assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).direction), 'rtl');
      assert.equal(server.state.prices[0].request.locale, 'ar-US');
      const text = await page.locator('#pricingListings').innerText();
      assert.match(text, /إعلان eBay مطابق/);
      assert.match(text, /40\.00 USD/);
      assert.match(text, /لا يوجد توفير مؤكد/);
      assert.match(text, /<img src=x onerror=alert\(1\)>/);
      assert.equal(await page.locator('#pricingListings img, #pricingListings script').count(), 0);
      assert.match(await page.locator('#confirmedSavingLabel').innerText(), /غير محسوب/);
    });
  });

  test(`${viewport.name}: newer analysis wins over delayed pricing; clear and browser back-forward never restore old offers`, {timeout: 45_000}, async t => {
    await runFixture(t, viewport, 'matched', async ({page, server}) => {
      setPhase(page, 'newer analysis: hold obsolete price response');
      const releaseOldPrice = server.holdNextPrice();
      await beginAnalysis(page, {waitForPrice: false});
      await eventually(() => server.state.prices[0]?.response != null, 'The obsolete provider response did not become pending');
      assert.equal(server.state.prices[0].completed, false);
      setPhase(page, 'newer analysis: clear first analysis with price response pending');
      await page.locator('#newAnalysisBtn').click();
      await page.locator('#home').waitFor({state: 'visible'});
      assert.equal(await page.locator('#catalogMatchLabel').count(), 1, 'Reset must preserve the catalog heading used by localization');
      assert.equal(await page.locator('#pricingListings article').count(), 0);
      assert.equal(await page.locator('#file').inputValue(), '');
      server.setScenario('empty');
      await beginAnalysis(page);
      assert.equal(server.state.prices[1].response.status, 'NO_VERIFIED_PRICE_AVAILABLE');
      setPhase(page, 'newer analysis: release obsolete response after newer result');
      releaseOldPrice();
      await eventually(() => server.state.prices[0].completed, 'The obsolete fixture response did not finish');
      await page.waitForFunction(() => window.wafferPricingResults?.[0]?.data?.status === 'NO_VERIFIED_PRICE_AVAILABLE');
      assert.equal(await page.locator('#pricingListings a').count(), 0);
      assert.match(await page.locator('#pricingListings').innerText(), /No fresh matched listing/);
      assert.equal(server.state.analyses.length, 2);
      setPhase(page, 'newer analysis: clear completed second analysis');
      await page.locator('#newAnalysisBtn').click();
      assert.equal(await page.locator('#catalogMatchLabel').count(), 1, 'Every reset must retain exactly one catalog heading');
      assert.equal(await page.locator('#pricingListings article').count(), 0);
      assert.equal(await page.evaluate(() => window.wafferPricingResults.length), 0);
      setPhase(page, 'history: navigate away after clearing');
      await page.goto(`${server.origin}/__fixture/away`);
      await page.locator('#away').waitFor();
      setPhase(page, 'history: back to cleared home');
      await page.goBack();
      await page.locator('#home').waitFor({state: 'visible'});
      assert.equal(await page.locator('#pricingListings article').count(), 0);
      assert.equal(await page.locator('#file').inputValue(), '');
      setPhase(page, 'history: forward to local away page');
      await page.goForward();
      await page.locator('#away').waitFor();
      setPhase(page, 'history: back to cleared home');
      await page.goBack();
      await page.locator('#home').waitFor({state: 'visible'});
      assert.equal(await page.locator('#pricingListings article').count(), 0);
      assert.equal(server.state.prices.length, 2, 'History traversal must not resurrect or refetch a cleared estimate');
    });
  });
}
