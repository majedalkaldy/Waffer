import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { UI_STRINGS, t } from '../lib/i18n.js';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('core English localization keys are complete and non-Arabic', () => {
  const keys = [
    'loadingStep1','loadingStep2','loadingStep3','loadingStep4','loadingStep5',
    'resultPill','transparencyHelp','identityHelp','compatibilityHelp','priceHelp',
    'overallHelp','confidenceNote','trustNotice','advancedPill','tableCaption',
    'colItem','colType','colPartNumber','colPrice','colIdentity',
    'colCompatibility','colPriceAssessment','colConflict','detailsDisclaimer','messagePill'
  ];

  for (const key of keys) {
    const value = UI_STRINGS['en-SA']?.[key];
    assert.equal(typeof value, 'string', key);
    assert.ok(value.trim().length > 0, key);
    assert.equal(/[\u0600-\u06FF]/.test(value), false, key + ': ' + value);
    assert.equal(t('en-SA', key), value);
  }
});

test('core runtime paths use bilingual UI helper', () => {
  assert.ok(app.includes("function ui(ar,en){return window.wafferLocale?.startsWith('en')?en:ar;}"));
  assert.ok(app.includes("setStage(ui('قراءة بيانات السيارة والملف','Reading vehicle and file data'))"));
  assert.ok(app.includes("ui('مطابقة كتالوج القطع','Parts catalog matching')"));
  assert.ok(app.includes("ui('ملخص قبل الموافقة: ','Before approval: ')"));
  assert.ok(app.includes("ui('وفّر — ملخص فحص عرض الصيانة','Waffer — repair estimate summary')"));

  assert.equal(app.includes("setStage('قراءة بيانات السيارة والملف')"), false);
  assert.equal(app.includes("typeSummary.textContent='التصنيف:"), false);
  assert.equal(app.includes("decision.textContent='ملخص قبل الموافقة:"), false);
});

test('advanced result table and loading steps are addressable by localization', () => {
  for (const id of [
    'loadingStep1','loadingStep2','loadingStep3','loadingStep4','loadingStep5',
    'resultPill','transparencyHelp','identityHelp','compatibilityHelp','priceHelp',
    'overallHelp','trustNotice','advancedPill','itemsCaption','colItem','colType',
    'colPartNumber','colPrice','colIdentity','colCompatibility','colPriceAssessment',
    'colConflict','detailsDisclaimer','messagePill'
  ]) {
    assert.ok(index.includes('id="' + id + '"'), id);
  }
});
