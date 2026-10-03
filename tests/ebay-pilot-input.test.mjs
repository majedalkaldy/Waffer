import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateEbayPilotInput} from '../lib/price-providers/ebay-pilot-input.js';

function sample(count = 20) {
  return {cases: Array.from({length: count}, (_, index) => ({
    caseId: `case-${index}`, partNumber: `MPN-${index}`, partName: 'Oil filter', quantity: 1,
    vehicle: {year: 2020, make: 'Example', model: 'Example', trim: 'Example', engine: '2.5L'},
    evidence: {catalogVerified: true, sourceUrl: 'https://manufacturer.example/catalog.pdf', notes: 'Synthetic fixture only; never live evidence.'}
  }))};
}

test('valid reviewed production inputs pass input preflight', () => {
  const report = validateEbayPilotInput(sample(), {environment: 'production'});
  assert.equal(report.valid, true);
  assert.equal(report.warnings.length, 0);
});

test('production requires 20–50 cases and sandbox permits one', () => {
  for (const count of [0, 1, 19, 51]) assert.equal(validateEbayPilotInput(sample(count), {environment: 'production'}).valid, false);
  assert.equal(validateEbayPilotInput(sample(1), {environment: 'sandbox'}).valid, true);
});

test('bundled placeholders cannot start pilot API calls', () => {
  const payload = JSON.parse(fs.readFileSync(new URL('../docs/EBAY_PILOT_CASES.json', import.meta.url)));
  assert.equal(validateEbayPilotInput(payload, {environment: 'sandbox'}).valid, false);
  const result = spawnSync(process.execPath, ['scripts/run-ebay-pilot.mjs', 'production', 'docs/EBAY_PILOT_CASES.json'], {encoding: 'utf8'});
  assert.equal(result.status, 66);
  assert.equal(JSON.parse(result.stderr).status, 'INVALID_PILOT_CASES');
});

test('duplicate cases, invalid quantity, missing engine and unreviewed evidence fail closed', () => {
  const payload = sample();
  payload.cases[1] = {...payload.cases[0]};
  payload.cases[2].quantity = 0.5;
  payload.cases[3].vehicle.engine = '';
  payload.cases[4].evidence.catalogVerified = false;
  payload.cases[5].evidence.sourceUrl = 'http://example.com';
  const report = validateEbayPilotInput(payload, {environment: 'production'});
  assert.equal(report.valid, false);
  assert.deepEqual(report.cases[1].reasons, ['DUPLICATE_CASE_ID', 'DUPLICATE_PILOT_INPUT']);
  assert.ok(report.cases[2].reasons.includes('POSITIVE_INTEGER_QUANTITY_REQUIRED'));
  assert.ok(report.cases[3].reasons.includes('VEHICLE_ENGINE_REQUIRED'));
  assert.ok(report.cases[4].reasons.includes('CATALOG_EVIDENCE_REVIEW_REQUIRED'));
  assert.ok(report.cases[5].reasons.includes('CATALOG_SOURCE_HTTPS_URL_REQUIRED'));
});

test('malformed payloads and environments do not pass', () => {
  for (const payload of [null, {}, {cases: null}]) assert.equal(validateEbayPilotInput(payload, {environment: 'production'}).valid, false);
  assert.equal(validateEbayPilotInput(sample(), {}).valid, false);
});

test('missing trim cannot reach the resolver as a supposedly ready pilot', () => {
  const payload = sample();
  payload.cases[0].vehicle.trim = null;
  const report = validateEbayPilotInput(payload, {environment: 'production'});
  assert.equal(report.valid, false);
  assert.ok(report.cases[0].reasons.includes('VEHICLE_TRIM_REQUIRED'));
});

test('researched candidate set exposes all unresolved trim gaps without masquerading as pilot evidence', () => {
  const payload = JSON.parse(fs.readFileSync(new URL('../docs/EBAY_PILOT_RESEARCH_CASES.json', import.meta.url)));
  const report = validateEbayPilotInput(payload, {environment: 'production'});
  assert.equal(report.caseCount, 20);
  assert.equal(report.valid, false);
  assert.equal(report.cases.filter(entry => entry.valid).length, 5);
  assert.equal(report.cases.filter(entry => entry.reasons.includes('VEHICLE_TRIM_REQUIRED')).length, 15);
  for (const entry of payload.cases) {
    assert.equal(entry.bestOffer, undefined);
    assert.equal(entry.marketRange, undefined);
    assert.ok(entry.evidence.sourceUrl.startsWith('https://'));
  }
});
