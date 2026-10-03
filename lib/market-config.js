import { getRequestQuery } from './request-query.js';

export const DEFAULT_MARKET = 'US';

export const MARKET_DEFAULTS = {
  US: {
    market: 'US',
    locale: 'en-US',
    locales: ['en-US', 'ar-US'],
    currency: 'USD',
    catalog: {
      langId: 4,
      // AutoPartsAPI documents countryFilterId 63 as a safe worldwide fallback.
      // Keep it until the provider exposes a verified US-specific country ID.
      countryFilterId: 63,
      typeId: 1
    }
  },
  SA: {
    market: 'SA',
    locale: 'ar-SA',
    locales: ['ar-SA', 'en-SA'],
    currency: 'SAR',
    catalog: {
      langId: 4,
      countryFilterId: 63,
      typeId: 1
    }
  }
};

export function getMarketConfig(input = {}) {
  const requested = String(input.market || DEFAULT_MARKET).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const supported = Boolean(MARKET_DEFAULTS[requested]);
  const base = MARKET_DEFAULTS[requested] || MARKET_DEFAULTS[DEFAULT_MARKET];
  const requestedLocale = String(input.locale || base.locale);
  const locale = base.locales.includes(requestedLocale) ? requestedLocale : base.locale;

  return {
    requestedMarket: requested || DEFAULT_MARKET,
    supported,
    market: base.market,
    locale,
    supportedLocales: [...base.locales],
    currency: base.currency,
    catalog: {
      langId: base.catalog.langId,
      countryFilterId: base.catalog.countryFilterId,
      typeId: base.catalog.typeId
    }
  };
}

export function getMarketConfigFromRequest(req = {}) {
  return getMarketConfig(getRequestQuery(req));
}
