const DEFAULTS = { market: 'SA', langId: 4, countryFilterId: 63 };

function context(req) {
  const market = String(req.query.market || DEFAULTS.market).toUpperCase();
  const langId = Number(req.query.langId || DEFAULTS.langId);
  const countryFilterId = Number(req.query.countryFilterId || DEFAULTS.countryFilterId);
  return { market, langId, countryFilterId };
}

export default async function handler(req, res) {
  try {
    const apiKey = process.env.AUTOPARTS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AUTOPARTS_API_KEY is not configured' });

    const ctx = context(req);
    const response = await fetch(
      'https://auto-parts-catalog.apiprofile.com/api/v2/manufacturers/list/type-id/1',
      { headers: { Accept: 'application/json', 'x-apiprofile-key': apiKey } }
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

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
    return res.status(500).json({ error: 'Failed to fetch vehicle manufacturers' });
  }
}
