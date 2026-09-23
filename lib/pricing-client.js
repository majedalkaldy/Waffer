import { hasUsablePartNumber, hasUsableVehicleIdentity } from './identity.js';

function numericAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const text = String(value ?? '').trim();
  const match = text.match(/[\d,.]+/);
  if (!match) return null;
  const number = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function pricingCapabilityEnabled(capabilities = {}) {
  return capabilities?.verifiedMarketPricing === true;
}

export function selectPriceableItems(analysis, vehicle, { maxItems = 10 } = {}) {
  if (!hasUsableVehicleIdentity(vehicle)) return [];
  const items = Array.isArray(analysis?.items) ? analysis.items : [];
  const limit = Math.max(1, Math.min(20, Number(maxItems) || 10));

  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) =>
      (item?.itemType || 'part') === 'part' &&
      hasUsablePartNumber(item?.partNumber) &&
      numericAmount(item?.price) !== null
    )
    .slice(0, limit);
}

export function buildPriceComparePayload({
  item,
  vehicle,
  market = 'SA',
  locale = 'ar-SA',
  currency = 'SAR'
} = {}) {
  const workshopPrice = numericAmount(item?.price);
  const rawQuantity = Number(item?.quantity);
  const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;

  if (!hasUsablePartNumber(item?.partNumber) ||
      !hasUsableVehicleIdentity(vehicle) ||
      workshopPrice === null) {
    return null;
  }

  return {
    partName: String(item?.name || '').trim().slice(0, 240),
    partNumber: String(item?.partNumber || '').trim().slice(0, 120),
    workshopPrice,
    quantity,
    market,
    locale,
    currency,
    vehicle: {
      vehicleId: vehicle?.vehicleId || null,
      make: vehicle?.make || vehicle?.manufacturerName || null,
      model: vehicle?.model || vehicle?.modelName || null,
      year: vehicle?.year || null,
      vin: vehicle?.vin || null
    }
  };
}

export function summarizeVerifiedPricing(entries = [], currency = 'SAR') {
  const results = Array.isArray(entries) ? entries : [];
  let verifiedSaving = 0;
  let verifiedSavingCount = 0;
  let verifiedOfferCount = 0;
  let marketRangeCount = 0;

  for (const entry of results) {
    const data = entry?.data || entry;
    if (data?.bestOffer) verifiedOfferCount += 1;
    if (data?.marketPrice?.median != null) marketRangeCount += 1;

    if (data?.saving?.status === 'CALCULATED_FROM_VERIFIED_OFFER') {
      const amount = Number(data?.saving?.amount);
      if (Number.isFinite(amount) && amount > 0) {
        verifiedSaving += amount;
        verifiedSavingCount += 1;
      }
    }
  }

  return {
    checkedItems: results.length,
    verifiedOfferCount,
    marketRangeCount,
    verifiedSavingCount,
    verifiedSaving: Math.round((verifiedSaving + Number.EPSILON) * 100) / 100,
    currency: String(currency || 'SAR').toUpperCase()
  };
}
