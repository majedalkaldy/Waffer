export const MARKET_DEFAULTS = {
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
  const requested = String(input.market || 'SA').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const supported = Boolean(MARKET_DEFAULTS[requested]);
  const base = MARKET_DEFAULTS[requested] || MARKET_DEFAULTS.SA;
  const requestedLocale = String(input.locale || base.locale);
  const locale = base.locales.includes(requestedLocale) ? requestedLocale : base.locale;

  return {
    requestedMarket: requested || 'SA',
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
