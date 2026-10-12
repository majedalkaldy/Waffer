import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {t} from '../lib/i18n.js';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const app = read('app.js');
const renderer = app.slice(app.indexOf('let healthCheckRun=0;'), app.indexOf('async function checkSystemHealth(){'));
for (const [status, configured, en, ar, tone] of [
  ['checking', {}, /Checking service configuration/, /جارٍ التحقق/, 'warn'],
  ['not_promotion_ready', {analysis: true, catalog: true}, /Core services configured.*Provider connectivity not tested/, /الخدمات الأساسية مهيأة.*لم يُختبر الاتصال بالمزودين/, 'ok'],
  ['not_promotion_ready', {analysis: true, catalog: false}, /Some required services are not configured.*Provider connectivity not tested/, /بعض الخدمات المطلوبة غير مهيأة/, 'warn'],
  ['not_promotion_ready', {analysis: false, catalog: false}, /Some required services are not configured/, /بعض الخدمات المطلوبة غير مهيأة/, 'warn'],
  ['request_error', {}, /Could not verify service configuration/, /تعذر التحقق من إعداد الخدمة/, 'warn']
]) {
  test(`cached ${status} readiness re-renders in either language without another request`, () => {
    const classes = new Set();
    const el = {textContent: '', classList: {remove: (...names) => names.forEach(n => classes.delete(n)), add: n => classes.add(n)}};
    const context = vm.createContext({window: {wafferLocale: 'en-US'}, document: {getElementById: () => el}, fetch: () => assert.fail('Locale rendering must not fetch')});
    vm.runInContext(renderer, context);
    context.healthFixture = {status, configured};
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
