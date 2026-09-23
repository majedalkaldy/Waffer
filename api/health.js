import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { getMarketConfig } from '../lib/market-config.js';

export default async function handler(req, res) {
  res.setHeader('Allow', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const marketConfig = getMarketConfig(req.query || {});
  if (!marketConfig.supported) {
    return res.status(400).json({
      ok: false,
      status: 'unsupported_market',
      requestedMarket: marketConfig.requestedMarket
    });
  }

  const configured = {
    analysis: Boolean(process.env.OPENAI_API_KEY),
    catalog: Boolean(process.env.AUTOPARTS_API_KEY)
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
  const catalogStartedAt = Date.now();

  if (configured.catalog) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RUNTIME_CONFIG.healthCatalogTimeoutMs);
      try {
        const response = await fetch(
          'https://auto-parts-catalog.apiprofile.com/api/v2/manufacturers/list/type-id/' + encodeURIComponent(marketConfig.catalog.typeId),
          {
            headers: {
              Accept: 'application/json',
              'x-apiprofile-key': process.env.AUTOPARTS_API_KEY
            },
            signal: controller.signal
          }
        );
        upstream.catalog = response.ok ? 'reachable' : 'error';
        latency.catalogMs = Date.now() - catalogStartedAt;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      upstream.catalog = 'unreachable';
      latency.catalogMs = Date.now() - catalogStartedAt;
    }
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
      marketConfig: true
    },
    capabilities: {
      quoteAnalysis: configured.analysis,
      quoteAnalysisVerified: false,
      vinAndCatalog: configured.catalog && upstream.catalog === 'reachable',
      verifiedMarketPricing: false,
      persistentAccounts: false
    },
    configured,
    verification,
    upstream,
    latency,
    limits: {
      maxUploadBytes: RUNTIME_CONFIG.maxUploadBytes,
      supportedMimeTypes: RUNTIME_CONFIG.supportedMimeTypes,
      catalogMatchTimeoutMs: RUNTIME_CONFIG.catalogMatchTimeoutMs,
      analysisTimeoutMs: RUNTIME_CONFIG.analysisTimeoutMs,
      clientAnalysisTimeoutMs: RUNTIME_CONFIG.clientAnalysisTimeoutMs,
      pdfUploadTimeoutMs: RUNTIME_CONFIG.pdfUploadTimeoutMs,
      pdfCleanupTimeoutMs: RUNTIME_CONFIG.pdfCleanupTimeoutMs,
      manufacturersTimeoutMs: RUNTIME_CONFIG.manufacturersTimeoutMs,
      clientManufacturersTimeoutMs: RUNTIME_CONFIG.clientManufacturersTimeoutMs,
      vinTimeoutMs: RUNTIME_CONFIG.vinTimeoutMs,
      clientVinTimeoutMs: RUNTIME_CONFIG.clientVinTimeoutMs,
      catalogProductsTimeoutMs: RUNTIME_CONFIG.catalogProductsTimeoutMs,
      catalogArticlesTimeoutMs: RUNTIME_CONFIG.catalogArticlesTimeoutMs,
      catalogCriteriaTimeoutMs: RUNTIME_CONFIG.catalogCriteriaTimeoutMs,
      healthCatalogTimeoutMs: RUNTIME_CONFIG.healthCatalogTimeoutMs
    },
    timestamp: new Date().toISOString()
  });
}
