import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { getMarketConfig, getMarketConfigFromRequest } from '../lib/market-config.js';
import { probeCatalogHealth } from '../lib/catalog-health-probe.js';
import { hasConfiguredPriceProvider } from '../lib/price-provider.js';

export default async function handler(req, res) {
  res.setHeader('Allow', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const marketConfig = getMarketConfigFromRequest(req);
  if (!marketConfig.supported) {
    return res.status(400).json({
      ok: false,
      status: 'unsupported_market',
      requestedMarket: marketConfig.requestedMarket
    });
  }

  const configured = {
    analysis: Boolean(process.env.OPENAI_API_KEY),
    catalog: Boolean(process.env.AUTOPARTS_API_KEY),
    pricing: hasConfiguredPriceProvider(marketConfig.market)
  };

  const upstream = {
    analysis: configured.analysis ? 'configured_not_probed' : 'not_configured',
    catalog: configured.catalog ? 'not_checked' : 'not_configured'
  };
  const verification = {
    analysis: configured.analysis ? 'configuration_only' : 'unavailable',
    catalog: configured.catalog ? 'live_probe' : 'unavailable'
  };
  const latency = { catalogMs: null };
  const probe = {
    catalogCache: configured.catalog ? 'not_checked' : 'none',
    catalogCheckedAt: null,
    catalogAgeMs: null
  };

  if (configured.catalog) {
    const catalogProbe = await probeCatalogHealth({
      marketConfig,
      apiKey: process.env.AUTOPARTS_API_KEY,
      timeoutMs: RUNTIME_CONFIG.healthCatalogTimeoutMs,
      cacheMs: RUNTIME_CONFIG.healthCatalogCacheMs
    });
    upstream.catalog = catalogProbe.upstream;
    latency.catalogMs = catalogProbe.latencyMs;
    probe.catalogCache = catalogProbe.cache;
    probe.catalogCheckedAt = catalogProbe.checkedAt;
    probe.catalogAgeMs = catalogProbe.ageMs;
  }

  const ok = configured.analysis && configured.catalog && upstream.catalog === 'reachable';
  const degraded = configured.analysis && (!configured.catalog || upstream.catalog !== 'reachable');

  return res.status(ok ? 200 : 503).json({
    ok,
    status: ok ? 'ready' : degraded ? 'degraded' : 'unavailable',
    service: 'waffer',
    version: RUNTIME_CONFIG.engineVersion,
    launchPhase: RUNTIME_CONFIG.launchPhase,
    deployment: {
      environment: process.env.VERCEL_ENV || null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8) : null
    },
    defaults: getMarketConfig({}),
    market: marketConfig,
    contract: {
      analysisEngineVersion: RUNTIME_CONFIG.engineVersion,
      acceptanceMetadata: true,
      requestTraceability: true,
      marketConfig: true,
      priceProviderInterface: true
    },
    capabilities: {
      quoteAnalysis: configured.analysis,
      quoteAnalysisVerified: false,
      vinAndCatalog: configured.catalog && upstream.catalog === 'reachable',
      verifiedMarketPricing: configured.pricing,
      persistentAccounts: false
    },
    configured,
    verification,
    upstream,
    latency,
    probe,
    limits: {
      maxUploadBytes: RUNTIME_CONFIG.maxUploadBytes,
      supportedMimeTypes: RUNTIME_CONFIG.supportedMimeTypes,
      catalogMatchTimeoutMs: RUNTIME_CONFIG.catalogMatchTimeoutMs,
      catalogRateLimitBurstWindowMs: RUNTIME_CONFIG.catalogRateLimitBurstWindowMs,
      catalogRateLimitBurstMax: RUNTIME_CONFIG.catalogRateLimitBurstMax,
      catalogRateLimitHourlyWindowMs: RUNTIME_CONFIG.catalogRateLimitHourlyWindowMs,
      catalogRateLimitHourlyMax: RUNTIME_CONFIG.catalogRateLimitHourlyMax,
      analysisTimeoutMs: RUNTIME_CONFIG.analysisTimeoutMs,
      clientAnalysisSafetyMarginMs: RUNTIME_CONFIG.clientAnalysisSafetyMarginMs,
      clientAnalysisTimeoutMs: RUNTIME_CONFIG.clientAnalysisTimeoutMs,
      analysisRateLimitBurstWindowMs: RUNTIME_CONFIG.analysisRateLimitBurstWindowMs,
      analysisRateLimitBurstMax: RUNTIME_CONFIG.analysisRateLimitBurstMax,
      analysisRateLimitHourlyWindowMs: RUNTIME_CONFIG.analysisRateLimitHourlyWindowMs,
      analysisRateLimitHourlyMax: RUNTIME_CONFIG.analysisRateLimitHourlyMax,
      pdfUploadTimeoutMs: RUNTIME_CONFIG.pdfUploadTimeoutMs,
      pdfCleanupTimeoutMs: RUNTIME_CONFIG.pdfCleanupTimeoutMs,
      manufacturersTimeoutMs: RUNTIME_CONFIG.manufacturersTimeoutMs,
      clientManufacturersTimeoutMs: RUNTIME_CONFIG.clientManufacturersTimeoutMs,
      vinTimeoutMs: RUNTIME_CONFIG.vinTimeoutMs,
      clientVinTimeoutMs: RUNTIME_CONFIG.clientVinTimeoutMs,
      catalogProductsTimeoutMs: RUNTIME_CONFIG.catalogProductsTimeoutMs,
      catalogArticlesTimeoutMs: RUNTIME_CONFIG.catalogArticlesTimeoutMs,
      catalogCriteriaTimeoutMs: RUNTIME_CONFIG.catalogCriteriaTimeoutMs,
      catalogDataCdnCacheSeconds: RUNTIME_CONFIG.catalogDataCdnCacheSeconds,
      catalogDataCdnStaleSeconds: RUNTIME_CONFIG.catalogDataCdnStaleSeconds,
      catalogCriteriaCdnCacheSeconds: RUNTIME_CONFIG.catalogCriteriaCdnCacheSeconds,
      catalogCriteriaCdnStaleSeconds: RUNTIME_CONFIG.catalogCriteriaCdnStaleSeconds,
      healthCatalogTimeoutMs: RUNTIME_CONFIG.healthCatalogTimeoutMs,
      healthCatalogCacheMs: RUNTIME_CONFIG.healthCatalogCacheMs,
      priceProviderTimeoutMs: RUNTIME_CONFIG.priceProviderTimeoutMs,
      priceRateLimitBurstWindowMs: RUNTIME_CONFIG.priceRateLimitBurstWindowMs,
      priceRateLimitBurstMax: RUNTIME_CONFIG.priceRateLimitBurstMax,
      priceRateLimitHourlyWindowMs: RUNTIME_CONFIG.priceRateLimitHourlyWindowMs,
      priceRateLimitHourlyMax: RUNTIME_CONFIG.priceRateLimitHourlyMax
    },
    timestamp: new Date().toISOString()
  });
}
