import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { getMarketConfig } from '../lib/market-config.js';
import { applyCatalogRequestGuard } from '../lib/catalog-abuse-guard.js';

export default async function handler(req, res) {
  res.setHeader('Allow', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.AUTOPARTS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AUTOPARTS_API_KEY is not configured' });

    const config = getMarketConfig(req.query);
    if (!config.supported) return res.status(400).json({ error: 'Unsupported market', code: 'UNSUPPORTED_MARKET', requestedMarket: config.requestedMarket });
    const ctx = { market: config.market, langId: config.catalog.langId, countryFilterId: config.catalog.countryFilterId };
    if (!applyCatalogRequestGuard(req, res, RUNTIME_CONFIG, 'manufacturers')) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RUNTIME_CONFIG.manufacturersTimeoutMs);
    let response;
    let data;
    try {
      response = await fetch(
        'https://auto-parts-catalog.apiprofile.com/api/v2/manufacturers/list/type-id/' + encodeURIComponent(config.catalog.typeId),
        { headers: { Accept: 'application/json', 'x-apiprofile-key': apiKey }, signal: controller.signal }
      );
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

    const manufacturers = (Array.isArray(data)
      ? data
      : Array.isArray(data?.manufacturers)
        ? data.manufacturers
        : [])
      .map(item => ({
        manufacturerId: item?.manufacturerId ?? item?.manuId ?? item?.id ?? '',
        manufacturerName: item?.manufacturerName ?? item?.manuName ?? item?.name ?? ''
      }))
      .filter(item => item.manufacturerId !== '' && item.manufacturerName)
      .sort((a,b) => String(a.manufacturerName).localeCompare(String(b.manufacturerName)));

    res.setHeader(
      'Vercel-CDN-Cache-Control',
      'public, max-age=' + RUNTIME_CONFIG.manufacturersCdnCacheSeconds +
        ', stale-while-revalidate=' + RUNTIME_CONFIG.manufacturersCdnStaleSeconds
    );
    return res.status(200).json({ ...ctx, count: manufacturers.length, manufacturers });
  } catch (error) {
    console.error('Vehicle manufacturers error:', error);
    if (error?.name === 'AbortError') return res.status(504).json({ error: 'Vehicle catalog timed out', code: 'CATALOG_TIMEOUT' });
    return res.status(500).json({ error: 'Failed to fetch vehicle manufacturers' });
  }
}
