import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAnalysisPrompt } from '../lib/analysis-prompt.js';

const vehicle = {
  make: 'FORD',
  model: 'Expedition',
  year: '2013',
  vin: '1HGCM82633A004352'
};

test('English locale produces an English-only instruction contract', () => {
  const prompt = buildAnalysisPrompt({
    market: 'SA',
    locale: 'en-SA',
    currency: 'SAR',
    vehicle
  });

  assert.ok(prompt.includes('All human-readable string values in the JSON must be concise English'));
  assert.ok(prompt.includes('"partNumber":"not visible"'));
  assert.ok(prompt.includes('"compatibility":"not verifiable|provisionally compatible|needs verification"'));
  assert.ok(prompt.includes('Vehicle: make FORD, model Expedition, year 2013'));
  assert.equal(prompt.includes('استخدم العربية'), false);
  assert.equal(prompt.includes('غير ظاهر'), false);
  assert.equal(prompt.includes('رسالة عربية'), false);
});

test('Arabic locale produces Arabic human-readable output instructions', () => {
  const prompt = buildAnalysisPrompt({
    market: 'SA',
    locale: 'ar-SA',
    currency: 'SAR',
    vehicle
  });

  assert.ok(prompt.includes('جميع القيم النصية المقروءة للمستخدم في JSON يجب أن تكون بالعربية'));
  assert.ok(prompt.includes('"partNumber":"غير ظاهر"'));
  assert.ok(prompt.includes('السيارة: الشركة FORD'));
  assert.equal(prompt.includes('All human-readable string values in the JSON must be concise English'), false);
});

test('JSON keys remain stable across Arabic and English prompts', () => {
  const ar = buildAnalysisPrompt({ market:'SA', locale:'ar-SA', currency:'SAR', vehicle });
  const en = buildAnalysisPrompt({ market:'SA', locale:'en-SA', currency:'SAR', vehicle });

  for (const key of [
    'total','calculatedTotal','tax','laborTotal','warranty','status',
    'transparency','identityConfidence','compatibilityConfidence',
    'priceConfidence','overallConfidence','missing','conflicts',
    'nextActions','items','workshopMessage'
  ]) {
    assert.ok(ar.includes('"' + key + '"'), 'ar ' + key);
    assert.ok(en.includes('"' + key + '"'), 'en ' + key);
  }
});
