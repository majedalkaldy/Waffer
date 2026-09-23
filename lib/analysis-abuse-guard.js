import { createHash } from 'node:crypto';

const STORE_KEY = Symbol.for('waffer.analysis-abuse-guard.v1');

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

export function extractClientIp(req) {
  // Vercel overwrites x-forwarded-for with the public client IP, preventing spoofed external values.
  const raw = headerValue(req?.headers, 'x-forwarded-for').trim();
  if (!raw) return '';
  return raw.split(',')[0].trim().slice(0, 128);
}

export function analysisClientKey(req) {
  const ip = extractClientIp(req);
  if (!ip) return '';
  return createHash('sha256')
    .update('waffer-analysis|' + ip)
    .digest('hex')
    .slice(0, 32);
}

export function checkAnalysisRequestProvenance(req) {
  const fetchSite = headerValue(req?.headers, 'sec-fetch-site').toLowerCase();
  if (fetchSite === 'cross-site') {
    return { allowed: false, code: 'ANALYSIS_CROSS_SITE_BLOCKED' };
  }

  const origin = headerValue(req?.headers, 'origin');
  const host = headerValue(req?.headers, 'host');
  if (origin && host) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (originHost !== host.toLowerCase()) {
        return { allowed: false, code: 'ANALYSIS_ORIGIN_MISMATCH' };
      }
    } catch {
      return { allowed: false, code: 'ANALYSIS_ORIGIN_INVALID' };
    }
  }

  return { allowed: true, code: null };
}

function resetWindow(now, windowMs) {
  return { start: now, count: 0, windowMs };
}

function secondsUntilReset(bucket, now) {
  return Math.max(1, Math.ceil((bucket.start + bucket.windowMs - now) / 1000));
}

function pruneStore(map, now, maxEntries, maxAgeMs) {
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

export function checkAnalysisRequestLimit(req, config, now = Date.now()) {
  const key = analysisClientKey(req);

  // Local tests and non-Vercel development may not have x-forwarded-for.
  // Vercel production requests do, so missing IP is not used as a shared global bucket.
  if (!key) {
    return {
      allowed: true,
      key: null,
      reason: 'NO_CLIENT_IP',
      retryAfterSeconds: 0,
      burstRemaining: null,
      hourlyRemaining: null
    };
  }

  const burstWindowMs = Number(config?.analysisRateLimitBurstWindowMs) || 60_000;
  const burstMax = Number(config?.analysisRateLimitBurstMax) || 4;
  const hourlyWindowMs = Number(config?.analysisRateLimitHourlyWindowMs) || 3_600_000;
  const hourlyMax = Number(config?.analysisRateLimitHourlyMax) || 20;
  const maxEntries = Number(config?.analysisRateLimitMaxEntries) || 5000;

  const map = store();
  pruneStore(map, now, maxEntries, Math.max(hourlyWindowMs * 2, 7_200_000));

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
  const retryAfterSeconds = Math.max(
    burstExceeded ? secondsUntilReset(entry.burst, now) : 0,
    hourlyExceeded ? secondsUntilReset(entry.hourly, now) : 0
  );

  return {
    allowed: !burstExceeded && !hourlyExceeded,
    key,
    reason: burstExceeded && hourlyExceeded
      ? 'BURST_AND_HOURLY'
      : burstExceeded
        ? 'BURST'
        : hourlyExceeded
          ? 'HOURLY'
          : 'OK',
    retryAfterSeconds,
    burstRemaining: Math.max(0, burstMax - entry.burst.count),
    hourlyRemaining: Math.max(0, hourlyMax - entry.hourly.count),
    burstMax,
    hourlyMax
  };
}

export function resetAnalysisRequestGuardForTests() {
  globalThis[STORE_KEY]?.clear?.();
}
