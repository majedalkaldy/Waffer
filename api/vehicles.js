import { getMarketConfig } from '../lib/market-config.js';

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch(
        'https://auto-parts-catalog.apiprofile.com/api/v2/manufacturers/list/type-id/1',
        { headers: { Accept: 'application/json', 'x-apiprofile-key': apiKey }, signal: controller.signal }
      );
    } finally {
      clearTimeout(timer);
    }
    let data;
    try { data = await response.json(); }
    catch { return res.status(502).json({ error: 'Invalid response from parts catalog', code: 'CATALOG_INVALID_RESPONSE' }); }
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

    return res.status(200).json({ ...ctx, count: manufacturers.length, manufacturers });
  } catch (error) {
    console.error('Vehicle manufacturers error:', error);
    if (error?.name === 'AbortError') return res.status(504).json({ error: 'Vehicle catalog timed out' });
    return res.status(500).json({ error: 'Failed to fetch vehicle manufacturers' });
  }
}
