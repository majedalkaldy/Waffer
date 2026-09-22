export const MARKET_DEFAULTS = {
  SA: {
    market: 'SA',
    locale: 'ar-SA',
    currency: 'SAR',
    catalog: {
      langId: 4,
      countryFilterId: 63,
      typeId: 1
    }
  }
};

export function getMarketConfig(input = {}) {
  const requested = String(input.market || 'SA').toUpperCase();
  const base = MARKET_DEFAULTS[requested] || MARKET_DEFAULTS.SA;

  return {
    market: base.market,
    locale: String(input.locale || base.locale),
    currency: String(input.currency || base.currency).toUpperCase(),
    catalog: {
      langId: Number(input.langId || base.catalog.langId),
      countryFilterId: Number(input.countryFilterId || base.catalog.countryFilterId),
      typeId: Number(input.typeId || base.catalog.typeId)
    }
  };
}
