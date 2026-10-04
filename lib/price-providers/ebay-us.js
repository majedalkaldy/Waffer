import { normalizeMatchedListing } from '../matched-listing.js';
import {
  EBAY_MOTORS_US_CATEGORY_TREE_ID,
  buildCompatibilityFilter,
  resolveEbayCanonicalVehicle
} from './ebay-taxonomy-resolver.js';

const EBAY_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const EBAY_MARKETPLACE = 'EBAY_US';
const EBAY_PRODUCTION_API = 'https://api.ebay.com';
const EBAY_SANDBOX_API = 'https://api.sandbox.ebay.com';

function normalizePartNumber(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function money(value, currency = 'USD') {
  if (!value || String(value.currency || '').toUpperCase() !== currency) return null;
  if (value.value === null || value.value === undefined || value.value === '' || typeof value.value === 'boolean') return null;
  const amount = Number(value.value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildEbayVehicleCompatibility(vehicle = {}) {
  const canonical = vehicle?.ebayCompatibility;
  if (
    canonical?.canonical !== true ||
    canonical?.source !== 'EBAY_TAXONOMY' ||
    canonical?.marketplace !== EBAY_MARKETPLACE
  ) {
    return null;
  }

  const rows = [
    ['Year', canonical.year],
    ['Make', canonical.make],
    ['Model', canonical.model],
    ['Trim', canonical.trim],
    ['Engine', canonical.engine]
  ];
  if (rows.some(([, value]) => !String(value || '').trim())) return null;
  return rows.map(([name, value]) => ({ name, value: String(value).trim() }));
}

function hasExactMpn(item, requestedPartNumber) {
  const requested = normalizePartNumber(requestedPartNumber);
  if (!requested) return false;
  const candidates = [item?.mpn, item?.product?.mpn];
  for (const aspect of Array.isArray(item?.localizedAspects) ? item.localizedAspects : []) {
    if (/^(mpn|manufacturer part number)$/i.test(String(aspect?.name || '').trim())) {
      const values = Array.isArray(aspect?.value) ? aspect.value : [aspect?.value];
      candidates.push(...values);
    }
  }
  return candidates.some(value => normalizePartNumber(value) === requested);
}

function brandMatch(item, requested) {
  const key = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!key(requested)) return false;
  const values = [item.brand, item.product?.brand];
  for (const aspect of item.localizedAspects || []) {
    if (/^brand$/i.test(String(aspect.name))) values.push(...(Array.isArray(aspect.value) ? aspect.value : [aspect.value]));
  }
  return values.some(value => key(value) === key(requested));
}

function explicitInStock(item) {
  return (Array.isArray(item?.estimatedAvailabilities) ? item.estimatedAvailabilities : [])
    .some(entry => String(entry?.estimatedAvailabilityStatus || '').toUpperCase() === 'IN_STOCK');
}

function itemCategoryId(summary, item) {
  const direct = summary?.categoryId ?? item?.categoryId;
  if (direct != null && String(direct).trim()) return String(direct).trim();

  for (const source of [summary?.categories, item?.categories]) {
    if (!Array.isArray(source)) continue;
    const found = source.find(entry => entry?.categoryId != null && String(entry.categoryId).trim());
    if (found) return String(found.categoryId).trim();
  }
  return null;
}

function lowestKnownShipping(item) {
  const costs = (Array.isArray(item?.shippingOptions) ? item.shippingOptions : [])
    .map(option => money(option?.shippingCost, 'USD'))
    .filter(value => value !== null);
  if (!costs.length) return null;
  return Math.min(...costs);
}

async function jsonOrThrow(response, code) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(code);
    error.code = code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function createEbayUsShadowProvider({
  clientId,
  clientSecret,
  environment = 'production',
  productionAccessApproved = false,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  requestTimeoutMs = 5000,
  requireBrand = false
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  const normalizedEnvironment = String(environment || '').trim().toLowerCase();
  if (!['sandbox', 'production'].includes(normalizedEnvironment)) throw new Error('EBAY_ENVIRONMENT_INVALID');
  const apiBase = normalizedEnvironment === 'sandbox' ? EBAY_SANDBOX_API : EBAY_PRODUCTION_API;
  const tokenUrl = apiBase + '/identity/v1/oauth2/token';

  let tokenCache = null;

  // One bounded retry for transient read failures only. No redirect can receive credentials.
  async function requestJson(url, options, code, retry = true) {
    for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
      if (options.signal?.aborted) throw options.signal.reason || new Error('ABORTED');
      const controller = new AbortController();
      const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
      let timer;
      try {
        const payload = await Promise.race([
          (async () => {
            const response = await fetchImpl(url, {...options, signal, redirect: 'error'});
            if (response.status === 429 || response.status >= 500) {
              const error = new Error('EBAY_TEMPORARILY_UNAVAILABLE');
              error.retryable = true;
              error.status = response.status;
              const retryAfter = response.headers?.get?.('retry-after');
              const delta = Number(retryAfter);
              const date = Date.parse(retryAfter);
              error.retryAfter = retryAfter && Number.isFinite(delta) ? delta : Number.isFinite(date) ? Math.max(0, (date - now()) / 1000) : null;
              throw error;
            }
            return jsonOrThrow(response, code);
          })(),
          new Promise((_, reject) => { timer = setTimeout(() => {
            controller.abort();
            const error = new Error('Price provider timed out');
            error.code = 'PRICE_PROVIDER_TIMEOUT';
            reject(error);
          }, Math.max(1, Math.min(5000, Number(requestTimeoutMs) || 5000))); })
        ]);
        return payload;
      } catch (error) {
        if (options.signal?.aborted || error.code === 'PRICE_PROVIDER_TIMEOUT' || attempt > 0 || !retry || !error.retryable || error.retryAfter > 1) throw error;
        const delay = error.retryAfter > 0 ? error.retryAfter * 1000 : 100;
        await new Promise((resolve, reject) => {
          const abort = () => { clearTimeout(wait); reject(new Error('ABORTED')); };
          const wait = setTimeout(() => { options.signal?.removeEventListener('abort', abort); resolve(); }, delay);
          options.signal?.addEventListener('abort', abort, {once: true});
        });
      } finally { clearTimeout(timer); }
    }
  }

  async function applicationToken(signal) {
    const current = now();
    if (tokenCache && tokenCache.expiresAt > current + 60_000) return tokenCache.token;

    const basic = Buffer.from(String(clientId || '') + ':' + String(clientSecret || '')).toString('base64');
    const payload = await requestJson(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + basic,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: EBAY_SCOPE
      }).toString(),
      signal
    }, 'EBAY_OAUTH_FAILED', false);
    const token = String(payload?.access_token || '').trim();
    const expiresIn = Number(payload?.expires_in);
    if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      const error = new Error('Invalid eBay OAuth response');
      error.code = 'EBAY_OAUTH_INVALID';
      throw error;
    }
    tokenCache = { token, expiresAt: current + expiresIn * 1000 };
    return token;
  }

  async function ebayJson(path, { method = 'GET', body, signal } = {}) {
    const token = await applicationToken(signal);
    const headers = {
      Authorization: 'Bearer ' + token,
      'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE,
      Accept: 'application/json'
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      return await requestJson(apiBase + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
      }, 'EBAY_BROWSE_FAILED');
    } catch (error) {
      if (error.status === 401) tokenCache = null;
      throw error;
    }
  }

  async function taxonomyProperties(categoryId, signal) {
    const query = new URLSearchParams({ category_id: String(categoryId) });
    return ebayJson(
      '/commerce/taxonomy/v1/category_tree/' +
        EBAY_MOTORS_US_CATEGORY_TREE_ID +
        '/get_compatibility_properties?' +
        query.toString(),
      { signal }
    );
  }

  async function taxonomyValues(categoryId, compatibilityProperty, filters, signal) {
    const query = new URLSearchParams({
      category_id: String(categoryId),
      compatibility_property: String(compatibilityProperty)
    });
    const filter = buildCompatibilityFilter(filters);
    if (filter) query.set('filter', filter);
    return ebayJson(
      '/commerce/taxonomy/v1/category_tree/' +
        EBAY_MOTORS_US_CATEGORY_TREE_ID +
        '/get_compatibility_property_values?' +
        query.toString(),
      { signal }
    );
  }

  return {
    id: normalizedEnvironment === 'sandbox'
      ? 'ebay-us-browse-shadow-sandbox'
      : 'ebay-us-browse-shadow',
    label: normalizedEnvironment === 'sandbox'
      ? 'eBay Motors Sandbox (US)'
      : 'eBay Motors (US)',
    environment: normalizedEnvironment,
    evidenceKind: fetchImpl === globalThis.fetch ? 'REAL_PROVIDER_CAPTURE' : 'SYNTHETIC_TRANSPORT',

    async lookup({ market, currency, part = {}, vehicle = {}, quantity = 1, signal } = {}) {
      if (normalizedEnvironment === 'production' && !productionAccessApproved) {
        const error = new Error('eBay Buy API production access has not been approved for Waffer');
        error.code = 'EBAY_PRODUCTION_ACCESS_REQUIRED';
        throw error;
      }
      if (!clientId || !clientSecret) {
        const error = new Error('eBay API credentials are not configured');
        error.code = 'EBAY_CREDENTIALS_REQUIRED';
        throw error;
      }
      if (String(market || '').toUpperCase() !== 'US' || String(currency || '').toUpperCase() !== 'USD') {
        const error = new Error('eBay US provider only supports US/USD');
        error.code = 'EBAY_MARKET_UNSUPPORTED';
        throw error;
      }

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        const error = new Error('EBAY_QUANTITY_INVALID'); error.code = 'EBAY_QUANTITY_INVALID'; throw error;
      }
      const requestedPartNumber = String(part?.number || '').trim();
      if (!normalizePartNumber(requestedPartNumber) || (requireBrand && !String(part.manufacturer || '').trim())) {
        return {
          checkedAt: new Date(now()).toISOString(),
          sourceLabel: normalizedEnvironment === 'sandbox' ? 'eBay Sandbox: test data only' : 'eBay Motors (US)',
          marketRange: null,
          bestOffer: null
        };
      }

      const query = new URLSearchParams({
        q: [requestedPartNumber, String(part?.name || '').trim()].filter(Boolean).join(' '),
        filter: 'buyingOptions:{FIXED_PRICE}',
        limit: '10'
      });
      const search = await ebayJson('/buy/browse/v1/item_summary/search?' + query.toString(), { signal });
      const summaries = Array.isArray(search?.itemSummaries) ? search.itemSummaries : [];
      const compatibilityCache = new Map();

      // Preserve eBay's returned ordering; Waffer does not re-sort eBay Browse results.
      for (const summary of summaries.slice(0, 10)) {
        const itemId = String(summary?.itemId || '').trim();
        if (!itemId) continue;

        const item = await ebayJson('/buy/browse/v1/item/' + encodeURIComponent(itemId), { signal });
        if (!hasExactMpn(item, requestedPartNumber)) continue;
        if (requireBrand && !brandMatch(item, part.manufacturer)) continue;
        if (part.manufacturer && !brandMatch(item, part.manufacturer)) continue;
        if (!Array.isArray(item?.buyingOptions) || !item.buyingOptions.includes('FIXED_PRICE')) continue;
        if (!explicitInStock(item)) continue;

        const categoryId = itemCategoryId(summary, item);
        if (!categoryId) continue;

        let canonical = compatibilityCache.get(categoryId);
        if (!canonical) {
          canonical = vehicle?.ebayCompatibility?.canonical === true &&
              vehicle?.ebayCompatibility?.categoryId === categoryId
            ? vehicle.ebayCompatibility
            : await resolveEbayCanonicalVehicle({
                categoryId,
                vehicle,
                getProperties: id => taxonomyProperties(id, signal),
                getValues: (id, property, filters) => taxonomyValues(id, property, filters, signal)
              });
          compatibilityCache.set(categoryId, canonical);
        }
        if (canonical?.canonical !== true) continue;

        const vehicleProperties = buildEbayVehicleCompatibility({
          ...vehicle,
          ebayCompatibility: canonical
        });
        if (!vehicleProperties) continue;

        const compatibility = await ebayJson(
          '/buy/browse/v1/item/' + encodeURIComponent(itemId) + '/check_compatibility',
          { method: 'POST', body: { compatibilityProperties: vehicleProperties }, signal }
        );
        if (String(compatibility?.compatibilityStatus || '').toUpperCase() !== 'COMPATIBLE') continue;

        const itemPrice = money(item?.price, 'USD');
        const shipping = lowestKnownShipping(item);
        const sourceUrl = httpsUrl(item?.itemAffiliateWebUrl) || httpsUrl(item?.itemWebUrl);
        const seller = String(item?.seller?.username || item?.seller?.sellerAccount || '').trim();
        if (itemPrice === null || !sourceUrl || !seller) continue;

        const matchedListing = normalizeMatchedListing({
          partNumber: requestedPartNumber, itemPrice, shippingEstimate: shipping,
          manufacturer: part.manufacturer || '', identityBasis: brandMatch(item, part.manufacturer) ? 'EXACT_MPN_AND_BRAND' : 'EXACT_MPN',
          currency: 'USD', seller, sourceUrl, inStock: true,
          verifiedIdentity: true, vehicleVerified: true, environment: normalizedEnvironment,
          requestedQuantity: quantity,
          quantityAvailability: (item.estimatedAvailabilities || []).some(row =>
            row.estimatedAvailabilityStatus === 'IN_STOCK' && Number(row.estimatedAvailableQuantity) >= quantity)
            ? 'CONFIRMED' : 'UNCONFIRMED',
          condition: item.condition, title: item.title,
          fitmentEvidence: {...canonical, compatibilityStatus: 'COMPATIBLE'}
        }, {requestedPartNumber, environment: normalizedEnvironment});
        if (!matchedListing) continue;
        return {
          checkedAt: new Date(now()).toISOString(),
          sourceLabel: normalizedEnvironment === 'sandbox' ? 'eBay Sandbox: test data only' : 'eBay Motors (US)',
          environment: normalizedEnvironment,
          marketRange: null, bestOffer: null, matchedListing
        };
      }

      return {
        checkedAt: new Date(now()).toISOString(),
        sourceLabel: normalizedEnvironment === 'sandbox' ? 'eBay Sandbox: test data only' : 'eBay Motors (US)',
        marketRange: null,
        bestOffer: null
      };
    }
  };
}
