import { hasUsablePartNumber, hasUsableVehicleIdentity } from './identity.js';

const MARKET_PRICE_PROVIDERS = Object.freeze({
  // Intentionally empty until a trusted provider is selected for a market.
});

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizePartNumber(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function validCheckedAt(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function validHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getPriceProviderForMarket(market) {
  const key = String(market || '').toUpperCase();
  return MARKET_PRICE_PROVIDERS[key] || null;
}

export function hasConfiguredPriceProvider(market) {
  return Boolean(getPriceProviderForMarket(market));
}

export function normalizeVerifiedMarketRange(raw, expectedCurrency) {
  if (!raw || typeof raw !== 'object') return null;
  const currency = String(raw.currency || '').toUpperCase();
  if (!currency || currency !== String(expectedCurrency || '').toUpperCase()) return null;

  const min = finiteNonNegative(raw.min);
  const median = finiteNonNegative(raw.median);
  const max = finiteNonNegative(raw.max);
  if (min === null || median === null || max === null) return null;
  if (!(min <= median && median <= max)) return null;

  const sampleSize = Number(raw.sampleSize);
  return {
    min: roundMoney(min),
    median: roundMoney(median),
    max: roundMoney(max),
    currency,
    sampleSize: Number.isInteger(sampleSize) && sampleSize > 0 ? sampleSize : null
  };
}

export function normalizeVerifiedOffer(raw, {
  expectedCurrency,
  requestedPartNumber
} = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const currency = String(raw.currency || '').toUpperCase();
  if (!currency || currency !== String(expectedCurrency || '').toUpperCase()) return null;

  const requested = normalizePartNumber(requestedPartNumber);
  const returned = normalizePartNumber(raw.partNumber);
  if (!requested || !returned || requested !== returned) return null;

  if (raw.verifiedIdentity !== true || raw.vehicleVerified !== true || raw.inStock !== true) {
    return null;
  }

  const finalUnitPrice = finiteNonNegative(raw.finalUnitPrice);
  if (finalUnitPrice === null) return null;

  const seller = String(raw.seller || '').trim().slice(0, 160);
  const sourceUrl = validHttpsUrl(raw.sourceUrl);
  if (!seller || !sourceUrl) return null;

  return {
    partNumber: String(raw.partNumber).trim().slice(0, 120),
    finalUnitPrice: roundMoney(finalUnitPrice),
    currency,
    seller,
    sourceUrl,
    inStock: true,
    verifiedIdentity: true,
    vehicleVerified: true
  };
}

export async function lookupVerifiedPricing({
  provider,
  marketConfig,
  part,
  vehicle,
  quantity = 1
} = {}) {
  const selectedProvider = provider || getPriceProviderForMarket(marketConfig?.market);

  if (!selectedProvider) {
    return {
      status: 'NOT_CONFIGURED',
      providerId: null,
      sourceLabel: null,
      checkedAt: null,
      marketRange: null,
      bestOffer: null
    };
  }

  const providerId = String(selectedProvider?.id || '').trim().slice(0, 80);
  if (!providerId || typeof selectedProvider?.lookup !== 'function') {
    return {
      status: 'PROVIDER_INVALID',
      providerId: providerId || null,
      sourceLabel: null,
      checkedAt: null,
      marketRange: null,
      bestOffer: null
    };
  }

  if (!hasUsablePartNumber(part?.number) || !hasUsableVehicleIdentity(vehicle)) {
    return {
      status: 'INSUFFICIENT_IDENTITY',
      providerId,
      sourceLabel: null,
      checkedAt: null,
      marketRange: null,
      bestOffer: null
    };
  }

  let raw;
  try {
    raw = await selectedProvider.lookup({
      market: marketConfig?.market,
      locale: marketConfig?.locale,
      currency: marketConfig?.currency,
      part: {
        name: String(part?.name || '').slice(0, 240),
        number: String(part?.number || '').slice(0, 120)
      },
      vehicle: {
        vehicleId: vehicle?.vehicleId || null,
        make: vehicle?.make || null,
        model: vehicle?.model || null,
        year: vehicle?.year || null,
        vin: vehicle?.vin || null
      },
      quantity: Number(quantity) > 0 ? Number(quantity) : 1
    });
  } catch {
    return {
      status: 'PROVIDER_ERROR',
      providerId,
      sourceLabel: null,
      checkedAt: null,
      marketRange: null,
      bestOffer: null
    };
  }

  const checkedAt = validCheckedAt(raw?.checkedAt);
  if (!checkedAt) {
    return {
      status: 'NO_VERIFIED_PRICE',
      providerId,
      sourceLabel: null,
      checkedAt: null,
      marketRange: null,
      bestOffer: null
    };
  }

  const sourceLabel = String(raw?.sourceLabel || selectedProvider?.label || providerId)
    .trim()
    .slice(0, 160) || providerId;

  const marketRange = normalizeVerifiedMarketRange(raw?.marketRange, marketConfig?.currency);
  const bestOffer = normalizeVerifiedOffer(raw?.bestOffer, {
    expectedCurrency: marketConfig?.currency,
    requestedPartNumber: part?.number
  });

  if (!marketRange && !bestOffer) {
    return {
      status: 'NO_VERIFIED_PRICE',
      providerId,
      sourceLabel,
      checkedAt,
      marketRange: null,
      bestOffer: null
    };
  }

  return {
    status: 'VERIFIED',
    providerId,
    sourceLabel,
    checkedAt,
    marketRange,
    bestOffer
  };
}

export function calculateVerifiedOfferSaving({
  workshopUnitPrice,
  quantity = 1,
  bestOffer
} = {}) {
  if (!bestOffer) {
    return {
      amount: null,
      status: 'NOT_CALCULATED',
      workshopTotal: null,
      offerTotal: null
    };
  }

  const workshop = finiteNonNegative(workshopUnitPrice);
  const offer = finiteNonNegative(bestOffer.finalUnitPrice);
  const qty = Number(quantity);
  if (workshop === null || offer === null || !Number.isFinite(qty) || qty <= 0) {
    return {
      amount: null,
      status: 'INPUT_INCOMPLETE',
      workshopTotal: workshop === null ? null : roundMoney(workshop * Math.max(1, qty || 1)),
      offerTotal: offer === null ? null : roundMoney(offer * Math.max(1, qty || 1))
    };
  }

  const workshopTotal = roundMoney(workshop * qty);
  const offerTotal = roundMoney(offer * qty);
  const difference = roundMoney(workshopTotal - offerTotal);

  return {
    amount: difference > 0 ? difference : 0,
    status: difference > 0 ? 'CALCULATED_FROM_VERIFIED_OFFER' : 'NO_POSITIVE_SAVING',
    workshopTotal,
    offerTotal
  };
}
