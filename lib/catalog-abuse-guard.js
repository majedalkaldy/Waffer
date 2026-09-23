import { createHash } from 'node:crypto';
import { extractClientIp } from './analysis-abuse-guard.js';

const STORE_KEY = Symbol.for('waffer.catalog-abuse-guard.v1');

function store() {
  if (!globalThis[STORE_KEY]) globalThis[STORE_KEY] = new Map();
  return globalThis[STORE_KEY];
}

function clientHash(req, bucket) {
  const ip = extractClientIp(req);
  if (!ip) return '';
  return createHash('sha256')
    .update('waffer-catalog|' + String(bucket || 'catalog') + '|' + ip)
    .digest('hex')
    .slice(0, 32);
}

function resetWindow(now, windowMs) {
  return { start: now, count: 0, windowMs };
}

function secondsUntilReset(bucket, now) {
  return Math.max(1, Math.ceil((bucket.start + bucket.windowMs - now) / 1000));
}

function policy(config, bucket) {
  if (bucket === 'vin') {
    return {
      burstWindowMs: Number(config?.vinRateLimitBurstWindowMs) || 60_000,
      burstMax: Number(config?.vinRateLimitBurstMax) || 30,
      hourlyWindowMs: Number(config?.vinRateLimitHourlyWindowMs) || 3_600_000,
      hourlyMax: Number(config?.vinRateLimitHourlyMax) || 300
    };
  }

  if (bucket === 'manufacturers') {
    return {
      burstWindowMs: Number(config?.manufacturersRateLimitBurstWindowMs) || 60_000,
      burstMax: Number(config?.manufacturersRateLimitBurstMax) || 60,
      hourlyWindowMs: Number(config?.manufacturersRateLimitHourlyWindowMs) || 3_600_000,
      hourlyMax: Number(config?.manufacturersRateLimitHourlyMax) || 600
    };
  }

  return {
    burstWindowMs: Number(config?.catalogRateLimitBurstWindowMs) || 60_000,
    burstMax: Number(config?.catalogRateLimitBurstMax) || 600,
    hourlyWindowMs: Number(config?.catalogRateLimitHourlyWindowMs) || 3_600_000,
    hourlyMax: Number(config?.catalogRateLimitHourlyMax) || 6_000
  };
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

export function checkCatalogRequestLimit(req, config, bucket = 'match', now = Date.now()) {
  const key = clientHash(req, bucket);
  if (!key) {
    return {
      allowed: true,
      reason: 'NO_CLIENT_IP',
      retryAfterSeconds: 0,
      burstRemaining: null,
      hourlyRemaining: null,
      burstMax: null,
      hourlyMax: null
    };
  }

  const p = policy(config, bucket);
  const maxEntries = Number(config?.catalogRateLimitMaxEntries) || 5000;
  const map = store();
  prune(map, now, maxEntries, Math.max(p.hourlyWindowMs * 2, 7_200_000));

  const compositeKey = bucket + '|' + key;
  let entry = map.get(compositeKey);
  if (!entry) {
    entry = {
      burst: resetWindow(now, p.burstWindowMs),
      hourly: resetWindow(now, p.hourlyWindowMs),
      lastSeen: now
    };
    map.set(compositeKey, entry);
  }

  if (now >= entry.burst.start + entry.burst.windowMs) {
    entry.burst = resetWindow(now, p.burstWindowMs);
  }
  if (now >= entry.hourly.start + entry.hourly.windowMs) {
    entry.hourly = resetWindow(now, p.hourlyWindowMs);
  }

  entry.burst.count += 1;
  entry.hourly.count += 1;
  entry.lastSeen = now;

  const burstExceeded = entry.burst.count > p.burstMax;
  const hourlyExceeded = entry.hourly.count > p.hourlyMax;
  const retryAfterSeconds = Math.max(
    burstExceeded ? secondsUntilReset(entry.burst, now) : 0,
    hourlyExceeded ? secondsUntilReset(entry.hourly, now) : 0
  );

  return {
    allowed: !burstExceeded && !hourlyExceeded,
    reason: burstExceeded && hourlyExceeded
      ? 'BURST_AND_HOURLY'
      : burstExceeded
        ? 'BURST'
        : hourlyExceeded
          ? 'HOURLY'
          : 'OK',
    retryAfterSeconds,
    burstRemaining: Math.max(0, p.burstMax - entry.burst.count),
    hourlyRemaining: Math.max(0, p.hourlyMax - entry.hourly.count),
    burstMax: p.burstMax,
    hourlyMax: p.hourlyMax
  };
}

export function applyCatalogRequestGuard(req, res, config, bucket = 'match') {
  const result = checkCatalogRequestLimit(req, config, bucket);

  if (result.burstMax != null) {
    res.setHeader('X-RateLimit-Burst-Limit', String(result.burstMax));
    res.setHeader('X-RateLimit-Burst-Remaining', String(result.burstRemaining));
    res.setHeader('X-RateLimit-Hourly-Limit', String(result.hourlyMax));
    res.setHeader('X-RateLimit-Hourly-Remaining', String(result.hourlyRemaining));
  }

  if (result.allowed) return true;

  const code = bucket === 'vin'
    ? 'VIN_CLIENT_RATE_LIMITED'
    : 'CATALOG_CLIENT_RATE_LIMITED';

  res.setHeader('Retry-After', String(result.retryAfterSeconds));
  res.status(429).json({
    error: bucket === 'vin'
      ? 'Too many VIN lookups. Try again after the cooldown.'
      : 'Too many catalog requests. Try again after the cooldown.',
    code,
    retryAfterSeconds: result.retryAfterSeconds
  });
  return false;
}

export function resetCatalogRequestGuardForTests() {
  globalThis[STORE_KEY]?.clear?.();
}
