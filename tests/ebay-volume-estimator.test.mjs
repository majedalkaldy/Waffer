import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateEbayApiVolume } from '../lib/price-providers/ebay-volume-estimator.js';

test('eBay volume estimator derives daily and peak-hour calls from explicit assumptions', () => {
  const report=estimateEbayApiVolume({
    dailyActiveUsers:100,
    searchesPerUser:2,
    candidateItemsInspectedPerSearch:3,
    fitmentEligibleCandidateRate:0.5,
    taxonomyCacheMissRate:0.25,
    peakHourShare:0.2
  });

  assert.equal(report.valid,true);
  assert.deepEqual(report.daily,{
    browseSearch:200,
    browseGetItem:600,
    browseCheckCompatibility:300,
    taxonomyGetCompatibilityProperties:50,
    taxonomyGetCompatibilityPropertyValues:200,
    total:1350
  });
  assert.deepEqual(report.peakHourly,{
    browseSearch:40,
    browseGetItem:120,
    browseCheckCompatibility:60,
    taxonomyGetCompatibilityProperties:10,
    taxonomyGetCompatibilityPropertyValues:40,
    total:270
  });
});

test('volume estimator refuses invented traffic assumptions', () => {
  const report=estimateEbayApiVolume({});
  assert.equal(report.valid,false);
  assert.ok(report.errors.includes('DAILY_ACTIVE_USERS_REQUIRED'));
  assert.equal(report.daily,null);
});
