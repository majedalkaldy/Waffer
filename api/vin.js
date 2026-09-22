export default async function handler(req, res) {
  try {
    const apiKey = process.env.AUTOPARTS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AUTOPARTS_API_KEY is not configured' });

    const vin = String(req.query.vin || '').trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      return res.status(400).json({ error: 'A valid 17-character VIN is required' });
    }

    const response = await fetch(
      'https://auto-parts-catalog.apiprofile.com/api/v2/vin/tecdoc-vin-check/' + encodeURIComponent(vin),
      {
        headers: {
          Accept: 'application/json',
          'x-apiprofile-key': apiKey
        }
      }
    );

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return res.status(502).json({ error: 'Invalid VIN provider response' }); }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error || data?.message || 'VIN lookup failed'
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('VIN API error:', error);
    return res.status(500).json({ error: 'Failed to check VIN' });
  }
}
