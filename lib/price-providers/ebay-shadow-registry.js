import { createEbayUsShadowProvider } from './ebay-us.js';

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

export function getEbayShadowReadiness(env = {}) {
  const clientIdConfigured = Boolean(String(env.EBAY_CLIENT_ID || '').trim());
  const clientSecretConfigured = Boolean(String(env.EBAY_CLIENT_SECRET || '').trim());
  const productionAccessApproved = enabled(env.EBAY_BUY_PRODUCTION_APPROVED);
  const shadowEnabled = enabled(env.EBAY_SHADOW_ENABLED);

  return {
    providerId: 'ebay-us-browse-shadow',
    market: 'US',
    currency: 'USD',
    clientIdConfigured,
    clientSecretConfigured,
    productionAccessApproved,
    shadowEnabled,
    ready:
      clientIdConfigured &&
      clientSecretConfigured &&
      productionAccessApproved &&
      shadowEnabled,
    verifiedPricingActivated: false
  };
}

export function createConfiguredEbayShadowProvider(env = {}, options = {}) {
  const readiness = getEbayShadowReadiness(env);
  if (!readiness.ready) return null;

  return createEbayUsShadowProvider({
    clientId: env.EBAY_CLIENT_ID,
    clientSecret: env.EBAY_CLIENT_SECRET,
    productionAccessApproved: true,
    fetchImpl: options.fetchImpl,
    now: options.now
  });
}


export function getEbaySandboxReadiness(env = {}) {
  const clientIdConfigured = Boolean(String(env.EBAY_SANDBOX_CLIENT_ID || '').trim());
  const clientSecretConfigured = Boolean(String(env.EBAY_SANDBOX_CLIENT_SECRET || '').trim());
  const shadowEnabled = enabled(env.EBAY_SANDBOX_SHADOW_ENABLED);

  return {
    providerId: 'ebay-us-browse-shadow-sandbox',
    market: 'US',
    currency: 'USD',
    environment: 'sandbox',
    clientIdConfigured,
    clientSecretConfigured,
    shadowEnabled,
    ready: clientIdConfigured && clientSecretConfigured && shadowEnabled,
    verifiedPricingActivated: false
  };
}

export function createConfiguredEbaySandboxProvider(env = {}, options = {}) {
  const readiness = getEbaySandboxReadiness(env);
  if (!readiness.ready) return null;

  return createEbayUsShadowProvider({
    clientId: env.EBAY_SANDBOX_CLIENT_ID,
    clientSecret: env.EBAY_SANDBOX_CLIENT_SECRET,
    environment: 'sandbox',
    productionAccessApproved: false,
    fetchImpl: options.fetchImpl,
    now: options.now
  });
}
