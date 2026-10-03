const EBAY_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const EBAY_MARKETPLACE = 'EBAY_US';
const EBAY_API = 'https://api.ebay.com';
const EBAY_TOKEN_URL = EBAY_API + '/identity/v1/oauth2/token';

function normalizePartNumber(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function money(value, currency = 'USD') {
  if (!value || String(value.currency || '').toUpperCase() !== currency) return null;
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
  const rows = [
    ['Year', vehicle.year],
    ['Make', vehicle.make || vehicle.manufacturerName],
    ['Model', vehicle.model || vehicle.modelName],
    ['Trim', vehicle.trim],
    ['Engine', vehicle.engine]
  ];
  if (rows.some(([, value]) => !String(value || '').trim())) return null;
  return rows.map(([name, value]) => ({ name, value: String(value).trim() }));
}

function hasExactMpn(item, requestedPartNumber) {
  const requested = normalizePartNumber(requestedPartNumber);
  if (!requested) return false;
  const candidates = [item?.mpn, item?.product?.mpn, item?.inferredMpn];
  for (const aspect of Array.isArray(item?.localizedAspects) ? item.localizedAspects : []) {
    if (/^(mpn|manufacturer part number)$/i.test(String(aspect?.name || '').trim())) {
      const values = Array.isArray(aspect?.value) ? aspect.value : [aspect?.value];
      candidates.push(...values);
    }
  }
  return candidates.some(value => normalizePartNumber(value) === requested);
}

function explicitInStock(item) {
  return (Array.isArray(item?.estimatedAvailabilities) ? item.estimatedAvailabilities : [])
    .some(entry => String(entry?.estimatedAvailabilityStatus || '').toUpperCase() === 'IN_STOCK');
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
    const error = new Error(payload?.message || code);
    error.code = code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function createEbayUsShadowProvider({
  clientId,
  clientSecret,
  productionAccessApproved = false,
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');

  let tokenCache = null;

  async function applicationToken(signal) {
    const current = now();
    if (tokenCache && tokenCache.expiresAt > current + 60_000) return tokenCache.token;

    const basic = Buffer.from(String(clientId || '') + ':' + String(clientSecret || '')).toString('base64');
    const response = await fetchImpl(EBAY_TOKEN_URL, {
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
    });
    const payload = await jsonOrThrow(response, 'EBAY_OAUTH_FAILED');
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
    const response = await fetchImpl(EBAY_API + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
    return jsonOrThrow(response, 'EBAY_BROWSE_FAILED');
  }

  return {
    id: 'ebay-us-browse-shadow',
    label: 'eBay Motors (US)',

    async lookup({ market, currency, part = {}, vehicle = {}, signal } = {}) {
      if (!productionAccessApproved) {
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

      const requestedPartNumber = String(part?.number || '').trim();
      const vehicleProperties = buildEbayVehicleCompatibility(vehicle);
      if (!normalizePartNumber(requestedPartNumber) || !vehicleProperties) {
        return {
          checkedAt: new Date(now()).toISOString(),
          sourceLabel: 'eBay Motors (US)',
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

      // Preserve eBay's returned ordering; Waffer does not re-sort eBay Browse results.
      for (const summary of summaries) {
        const itemId = String(summary?.itemId || '').trim();
        if (!itemId) continue;

        const item = await ebayJson('/buy/browse/v1/item/' + encodeURIComponent(itemId), { signal });
        if (!hasExactMpn(item, requestedPartNumber)) continue;
        if (!explicitInStock(item)) continue;

        const compatibility = await ebayJson(
          '/buy/browse/v1/item/' + encodeURIComponent(itemId) + '/check_compatibility',
          { method: 'POST', body: { compatibilityProperties: vehicleProperties }, signal }
        );
        if (String(compatibility?.compatibilityStatus || '').toUpperCase() !== 'COMPATIBLE') continue;

        const itemPrice = money(item?.price, 'USD');
        const shipping = lowestKnownShipping(item);
        const sourceUrl = httpsUrl(item?.itemAffiliateWebUrl) || httpsUrl(item?.itemWebUrl);
        const seller = String(item?.seller?.username || item?.seller?.sellerAccount || '').trim();
        if (itemPrice === null || shipping === null || !sourceUrl || !seller) continue;

        return {
          checkedAt: new Date(now()).toISOString(),
          sourceLabel: 'eBay Motors (US)',
          marketRange: null,
          bestOffer: {
            partNumber: requestedPartNumber,
            finalUnitPrice: Math.round((itemPrice + shipping + Number.EPSILON) * 100) / 100,
            currency: 'USD',
            seller,
            sourceUrl,
            inStock: true,
            verifiedIdentity: true,
            vehicleVerified: true
          }
        };
      }

      return {
        checkedAt: new Date(now()).toISOString(),
        sourceLabel: 'eBay Motors (US)',
        marketRange: null,
        bestOffer: null
      };
    }
  };
}
