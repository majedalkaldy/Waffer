import { requestBudget } from './ebay-request-budget.js';

// Offline workload planning. Never telemetry, provider evidence, or an API client.
export function estimatePilotVolume(scenario = {}) {
  const keys = ['caseCount', 'attemptsPerCase', 'candidateItemsPerAttempt', 'eligibleItemsPerAttempt', 'distinctCategoriesPerAttempt', 'oauthTokenRequests'];
  const errors = keys.filter(key => !Number.isInteger(scenario[key]) || scenario[key] < 0).map(key => `${key}_INVALID`);
  const s = scenario;
  const automaticRetryRate = s.automaticRetryRate === undefined ? 0 : s.automaticRetryRate;
  if (typeof automaticRetryRate !== 'number' || !Number.isFinite(automaticRetryRate) || automaticRetryRate < 0 || automaticRetryRate > 1) errors.push('AUTOMATIC_RETRY_RATE_INVALID');
  if (!(s.caseCount >= 20 && s.caseCount <= 50)) errors.push('CASE_COUNT_20_TO_50_REQUIRED');
  if (!(s.attemptsPerCase >= 1 && s.attemptsPerCase <= 2)) errors.push('ATTEMPTS_ONE_OR_TWO_REQUIRED');
  if (!(s.candidateItemsPerAttempt >= 1 && s.candidateItemsPerAttempt <= 10)) errors.push('CANDIDATES_ONE_TO_TEN_REQUIRED');
  if (s.eligibleItemsPerAttempt > s.candidateItemsPerAttempt) errors.push('ELIGIBLE_EXCEEDS_CANDIDATES');
  if (s.distinctCategoriesPerAttempt > s.eligibleItemsPerAttempt || (s.eligibleItemsPerAttempt > 0 && s.distinctCategoriesPerAttempt < 1)) errors.push('CATEGORY_COUNT_INVALID');
  if (!(Number.isSafeInteger(s.oauthTokenRequests) && s.oauthTokenRequests >= 1)) errors.push('TOKEN_REQUEST_BUDGET_INVALID');
  if (errors.length) return { valid: false, evidenceType: 'HYPOTHETICAL_PLAN_NOT_ACTUAL_TRAFFIC', errors, calls: null };
  const attempts = s.caseCount * s.attemptsPerCase;
  // Current adapter caches taxonomy per category within one lookup only.
  // Assume full resolution (one properties + four values calls) per category.
  const calls = {
    browseSearch: attempts,
    browseGetItem: attempts * s.candidateItemsPerAttempt,
    browseCheckCompatibility: attempts * s.eligibleItemsPerAttempt,
    taxonomyGetCompatibilityProperties: attempts * s.distinctCategoriesPerAttempt,
    taxonomyGetCompatibilityPropertyValues: attempts * s.distinctCategoriesPerAttempt * 4,
    oauthToken: s.oauthTokenRequests
  };
  calls.total = Object.values(calls).reduce((total, n) => total + n, 0);
  const plannedRequests = requestBudget(calls, automaticRetryRate, s.oauthTokenRequests);
  if (!Number.isSafeInteger(plannedRequests.total)) return {valid: false, evidenceType: 'HYPOTHETICAL_PLAN_NOT_ACTUAL_TRAFFIC', errors: ['REQUEST_BUDGET_OVERFLOW'], calls: null};
  return { valid: true, planningInputsComplete: s.automaticRetryRate !== undefined, requestBudget: plannedRequests, evidenceType: 'HYPOTHETICAL_PLAN_NOT_ACTUAL_TRAFFIC', errors: [], assumptions: {...s, automaticRetryRate}, calls,
    notes: [
      'One bounded batch, not a daily user forecast. If all attempts occur in one hour, hourly calls equal the batch totals.',
      'Attempts include one initial pass and, when set to two, one complete manual rerun per case. Automatic HTTP retries are separate: the adapter can retry transient non-OAuth requests once. requestBudget includes the explicit automaticRetryRate (omitted defaults to 0, not a complete conservative plan).',
      'Same-category taxonomy resolution is reused inside each lookup. No cross-case or cross-run cache saving is assumed.',
      'All listed candidate checks and four taxonomy value calls are budgeted even though rejection or the first accepted offer can stop earlier.',
      'OAuth is a separate explicit request budget; token expiry, invalidation or process restarts require revising it. There is no asserted one-token-per-attempt ceiling.',
      'This is not a rate-limit guarantee, measured traffic, eBay API evidence, or an approved Growth Check answer.'
    ] };
}
