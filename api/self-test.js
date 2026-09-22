import { getMarketConfig } from '../lib/market-config.js';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';

export default async function handler(req, res) {
  res.setHeader('Allow', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const sa = getMarketConfig({ market: 'SA' });
  const unsupported = getMarketConfig({ market: 'ZZ' });

  const checks = {
    engineVersion: typeof RUNTIME_CONFIG.engineVersion === 'string' && RUNTIME_CONFIG.engineVersion.length > 0,
    uploadLimit: Number(RUNTIME_CONFIG.maxUploadBytes) > 0,
    mimeTypes: Array.isArray(RUNTIME_CONFIG.supportedMimeTypes) &&
      RUNTIME_CONFIG.supportedMimeTypes.includes('application/pdf') &&
      RUNTIME_CONFIG.supportedMimeTypes.some(type => type.startsWith('image/')),
    analysisTimeout: Number(RUNTIME_CONFIG.analysisTimeoutMs) > Number(RUNTIME_CONFIG.pdfUploadTimeoutMs),
    catalogTimeout: Number(RUNTIME_CONFIG.catalogMatchTimeoutMs) > 0,
    saMarket: sa.supported === true && sa.market === 'SA' && sa.currency === 'SAR',
    unsupportedMarketRejected: unsupported.supported === false
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  const ok = failed.length === 0;

  return res.status(ok ? 200 : 500).json({
    ok,
    service: 'waffer-self-test',
    engineVersion: RUNTIME_CONFIG.engineVersion,
    checks,
    failed
  });
}
