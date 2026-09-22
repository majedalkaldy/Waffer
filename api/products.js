import { getMarketConfig } from '../lib/market-config.js';

export default async function handler(req, res) {
  try {
    const apiKey = process.env.AUTOPARTS_API_KEY;
    const vehicleId = String(req.query.vehicleId || '').trim();
    const config = getMarketConfig(req.query);
    if (!config.supported) return res.status(400).json({ error: 'Unsupported market', code: 'UNSUPPORTED_MARKET', requestedMarket: config.requestedMarket });
    const market = config.market;
    const langId = config.catalog.langId;

    if (!apiKey) return res.status(500).json({ error: 'API key missing' });
    if (!/^\d+$/.test(vehicleId)) return res.status(400).json({ error: 'Invalid vehicleId' });

    const url = 'https://auto-parts-catalog.apiprofile.com/api/v2/category/type-id/1/list-products-names' +
      '?vehicleId=' + encodeURIComponent(vehicleId) +
      '&langId=' + encodeURIComponent(langId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'x-apiprofile-key': apiKey },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    const products = Array.isArray(data) ? data : [];
    return res.status(200).json({ market, langId, vehicleId: Number(vehicleId), count: products.length, products });
  } catch (error) {
    console.error('Vehicle products error:', error);
    if (error?.name === 'AbortError') return res.status(504).json({ error: 'Parts catalog timed out' });
    return res.status(500).json({ error: 'Failed to load vehicle products' });
  }
}
