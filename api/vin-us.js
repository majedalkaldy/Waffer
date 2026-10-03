import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { enforceCatalogRequestGuard } from '../lib/catalog-abuse-guard.js';
import { getRequestQuery } from '../lib/request-query.js';

function clean(value, max = 160) {
  const text = String(value ?? '').trim();
  return text && text.toLowerCase() !== 'not applicable' ? text.slice(0, max) : null;
}

function buildEngine(row = {}) {
  const explicit = clean(row.EngineModel, 120);
  if (explicit) return explicit;

  const parts = [];
  const displacement = Number(row.DisplacementL);
  if (Number.isFinite(displacement) && displacement > 0) {
    parts.push(String(Math.round(displacement * 10) / 10) + 'L');
  }
  const cylinders = Number(row.EngineCylinders);
  if (Number.isFinite(cylinders) && cylinders > 0) {
    parts.push(String(Math.round(cylinders)) + '-cyl');
  }
  const fuel = clean(row.FuelTypePrimary, 60);
  if (fuel) parts.push(fuel);
  return parts.length ? parts.join(' ') : null;
}

export function normalizeNhtsaVinResult(payload = {}, vin = '') {
  const rows = Array.isArray(payload?.Results) ? payload.Results : [];
  const row = rows[0] || {};
  const errorCode = clean(row.ErrorCode, 80);
  const errorText = clean(row.ErrorText, 300);
  const make = clean(row.Make);
  const model = clean(row.Model);
  const year = clean(row.ModelYear, 4);
  const trim = clean(row.Trim) || clean(row.Series);
  const engine = buildEngine(row);

  return {
    source: 'NHTSA_VPIC',
    vin: String(vin || '').trim().toUpperCase(),
    decoded: Boolean(make || model || year || trim || engine),
    clean: errorCode === '0',
    make,
    model,
    year: /^\d{4}$/.test(String(year || '')) ? year : null,
    trim,
    engine,
    bodyClass: clean(row.BodyClass),
    driveType: clean(row.DriveType),
    fuelType: clean(row.FuelTypePrimary),
    errorCode,
    errorText
  };
}

export default async function handler(req, res) {
  res.setHeader('Allow', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const query = getRequestQuery(req);
  const vin = String(query.vin || '').trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return res.status(400).json({ error: 'A valid 17-character VIN is required', code: 'INVALID_VIN' });
  }
  if (!enforceCatalogRequestGuard(req, res, RUNTIME_CONFIG)) return;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number(RUNTIME_CONFIG.nhtsaVinTimeoutMs) || 7000
  );

  try {
    const response = await fetch(
      'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' +
        encodeURIComponent(vin) +
        '?format=json',
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Waffer/1.0 VIN enrichment'
        },
        signal: controller.signal
      }
    );

    let payload;
    try {
      payload = await response.json();
    } catch {
      return res.status(502).json({
        error: 'Invalid NHTSA vPIC response',
        code: 'NHTSA_INVALID_RESPONSE'
      });
    }

    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: 'NHTSA vPIC lookup failed',
        code: 'NHTSA_UPSTREAM_ERROR'
      });
    }

    return res.status(200).json(normalizeNhtsaVinResult(payload, vin));
  } catch (error) {
    console.error('NHTSA VIN enrichment error:', error);
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'NHTSA VIN lookup timed out', code: 'NHTSA_TIMEOUT' });
    }
    return res.status(500).json({ error: 'Failed to enrich VIN', code: 'NHTSA_LOOKUP_FAILED' });
  } finally {
    clearTimeout(timer);
  }
}
