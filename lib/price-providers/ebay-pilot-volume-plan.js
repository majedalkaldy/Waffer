// Offline workload planning. Never telemetry, provider evidence, or an API client.
export function estimatePilotVolume(scenario = {}) {
  const keys = ['caseCount', 'attemptsPerCase', 'candidateItemsPerAttempt', 'eligibleItemsPerAttempt', 'distinctCategoriesPerAttempt', 'oauthTokenRequests'];
  const errors = keys.filter(key => !Number.isInteger(scenario[key]) || scenario[key] < 0).map(key => `${key}_INVALID`);
  const s = scenario;
  if (!(s.caseCount >= 20 && s.caseCount <= 50)) errors.push('CASE_COUNT_20_TO_50_REQUIRED');
  if (!(s.attemptsPerCase >= 1 && s.attemptsPerCase <= 2)) errors.push('ATTEMPTS_ONE_OR_TWO_REQUIRED');
  if (!(s.candidateItemsPerAttempt >= 1 && s.candidateItemsPerAttempt <= 10)) errors.push('CANDIDATES_ONE_TO_TEN_REQUIRED');
  if (s.eligibleItemsPerAttempt > s.candidateItemsPerAttempt) errors.push('ELIGIBLE_EXCEEDS_CANDIDATES');
  if (s.distinctCategoriesPerAttempt > s.eligibleItemsPerAttempt || (s.eligibleItemsPerAttempt > 0 && s.distinctCategoriesPerAttempt < 1)) errors.push('CATEGORY_COUNT_INVALID');
  if (!(s.oauthTokenRequests >= 1 && s.oauthTokenRequests <= s.caseCount * s.attemptsPerCase)) errors.push('TOKEN_REQUEST_BUDGET_INVALID');
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
  return { valid: true, evidenceType: 'HYPOTHETICAL_PLAN_NOT_ACTUAL_TRAFFIC', errors: [], assumptions: {...s}, calls,
    notes: [
      'One bounded batch, not a daily user forecast. If all attempts occur in one hour, hourly calls equal the batch totals.',
      'Attempts include one initial pass and, when set to two, one complete manual rerun per case. No automatic retry implementation is claimed.',
      'Same-category taxonomy resolution is reused inside each lookup. No cross-case or cross-run cache saving is assumed.',
      'All listed candidate checks and four taxonomy value calls are budgeted even though rejection or the first accepted offer can stop earlier.',
      'OAuth is a separate explicit request budget; token expiry or process restarts require revising it.',
      'This is not a rate-limit guarantee, measured traffic, eBay API evidence, or an approved Growth Check answer.'
    ] };
}
