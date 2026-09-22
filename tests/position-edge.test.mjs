import test from 'node:test';
import assert from 'node:assert/strict';
import { requestedAxle } from '../lib/client-core.js';

test('Arabic conjunctions do not hide conflicting front/rear positions',()=>{assert.equal(requestedAxle('فحمات أمامية وخلفية'),'ambiguous');assert.equal(requestedAxle('الفحمات الأمامية والخلفية'),'ambiguous');assert.equal(requestedAxle('فحمات خلفية'),'rear');});
