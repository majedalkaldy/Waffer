import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {t} from '../lib/i18n.js';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const app = read('app.js');
const renderer = app.slice(app.indexOf('let healthCheckRun=0;'), app.indexOf('async function checkSystemHealth(){'));
for (const [status, en, ar, tone] of [
  ['checking', /Checking service readiness/, /جارٍ التحقق/, 'warn'],
  ['ready', /Core services ready.*analysis configured.*catalog 12ms/, /الخدمات الأساسية جاهزة.*التحليل مهيأ.*الكتالوج 12ms/, 'ok'],
  ['degraded', /catalog service is currently limited/, /خدمة الكتالوج محدودة/, 'warn'],
  ['unavailable', /Some required services are not ready/, /بعض الخدمات المطلوبة غير جاهزة/, 'warn'],
  ['request_error', /Could not verify service status/, /تعذر التحقق من حالة الخدمة/, 'warn']
]) {
  test(`cached ${status} readiness re-renders in either language without another request`, () => {
    const classes = new Set();
    const el = {textContent: '', classList: {remove: (...names) => names.forEach(n => classes.delete(n)), add: n => classes.add(n)}};
    const context = vm.createContext({window: {wafferLocale: 'en-US'}, document: {getElementById: () => el}, fetch: () => assert.fail('Locale rendering must not fetch')});
    vm.runInContext(renderer, context);
    context.healthFixture = {status, latency: {catalogMs: 12}, verification: {analysis: 'configuration_only'}, deployment: {commit: 'abc123'}};
    vm.runInContext('systemHealthState=healthFixture; window.wafferRenderSystemHealth();', context);
    assert.match(el.textContent, en);
    assert.deepEqual([...classes], [`system-status-${tone}`]);
    context.window.wafferLocale = 'ar-US';
    context.window.wafferRenderSystemHealth();
    assert.match(el.textContent, ar);
    context.window.wafferLocale = 'en-US';
    context.window.wafferRenderSystemHealth();
    assert.match(el.textContent, en);
  });
}
test('home locale refresh covers status, upload accessibility, optional VIN and offline text', () => {
  const module = read('app-module.js');
  assert.match(module, /window\.wafferRenderSystemHealth\(\)/);
  for (const key of ['uploadLabel', 'optional', 'vinPlaceholder', 'offline']) {
    assert.notEqual(t('ar-US', key), t('en-US', key));
    assert.match(module, new RegExp(`t\\(locale,'${key}'\\)`));
  }
  const css = read('styles.css').match(/\.wf-inline-7\{([^}]+)\}/)[1];
  assert.doesNotMatch(css, /-9999|left:|right:/);
  for (const declaration of ['width:1px', 'height:1px', 'min-height:0', 'padding:0', 'border:0', 'margin:0', 'clip-path:inset(50%)']) assert.ok(css.includes(declaration));
  assert.match(read('index.html'), /<input id="file"[^>]*tabindex="-1"[^>]*aria-hidden="true"/);
});
