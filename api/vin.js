import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
export default async function handler(req, res) {
  res.setHeader('Allow', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const apiKey = process.env.AUTOPARTS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AUTOPARTS_API_KEY is not configured' });

    const vin = String(req.query.vin || '').trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      return res.status(400).json({ error: 'A valid 17-character VIN is required' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RUNTIME_CONFIG.vinTimeoutMs);
    let response;
    let text;
    try {
      response = await fetch(
        'https://auto-parts-catalog.apiprofile.com/api/v2/vin/tecdoc-vin-check/' + encodeURIComponent(vin),
        {
          headers: {
            Accept: 'application/json',
            'x-apiprofile-key': apiKey
          },
          signal: controller.signal
        }
      );
      text = await response.text();
    } finally {
      clearTimeout(timer);
    }
    let data;
    try { data = JSON.parse(text); }
    catch { return res.status(502).json({ error: 'Invalid VIN provider response', code: 'VIN_INVALID_RESPONSE' }); }

    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: data?.error || data?.message || 'VIN lookup failed',
        code: 'VIN_UPSTREAM_ERROR'
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('VIN API error:', error);
    if (error?.name === 'AbortError') return res.status(504).json({ error: 'VIN lookup timed out', code: 'VIN_TIMEOUT' });
    return res.status(500).json({ error: 'Failed to check VIN' });
  }
}
