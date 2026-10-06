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
  market = 'US',
  locale = 'en-US',
  currency = 'USD'
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
    manufacturer: hasUsablePartNumber(item?.manufacturer) ? String(item.manufacturer).trim().slice(0, 120) : '',
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
      trim: vehicle?.trim || null,
      engine: vehicle?.engine || null,
      displacementL: Number(vehicle?.displacementL) || null,
      engineCylinders: Number(vehicle?.engineCylinders) || null,
      vin: vehicle?.vin || null
    }
  };
}

export function summarizeVerifiedPricing(entries = [], currency = 'USD') {
  const results = Array.isArray(entries) ? entries : [];
  let verifiedSaving = 0;
  let verifiedSavingCount = 0;
  let verifiedOfferCount = 0;
  let marketRangeCount = 0;
  let matchedListingCount = 0;

  for (const entry of results) {
    const data = entry?.data || entry;
    if (data?.pricingProvider?.environment === 'sandbox' || data?.status === 'SANDBOX_TEST_DATA_ONLY' || entry?.ok === false) continue;
    if (data?.matchedListing) matchedListingCount += 1;
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
    matchedListingCount,
    verifiedSavingCount,
    verifiedSaving: Math.round((verifiedSaving + Number.EPSILON) * 100) / 100,
    currency: String(currency || 'USD').toUpperCase()
  };
}


// Drop complete provider responses, including seller/link/fitment data, at expiry.
function pricingCheckedAt(entry) {
  const data=entry?.data||entry;
  return Date.parse(data?.pricingProvider?.checkedAt || data?.matchedListing?.checkedAt || data?.sandboxPreview?.checkedAt);
}
export function retainFreshPricing(entries=[], now=Date.now()) {
  return entries.filter(entry => {
    const checked=pricingCheckedAt(entry);
    return Number.isFinite(checked) && checked <= now+30000 && now-checked <= 300000;
  });
}
export function nextPricingExpiry(entries=[]) {
  const timestamps=entries.map(pricingCheckedAt).filter(Number.isFinite);
  return timestamps.length ? Math.min(...timestamps)+300000 : null;
}


export function preparePricingEntry(entry, now=Date.now()) {
  const data=entry?.data;
  if(data?.matchedListing || data?.sandboxPreview || data?.bestOffer || data?.marketPrice?.median != null)return entry;
  // Error/empty results need only a transient status; do not retain echoed VIN or provider payloads.
  const allowed=['PRICE_SOURCE_STALE','NO_VERIFIED_PRICE_AVAILABLE','PRICE_SOURCE_UNAVAILABLE','PRICE_SOURCE_TIMEOUT','WAITING_FOR_VERIFIED_PRICE_SOURCE'];
  return {index:entry.index,ok:entry.ok,data:{
    status:allowed.includes(data?.status)?data.status:'PRICE_SOURCE_UNAVAILABLE',
    pricingProvider:{checkedAt:new Date(now).toISOString(),environment:data?.pricingProvider?.environment==='sandbox'?'sandbox':null},
    matchedListing:null,sandboxPreview:null
  }};
}
