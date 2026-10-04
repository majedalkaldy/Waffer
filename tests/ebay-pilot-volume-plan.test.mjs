import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { estimatePilotVolume } from '../lib/price-providers/ebay-pilot-volume-plan.js';
const plan = JSON.parse(fs.readFileSync(new URL('../docs/EBAY_PILOT_VOLUME_PLAN.json', import.meta.url)));

test('bounded 20–50-case plans expose explicit retries, category cache, and OAuth budgets', () => {
  assert.equal(plan.evidenceType, 'HYPOTHETICAL_PLAN_NOT_ACTUAL_TRAFFIC');
  const results = plan.scenarios.map(estimatePilotVolume);
  assert.deepEqual(results.map(r => r.calls.total), [221, 1402, 7200]);
  assert.deepEqual(results.map(r => r.calls.browseSearch), [20,70,100]);
  assert.deepEqual(results.map(r => r.calls.taxonomyGetCompatibilityPropertyValues), [80,560,4000]);
  assert.ok(results.every(r => r.valid && r.evidenceType === plan.evidenceType));
  for (const {calls} of results) assert.equal(calls.total, Object.entries(calls).filter(([k]) => k !== 'total').reduce((sum,[,v]) => sum + v,0));
});

test('plans reject missing, impossible, or unbounded assumptions', () => {
  const base = plan.scenarios[0];
  for (const patch of [{caseCount:0}, {caseCount:51}, {caseCount:20.5}, {attemptsPerCase:3}, {candidateItemsPerAttempt:11}, {eligibleItemsPerAttempt:4}, {distinctCategoriesPerAttempt:3}, {oauthTokenRequests:0}, {oauthTokenRequests:21}]) {
    assert.equal(estimatePilotVolume({...base,...patch}).valid,false);
  }
  assert.equal(estimatePilotVolume().valid,false);
});

test('offline planning CLI prints labeled estimates without credentials or external calls', () => {
  const output = spawnSync(process.execPath, ['scripts/estimate-ebay-pilot-volume.mjs','docs/EBAY_PILOT_VOLUME_PLAN.json'], {encoding:'utf8'});
  assert.equal(output.status,0);
  const report = JSON.parse(output.stdout);
  assert.equal(report.evidenceType, 'HYPOTHETICAL_PLAN_NOT_ACTUAL_TRAFFIC');
  assert.equal(report.reports[2].calls.total,7200);
});
