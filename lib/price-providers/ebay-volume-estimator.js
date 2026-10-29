import { requestBudget } from './ebay-request-budget.js';

function finitePositive(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function ratio(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
}

function round(value) {
  return Math.ceil(Number(value) || 0);
}

export function estimateEbayApiVolume(input = {}) {
  const dailyActiveUsers = finitePositive(input.dailyActiveUsers);
  const searchesPerUser = finitePositive(input.searchesPerUser);
  const candidateItemsInspectedPerSearch = finitePositive(input.candidateItemsInspectedPerSearch);
  const fitmentEligibleCandidateRate = ratio(input.fitmentEligibleCandidateRate);
  const taxonomyCacheMissRate = ratio(input.taxonomyCacheMissRate);
  const peakHourShare = ratio(input.peakHourShare);

  // Omitted options retain legacy baseline counts but are explicitly incomplete.
  const taxonomyCategoriesPerSearch = input.taxonomyCategoriesPerSearch === undefined ? 1 : finitePositive(input.taxonomyCategoriesPerSearch);
  const automaticRetryRate = input.automaticRetryRate === undefined ? 0 : ratio(input.automaticRetryRate);
  const oauthTokenRequests = input.oauthTokenRequests === undefined ? 0 : input.oauthTokenRequests;
  const errors = [];
  if (taxonomyCategoriesPerSearch === null || taxonomyCategoriesPerSearch > 10 ||
      (input.taxonomyCategoriesPerSearch !== undefined && taxonomyCategoriesPerSearch > candidateItemsInspectedPerSearch)) errors.push('TAXONOMY_CATEGORIES_PER_SEARCH_INVALID');
  if (automaticRetryRate === null || (input.automaticRetryRate !== undefined && typeof input.automaticRetryRate !== 'number')) errors.push('AUTOMATIC_RETRY_RATE_INVALID');
  if (!Number.isSafeInteger(oauthTokenRequests) || oauthTokenRequests < 0) errors.push('OAUTH_TOKEN_REQUESTS_INVALID');
  if (dailyActiveUsers === null) errors.push('DAILY_ACTIVE_USERS_REQUIRED');
  if (searchesPerUser === null) errors.push('SEARCHES_PER_USER_REQUIRED');
  if (candidateItemsInspectedPerSearch === null) errors.push('CANDIDATE_ITEMS_PER_SEARCH_REQUIRED');
  if (fitmentEligibleCandidateRate === null) errors.push('FITMENT_ELIGIBLE_RATE_REQUIRED');
  if (taxonomyCacheMissRate === null) errors.push('TAXONOMY_CACHE_MISS_RATE_REQUIRED');
  if (peakHourShare === null || peakHourShare <= 0) errors.push('PEAK_HOUR_SHARE_REQUIRED');

  if (errors.length) {
    return { valid: false, errors, assumptions: null, daily: null, peakHourly: null };
  }

  const searches = dailyActiveUsers * searchesPerUser;
  const itemDetails = searches * candidateItemsInspectedPerSearch;
  const compatibilityChecks = itemDetails * fitmentEligibleCandidateRate;
  const taxonomyResolutionGroups = searches * taxonomyCategoriesPerSearch * taxonomyCacheMissRate;

  const daily = {
    browseSearch: round(searches),
    browseGetItem: round(itemDetails),
    browseCheckCompatibility: round(compatibilityChecks),
    taxonomyGetCompatibilityProperties: round(taxonomyResolutionGroups),
    taxonomyGetCompatibilityPropertyValues: round(taxonomyResolutionGroups * 4)
  };
  daily.total = Object.values(daily).reduce((sum, value) => sum + value, 0);

  if (Object.values(daily).some(value => !Number.isSafeInteger(value))) {
    return { valid: false, errors: ['REQUEST_BUDGET_OVERFLOW'], assumptions: null, daily: null, peakHourly: null };
  }
  const dailyRequestBudget = requestBudget(daily, automaticRetryRate, oauthTokenRequests);
  if (!Number.isSafeInteger(dailyRequestBudget.total)) {
    return { valid: false, errors: ['REQUEST_BUDGET_OVERFLOW'], assumptions: null, daily: null, peakHourly: null };
  }
  const peakHourly = {};
  for (const [key, value] of Object.entries(daily)) {
    peakHourly[key] = round(value * peakHourShare);
  }

  return {
    valid: true,
    evidenceType: 'HYPOTHETICAL_PLAN_NOT_ACTUAL_TRAFFIC',
    planningInputsComplete: ['taxonomyCategoriesPerSearch', 'automaticRetryRate', 'oauthTokenRequests'].every(key => input[key] !== undefined),
    dailyRequestBudget,
    peakHourlyRequestBudget: requestBudget(peakHourly, automaticRetryRate, oauthTokenRequests),
    notes: [
      'daily and peakHourly retain baseline API counts; use dailyRequestBudget.total for the scenario including automatic retries and OAuth.',
      'Omitted category/retry/OAuth options default to 1/0/0 for backward compatibility, NOT a conservative or complete forecast.',
      'taxonomyCacheMissRate applies to distinct category resolutions, not a measured cross-search cache hit rate. The adapter only reuses taxonomy inside one lookup; use 1 unless canonical inputs justify fewer resolutions.',
      'automaticRetryRate is the fraction of non-OAuth requests retried once; use 1 to budget one retry for every such request. OAuth is not automatically retried.',
      'OAuth requests are an explicit independent budget; process restarts, token expiry and invalidation can increase it. No per-search OAuth ceiling is asserted.',
      'peakHourly retains baseline allocation. peakHourlyRequestBudget adds endpoint retries and conservatively places ALL daily OAuth requests in that hour; peakHourShare is an assumption, not a measured burst limit.',
      'These are Production lookup planning scenarios, not fixed Sandbox mock traffic, measured demand, approval evidence, or a rate-limit guarantee.'
    ],
    errors: [],
    assumptions: {
      dailyActiveUsers,
      searchesPerUser,
      candidateItemsInspectedPerSearch,
      fitmentEligibleCandidateRate,
      taxonomyCacheMissRate,
      peakHourShare,
      taxonomyCategoriesPerSearch,
      automaticRetryRate,
      oauthTokenRequests
    },
    daily,
    peakHourly
  };
}
