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

  const errors = [];
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
  const taxonomyResolutionGroups = searches * taxonomyCacheMissRate;

  const daily = {
    browseSearch: round(searches),
    browseGetItem: round(itemDetails),
    browseCheckCompatibility: round(compatibilityChecks),
    taxonomyGetCompatibilityProperties: round(taxonomyResolutionGroups),
    taxonomyGetCompatibilityPropertyValues: round(taxonomyResolutionGroups * 4)
  };
  daily.total = Object.values(daily).reduce((sum, value) => sum + value, 0);

  const peakHourly = {};
  for (const [key, value] of Object.entries(daily)) {
    peakHourly[key] = round(value * peakHourShare);
  }

  return {
    valid: true,
    errors: [],
    assumptions: {
      dailyActiveUsers,
      searchesPerUser,
      candidateItemsInspectedPerSearch,
      fitmentEligibleCandidateRate,
      taxonomyCacheMissRate,
      peakHourShare
    },
    daily,
    peakHourly
  };
}
