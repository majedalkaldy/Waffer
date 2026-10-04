// SYNTHETIC TEST ONLY. Allow only Chromium's resource notice for the known fixture 503.
// This never suppresses JavaScript exceptions, application console errors, or another URL/status.
export function isExpectedHealthResourceError(entry, {scenario, healthUrl, observedResponses}) {
  return scenario === 'health-not-ready' &&
    entry.kind === 'console' &&
    entry.location?.url === healthUrl &&
    entry.message === 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)' &&
    observedResponses.some(response => response.url === healthUrl && response.status === 503 && response.bodyStatus === 'unavailable');
}
