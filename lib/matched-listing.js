// Shared, secret-free display contract. A listing is never a checkout quote.
function amount(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}
const partKey = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function normalizeMatchedListing(raw, { requestedPartNumber, expectedCurrency = 'USD', environment = 'production' } = {}) {
  if (!raw || raw.verifiedIdentity !== true || raw.vehicleVerified !== true || raw.inStock !== true) return null;
  if (!partKey(requestedPartNumber) || partKey(raw.partNumber) !== partKey(requestedPartNumber)) return null;
  if (raw.currency !== expectedCurrency || raw.environment !== environment) return null;
  const itemPrice = amount(raw.itemPrice);
  if (itemPrice === null) return null;
  let url;
  try { url = new URL(raw.sourceUrl); } catch { return null; }
  const hosts = environment === 'sandbox' ? ['sandbox.ebay.com', 'www.sandbox.ebay.com'] : ['ebay.com', 'www.ebay.com'];
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || !url.pathname.startsWith('/itm/')) return null;
  const seller = String(raw.seller || '').trim().slice(0, 160);
  if (!seller) return null;
  const shippingEstimate = amount(raw.shippingEstimate);
  return {
    partNumber: String(raw.partNumber).slice(0, 120), currency: expectedCurrency,
    itemPrice, shippingEstimate,
    // No destination has been supplied. Even a returned shipping rate is an estimate.
    shippingStatus: shippingEstimate === null ? 'UNKNOWN' : 'ESTIMATE_NO_DESTINATION',
    taxStatus: 'UNKNOWN', totalPrice: null, totalVerified: false,
    requestedQuantity: Number.isInteger(raw.requestedQuantity) && raw.requestedQuantity > 0 ? raw.requestedQuantity : 1,
    quantityAvailability: raw.quantityAvailability === 'CONFIRMED' ? 'CONFIRMED' : 'UNCONFIRMED',
    seller, sourceUrl: url.toString(), environment,
    manufacturer: String(raw.manufacturer || '').trim().slice(0, 120),
    identityBasis: raw.identityBasis === 'EXACT_MPN_AND_BRAND' ? 'EXACT_MPN_AND_BRAND' : 'EXACT_MPN',
    fitmentEvidence: raw.fitmentEvidence ? {source: raw.fitmentEvidence.source, year: String(raw.fitmentEvidence.year || ''), make: String(raw.fitmentEvidence.make || ''), model: String(raw.fitmentEvidence.model || ''), trim: String(raw.fitmentEvidence.trim || ''), engine: String(raw.fitmentEvidence.engine || ''), compatibilityStatus: raw.fitmentEvidence.compatibilityStatus} : null,
    inStock: true, verifiedIdentity: true, vehicleVerified: true,
    condition: String(raw.condition || 'Not specified').slice(0, 100),
    title: String(raw.title || '').slice(0, 240)
  };
}
