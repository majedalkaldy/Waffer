import {
  normalizeVerifiedMarketRange,
  normalizeVerifiedOffer
} from './price-provider.js';

function ratio(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : 0;
}

function parseCheckedAt(value) {
  const timestamp = Date.parse(String(value || '').trim());
  return Number.isFinite(timestamp) ? timestamp : null;
}

function cleanId(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

export function evaluatePriceProviderSample(sample = {}, {
  minCases = 20,
  minVerifiedOfferCoverage = 0.8,
  minMarketRangeCoverage = 0.8,
  minFreshCoverage = 0.9,
  maxAgeHours = 48,
  futureSkewMinutes = 5,
  now = Date.now()
} = {}) {
  const providerId = cleanId(sample?.providerId, 80);
  const environment = cleanId(sample?.environment || 'production', 20).toLowerCase();
  const market = cleanId(sample?.market || 'US', 8).toUpperCase();
  const currency = cleanId(sample?.currency || 'USD', 8).toUpperCase();
  const cases = Array.isArray(sample?.cases) ? sample.cases : [];

  const inputErrors = [];
  if (!providerId) inputErrors.push('PROVIDER_ID_REQUIRED');
  if (!market) inputErrors.push('MARKET_REQUIRED');
  if (!currency) inputErrors.push('CURRENCY_REQUIRED');
  if (!Array.isArray(sample?.cases)) inputErrors.push('CASES_ARRAY_REQUIRED');

  const maxAgeMs = Math.max(1, Number(maxAgeHours) || 48) * 60 * 60 * 1000;
  const futureSkewMs = Math.max(0, Number(futureSkewMinutes) || 0) * 60 * 1000;

  let validOfferCount = 0;
  let validMarketRangeCount = 0;
  let freshCount = 0;
  let invalidTimestampCount = 0;
  let futureTimestampCount = 0;
  let staleTimestampCount = 0;

  const results = cases.map((entry, index) => {
    const caseId = cleanId(entry?.caseId || String(index + 1), 120);
    const requestedPartNumber = cleanId(entry?.requestedPartNumber, 120);
    const reasons = [];

    if (!requestedPartNumber) reasons.push('REQUESTED_PART_NUMBER_REQUIRED');

    const checkedAtMs = parseCheckedAt(entry?.checkedAt);
    let freshness = 'INVALID';
    let ageHours = null;
    if (checkedAtMs === null) {
      invalidTimestampCount += 1;
      reasons.push('CHECKED_AT_INVALID');
    } else {
      ageHours = Math.round(((now - checkedAtMs) / (60 * 60 * 1000)) * 100) / 100;
      if (checkedAtMs > now + futureSkewMs) {
        futureTimestampCount += 1;
        freshness = 'FUTURE';
        reasons.push('CHECKED_AT_IN_FUTURE');
      } else if (now - checkedAtMs > maxAgeMs) {
        staleTimestampCount += 1;
        freshness = 'STALE';
        reasons.push('CHECKED_AT_STALE');
      } else {
        freshCount += 1;
        freshness = 'FRESH';
      }
    }

    const normalizedRange = entry?.marketRange
      ? normalizeVerifiedMarketRange(entry.marketRange, currency)
      : null;
    if (entry?.marketRange && !normalizedRange) reasons.push('MARKET_RANGE_CONTRACT_REJECTED');
    if (normalizedRange) validMarketRangeCount += 1;

    const normalizedOffer = entry?.bestOffer && requestedPartNumber
      ? normalizeVerifiedOffer(entry.bestOffer, {
          expectedCurrency: currency,
          requestedPartNumber
        })
      : null;
    if (entry?.bestOffer && !normalizedOffer) reasons.push('VERIFIED_OFFER_CONTRACT_REJECTED');
    if (normalizedOffer) validOfferCount += 1;

    if (!entry?.marketRange && !entry?.bestOffer) reasons.push('NO_PRICE_DATA');

    return {
      caseId,
      requestedPartNumber: requestedPartNumber || null,
      freshness,
      ageHours,
      marketRangeAccepted: Boolean(normalizedRange),
      verifiedOfferAccepted: Boolean(normalizedOffer),
      seller: normalizedOffer?.seller || null,
      sourceUrl: normalizedOffer?.sourceUrl || null,
      reasons
    };
  });

  const caseCount = cases.length;
  const verifiedOfferCoverage = ratio(validOfferCount, caseCount);
  const marketRangeCoverage = ratio(validMarketRangeCount, caseCount);
  const freshCoverage = ratio(freshCount, caseCount);
  const schemaValid = inputErrors.length === 0;

  const sampleSizeReady = caseCount >= Math.max(1, Number(minCases) || 20);
  const timestampReady =
    freshCoverage >= Number(minFreshCoverage) &&
    invalidTimestampCount === 0 &&
    futureTimestampCount === 0;

  const productionEligible = environment !== 'sandbox';

  const verifiedOfferPilotReady =
    schemaValid &&
    productionEligible &&
    sampleSizeReady &&
    timestampReady &&
    verifiedOfferCoverage >= Number(minVerifiedOfferCoverage);

  const marketRangePilotReady =
    schemaValid &&
    productionEligible &&
    sampleSizeReady &&
    timestampReady &&
    marketRangeCoverage >= Number(minMarketRangeCoverage);

  const status = verifiedOfferPilotReady
    ? 'PASS_FOR_VERIFIED_OFFER_SHADOW'
    : marketRangePilotReady
      ? 'PASS_FOR_MARKET_RANGE_SHADOW_ONLY'
      : 'NOT_READY_FOR_SHADOW';

  return {
    status,
    providerId: providerId || null,
    environment,
    productionEligible,
    market,
    currency,
    schemaValid,
    inputErrors,
    thresholds: {
      minCases: Math.max(1, Number(minCases) || 20),
      minVerifiedOfferCoverage: Number(minVerifiedOfferCoverage),
      minMarketRangeCoverage: Number(minMarketRangeCoverage),
      minFreshCoverage: Number(minFreshCoverage),
      maxAgeHours: Math.max(1, Number(maxAgeHours) || 48),
      futureSkewMinutes: Math.max(0, Number(futureSkewMinutes) || 0)
    },
    summary: {
      caseCount,
      sampleSizeReady,
      validOfferCount,
      verifiedOfferCoverage,
      validMarketRangeCount,
      marketRangeCoverage,
      freshCount,
      freshCoverage,
      invalidTimestampCount,
      futureTimestampCount,
      staleTimestampCount,
      verifiedOfferPilotReady,
      marketRangePilotReady
    },
    cases: results
  };
}
