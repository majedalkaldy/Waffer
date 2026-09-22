import { getMarketConfig } from '../lib/market-config.js';

export default async function handler(req, res) {
  res.setHeader('Allow', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const articleId = String(req.query.articleId || '').trim();
    if (!/^\d+$/.test(articleId)) return res.status(400).json({ error: 'Valid articleId is required' });

    const apiKey = process.env.AUTOPARTS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AUTOPARTS_API_KEY is not configured' });

    const config = getMarketConfig(req.query);
    if (!config.supported) return res.status(400).json({ error: 'Unsupported market', code: 'UNSUPPORTED_MARKET', requestedMarket: config.requestedMarket });
    const market = config.market;
    const langId = config.catalog.langId;
    const countryFilterId = config.catalog.countryFilterId;

    const url = 'https://auto-parts-catalog.apiprofile.com' +
      '/api/v2/articles/selection-of-all-specifications-criterias-for-the-article' +
      '/article-id/' + encodeURIComponent(articleId) +
      '/lang-id/' + encodeURIComponent(langId) +
      '/country-filter-id/' + encodeURIComponent(countryFilterId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'x-apiprofile-key': apiKey },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return res.status(502).json({ error: 'Invalid response from parts catalog', code: 'CATALOG_INVALID_RESPONSE', status: response.status }); }

    if (!response.ok) return res.status(response.status >= 500 ? 502 : response.status).json({ error: 'Article criteria lookup failed', code: 'CATALOG_UPSTREAM_ERROR', details: data });

    const criteria = Array.isArray(data) ? data : Array.isArray(data?.criteria) ? data.criteria : [];
    return res.status(200).json({
      market, langId, countryFilterId,
      articleId: Number(articleId),
      criteria
    });
  } catch (error) {
    console.error('Article criteria error:', error);
    if (error?.name === 'AbortError') return res.status(504).json({ error: 'Parts catalog timed out' });
    return res.status(500).json({ error: 'Article criteria lookup failed' });
  }
}
