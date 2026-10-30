// Offline scenario accounting, not a runtime ceiling or measured traffic.
export function requestBudget(endpointCalls, automaticRetryRate, oauthTokenRequests) {
  const endpoints = Object.fromEntries(Object.entries(endpointCalls).filter(([key]) => key !== 'total' && key !== 'oauthToken'));
  const automaticRetries = Object.fromEntries(Object.entries(endpoints).map(([key, calls]) => [key, Math.ceil(calls * automaticRetryRate)]));
  const initialApiRequests = Object.values(endpoints).reduce((sum, n) => sum + n, 0);
  const automaticRetryRequests = Object.values(automaticRetries).reduce((sum, n) => sum + n, 0);
  return { initialApiRequests, automaticRetries, automaticRetryRequests, oauthTokenRequests,
    total: initialApiRequests + automaticRetryRequests + oauthTokenRequests };
}
