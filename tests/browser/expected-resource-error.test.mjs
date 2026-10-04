import test from 'node:test';
import assert from 'node:assert/strict';
import {isExpectedHealthResourceError} from './expected-resource-error.mjs';
const url = 'http://127.0.0.1:12345/api/health?market=US&locale=en-US&currency=USD';
const entry = {kind: 'console', location: {url}, message: 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'};
const options = {scenario: 'health-not-ready', healthUrl: url, observedResponses: [{url, status: 503, bodyStatus: 'unavailable'}]};

test('only the exact observed unavailable-health fixture resource notice is expected', () => {
  assert.equal(isExpectedHealthResourceError(entry, options), true);
});

test('health resource exception never permits JS exceptions, other URLs/statuses or unobserved failures', () => {
  for (const changed of [
    {...entry, kind: 'pageerror'}, {...entry, message: 'Cannot set properties of null'},
    {...entry, message: entry.message.replace('503', '500')},
    {...entry, location: {url: url.replace('/api/health', '/api/price-compare')}},
    {...entry, location: {url: 'http://127.0.0.1:12345/app.js'}}, {...entry, location: {}}
  ]) assert.equal(isExpectedHealthResourceError(changed, options), false);
  for (const changed of [
    {...options, scenario: 'matched'}, {...options, observedResponses: []},
    {...options, observedResponses: [{url, status: 200, bodyStatus: 'unavailable'}]},
    {...options, observedResponses: [{url, status: 503, bodyStatus: 'request_error'}]},
    {...options, observedResponses: [{url: url + '&different=1', status: 503, bodyStatus: 'unavailable'}]}
  ]) assert.equal(isExpectedHealthResourceError(entry, changed), false);
});
