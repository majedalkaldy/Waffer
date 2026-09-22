import { getMarketConfig } from '../lib/market-config.js';

export default async function handler(req, res) {
  res.setHeader('Allow', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

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

  const upstream = { catalog: 'not_checked' };
  const latency = { catalogMs: null };
  const catalogStartedAt = Date.now();

  if (configured.catalog) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const response = await fetch(
          'https://auto-parts-catalog.apiprofile.com/api/v2/manufacturers/list/type-id/1',
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

  res.setHeader('Cache-Control', 'no-store');
  return res.status(ok ? 200 : 503).json({
    ok,
    status: ok ? 'ready' : degraded ? 'degraded' : 'unavailable',
    service: 'waffer',
    version: 'mvp-2026-09',
    defaults: getMarketConfig({}),
    market: marketConfig,
    contract: {
      analysisEngineVersion: 'mvp-2026-09',
      acceptanceMetadata: true,
      requestTraceability: true,
      marketConfig: true
    },
    capabilities: {
      quoteAnalysis: configured.analysis,
      vinAndCatalog: configured.catalog && upstream.catalog === 'reachable',
      verifiedMarketPricing: false,
      persistentAccounts: false
    },
    configured,
    upstream,
    latency,
    limits: {
      maxUploadBytes: 4194304,
      supportedMimeTypes: ['image/jpeg','image/png','image/webp','application/pdf'],
      catalogMatchTimeoutMs: 30000,
      analysisTimeoutMs: 45000
    },
    timestamp: new Date().toISOString()
  });
}
