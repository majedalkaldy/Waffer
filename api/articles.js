import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { getMarketConfig } from '../lib/market-config.js';
import { enforceCatalogRequestGuard } from '../lib/catalog-abuse-guard.js';

export default async function handler(req, res) {
  res.setHeader('Allow', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.AUTOPARTS_API_KEY;
    const vehicleId = String(req.query.vehicleId || '').trim();
    const productId = String(req.query.productId || '').trim();
    const config = getMarketConfig(req.query);
    if (!config.supported) return res.status(400).json({ error: 'Unsupported market', code: 'UNSUPPORTED_MARKET', requestedMarket: config.requestedMarket });
    const market = config.market;
    const langId = config.catalog.langId;

    if (!apiKey) return res.status(500).json({ error: 'API key missing' });
    if (!/^\d+$/.test(vehicleId) || !/^\d+$/.test(productId)) {
      return res.status(400).json({ error: 'Valid vehicleId and productId are required' });
    }
    if (!enforceCatalogRequestGuard(req, res, RUNTIME_CONFIG)) return;

    const url = 'https://auto-parts-catalog.apiprofile.com/api/v2/articles/list-by-product/type-id/' + encodeURIComponent(config.catalog.typeId) + '/vehicle-id/' +
      encodeURIComponent(vehicleId) + '/product-id/' + encodeURIComponent(productId) +
      '/lang-id/' + encodeURIComponent(langId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RUNTIME_CONFIG.catalogArticlesTimeoutMs);
    let response;
    let data;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'x-apiprofile-key': apiKey },
        signal: controller.signal
      });
      try {
        data = await response.json();
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        return res.status(502).json({ error: 'Invalid response from parts catalog', code: 'CATALOG_INVALID_RESPONSE' });
      }
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) return res.status(response.status >= 500 ? 502 : response.status).json({ error: 'Parts catalog request failed', code: 'CATALOG_UPSTREAM_ERROR', details: data });

    const articles = Array.isArray(data?.articles) ? data.articles : Array.isArray(data) ? data : [];
    res.setHeader(
      'Vercel-CDN-Cache-Control',
      'public, max-age=' + RUNTIME_CONFIG.catalogDataCdnCacheSeconds +
        ', stale-while-revalidate=' + RUNTIME_CONFIG.catalogDataCdnStaleSeconds
    );
    return res.status(200).json({ market, langId, vehicleId: Number(vehicleId), productId: Number(productId), count: articles.length, articles });
  } catch (error) {
    console.error('Compatible articles error:', error);
    if (error?.name === 'AbortError') return res.status(504).json({ error: 'Parts catalog timed out', code: 'CATALOG_TIMEOUT' });
    return res.status(500).json({ error: 'Failed to load compatible articles' });
  }
}
