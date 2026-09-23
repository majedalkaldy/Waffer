import { createHash } from 'node:crypto';
import { extractClientIp } from './analysis-abuse-guard.js';

const STORE_KEY = Symbol.for('waffer.catalog-abuse-guard.v1');

function store() {
  if (!globalThis[STORE_KEY]) globalThis[STORE_KEY] = new Map();
  return globalThis[STORE_KEY];
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  const wanted = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) {
      return Array.isArray(value) ? String(value[0] || '') : String(value || '');
    }
  }
  return '';
}

function clientKey(req) {
  const ip = extractClientIp(req);
  if (!ip) return '';
  return createHash('sha256')
    .update('waffer-catalog|' + ip)
    .digest('hex')
    .slice(0, 32);
}

function resetWindow(now, windowMs) {
  return { start: now, count: 0, windowMs };
}

function secondsUntilReset(bucket, now) {
  return Math.max(1, Math.ceil((bucket.start + bucket.windowMs - now) / 1000));
}

function prune(map, now, maxEntries, maxAgeMs) {
  if (map.size <= maxEntries) return;
  for (const [key, value] of map) {
    if (now - Number(value?.lastSeen || 0) > maxAgeMs) map.delete(key);
  }
  while (map.size > maxEntries) {
    const first = map.keys().next();
    if (first.done) break;
    map.delete(first.value);
  }
}

export function checkCatalogRequestProvenance(req) {
  const fetchSite = headerValue(req?.headers, 'sec-fetch-site').toLowerCase();
  if (fetchSite === 'cross-site') {
    return { allowed:false, code:'CATALOG_CROSS_SITE_BLOCKED' };
  }

  const origin = headerValue(req?.headers, 'origin');
  const host = headerValue(req?.headers, 'host');
  if (origin && host) {
    try {
      if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
        return { allowed:false, code:'CATALOG_ORIGIN_MISMATCH' };
      }
    } catch {
      return { allowed:false, code:'CATALOG_ORIGIN_INVALID' };
    }
  }

  return { allowed:true, code:null };
}

export function checkCatalogRequestLimit(req, config, now = Date.now()) {
  const key = clientKey(req);
  if (!key) {
    return {
      allowed:true,
      reason:'NO_CLIENT_IP',
      retryAfterSeconds:0,
      burstRemaining:null,
      hourlyRemaining:null,
      burstMax:null,
      hourlyMax:null
    };
  }

  const burstWindowMs = Number(config?.catalogRateLimitBurstWindowMs) || 60_000;
  const burstMax = Number(config?.catalogRateLimitBurstMax) || 300;
  const hourlyWindowMs = Number(config?.catalogRateLimitHourlyWindowMs) || 3_600_000;
  const hourlyMax = Number(config?.catalogRateLimitHourlyMax) || 3000;
  const maxEntries = Number(config?.catalogRateLimitMaxEntries) || 5000;

  const map = store();
  prune(map, now, maxEntries, Math.max(hourlyWindowMs * 2, 7_200_000));

  let entry = map.get(key);
  if (!entry) {
    entry = {
      burst: resetWindow(now, burstWindowMs),
      hourly: resetWindow(now, hourlyWindowMs),
      lastSeen: now
    };
    map.set(key, entry);
  }

  if (now >= entry.burst.start + entry.burst.windowMs) {
    entry.burst = resetWindow(now, burstWindowMs);
  }
  if (now >= entry.hourly.start + entry.hourly.windowMs) {
    entry.hourly = resetWindow(now, hourlyWindowMs);
  }

  entry.burst.count += 1;
  entry.hourly.count += 1;
  entry.lastSeen = now;

  const burstExceeded = entry.burst.count > burstMax;
  const hourlyExceeded = entry.hourly.count > hourlyMax;

  return {
    allowed: !burstExceeded && !hourlyExceeded,
    reason: burstExceeded && hourlyExceeded
      ? 'BURST_AND_HOURLY'
      : burstExceeded
        ? 'BURST'
        : hourlyExceeded
          ? 'HOURLY'
          : 'OK',
    retryAfterSeconds: Math.max(
      burstExceeded ? secondsUntilReset(entry.burst, now) : 0,
      hourlyExceeded ? secondsUntilReset(entry.hourly, now) : 0
    ),
    burstRemaining: Math.max(0, burstMax - entry.burst.count),
    hourlyRemaining: Math.max(0, hourlyMax - entry.hourly.count),
    burstMax,
    hourlyMax
  };
}

export function enforceCatalogRequestGuard(req, res, config) {
  const provenance = checkCatalogRequestProvenance(req);
  if (!provenance.allowed) {
    res.status(403).json({
      error:'Catalog request blocked by origin policy',
      code:provenance.code
    });
    return false;
  }

  const limit = checkCatalogRequestLimit(req, config);
  if (limit.burstMax != null) {
    res.setHeader('X-RateLimit-Catalog-Minute-Limit', String(limit.burstMax));
    res.setHeader('X-RateLimit-Catalog-Minute-Remaining', String(limit.burstRemaining));
    res.setHeader('X-RateLimit-Catalog-Hour-Limit', String(limit.hourlyMax));
    res.setHeader('X-RateLimit-Catalog-Hour-Remaining', String(limit.hourlyRemaining));
  }

  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({
      error:'Too many catalog requests. Try again after the cooldown.',
      code:'CATALOG_CLIENT_RATE_LIMITED',
      retryAfterSeconds:limit.retryAfterSeconds
    });
    return false;
  }

  return true;
}

export function resetCatalogRequestGuardForTests() {
  globalThis[STORE_KEY]?.clear?.();
}
