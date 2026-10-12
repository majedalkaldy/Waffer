import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import readinessHandler from '../api/readiness.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const startup = app.slice(app.indexOf('let healthCheckRun=0;'), app.indexOf('let deferredInstallPrompt=null;'));
function harness(fetch, timers = {}) {
  const el = {textContent: '', classList: {remove() {}, add() {}}};
  const context = vm.createContext({
    fetch, AbortController, setTimeout, clearTimeout, analysis: null,
    window: {wafferLocale: 'en-US'}, document: {getElementById: () => el}, ...timers
  });
  vm.runInContext(startup, context);
  return {context, el, done: () => vm.runInContext('checkSystemHealth()', context)};
}
const config = (pricing = false) => ({ok: true, service: 'waffer-readiness', status: 'not_promotion_ready',
  configured: {analysis: true, catalog: true, pricing}, pricingRuntime: {sandboxReady: false}});
const response = body => ({ok: true, json: async () => body});

test('cold startup calls real configuration-only handler without upstream traffic, even with keys configured', async () => {
  const originalFetch = globalThis.fetch;
  const keys = ['OPENAI_API_KEY', 'AUTOPARTS_API_KEY'];
  const saved = keys.map(key => process.env[key]);
  const paths = [];
  let upstream = 0;
  let resolveStartup;
  const completed = new Promise(resolve => { resolveStartup = resolve; });
  try {
    for (const key of keys) process.env[key] = 'synthetic-configured';
    globalThis.fetch = async () => { upstream++; throw new Error('Paid provider calls forbidden'); };
    const {context, el} = harness(async path => {
      paths.push(path);
      assert.equal(path, '/api/readiness?market=US&locale=en-US&currency=USD');
      const res = {setHeader() {}, status(code) {this.code = code; return this;}, json(body) {this.body = body;}};
      await readinessHandler({method: 'GET', query: {market: 'US', locale: 'en-US', currency: 'USD'}}, res);
      resolveStartup();
      return {ok: res.code === 200, json: async () => res.body};
    });
    await completed;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(paths.length, 1);
    assert.equal(upstream, 0);
    assert.match(el.textContent, /Core services configured.*Provider connectivity not tested/);
    assert.doesNotMatch(el.textContent, /services ready|catalog.*ms/i);
    assert.equal(context.window.wafferVerifiedMarketPricing, false);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
  }
});

for (const [name, fetch] of [
  ['network error', async () => {throw new Error('offline');}],
  ['invalid JSON', async () => ({ok: true, json: async () => {throw new SyntaxError('invalid JSON');}})],
  ['non-2xx response', async () => ({...response(config(true)), ok: false})],
  ['wrong service', async () => response({...config(true), service: 'waffer'})],
  ['missing configuration', async () => response({ok: true, service: 'waffer-readiness'})]
]) test(`startup ${name} warns and disables pricing without falling back to live health`, async () => {
  const paths = [];
  const {context, el, done} = harness((path, options) => {paths.push(path); return fetch(path, options);});
  await done();
  assert.ok(paths.every(path => path.startsWith('/api/readiness?')));
  assert.equal(context.window.wafferVerifiedMarketPricing, false);
  assert.equal(context.window.wafferSandboxPricingPreview, false);
  assert.match(el.textContent, /Could not verify service configuration/);
});

test('superseded readiness response is aborted and cannot enable stale pricing or status', async () => {
  let release;
  let oldSignal;
  let calls = 0;
  const {context, el, done} = harness((path, {signal}) => {
    calls++;
    if (calls === 1) {
      oldSignal = signal;
      return new Promise(resolve => {release = () => resolve(response(config(true)));});
    }
    return Promise.resolve(response({...config(), configured: {analysis: false, catalog: false, pricing: false}}));
  });
  await done();
  assert.equal(oldSignal.aborted, true);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.window.wafferVerifiedMarketPricing, false);
  assert.match(el.textContent, /Some required services are not configured/);
});

test('configuration timeout covers response-body consumption and fails closed', async () => {
  let expire;
  let bodyStarted;
  const started = new Promise(resolve => {bodyStarted = resolve;});
  const {context, el} = harness(async (path, {signal}) => ({ok: true, json: () => {
    bodyStarted();
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), {once: true}));
  }}), {setTimeout(callback, ms) {assert.equal(ms, 6000); expire = callback; return 1;}, clearTimeout() {}});
  await started;
  expire();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.window.wafferVerifiedMarketPricing, false);
  assert.equal(context.window.wafferSandboxPricingPreview, false);
  assert.match(el.textContent, /Could not verify service configuration/);
});
