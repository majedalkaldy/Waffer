import { getMarketConfig } from '../lib/market-config.js';

export default async function handler(req, res) {
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

    const url = 'https://auto-parts-catalog.apiprofile.com/api/v2/articles/list-by-product/type-id/1/vehicle-id/' +
      encodeURIComponent(vehicleId) + '/product-id/' + encodeURIComponent(productId) +
      '/lang-id/' + encodeURIComponent(langId);

    const response = await fetch(url, { headers: { Accept: 'application/json', 'x-apiprofile-key': apiKey } });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    const articles = Array.isArray(data?.articles) ? data.articles : Array.isArray(data) ? data : [];
    return res.status(200).json({ market, langId, vehicleId: Number(vehicleId), productId: Number(productId), count: articles.length, articles });
  } catch (error) {
    console.error('Compatible articles error:', error);
    return res.status(500).json({ error: 'Failed to load compatible articles' });
  }
}
