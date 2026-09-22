export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const checks = {
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    catalogConfigured: Boolean(process.env.AUTOPARTS_API_KEY)
  };

  const ok = checks.openaiConfigured && checks.catalogConfigured;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(ok ? 200 : 503).json({
    ok,
    service: 'waffer',
    version: 'mvp',
    marketDefault: 'SA',
    checks,
    timestamp: new Date().toISOString()
  });
}
