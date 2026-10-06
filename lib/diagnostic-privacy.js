// Diagnostic snapshots are allowlisted summaries, never copies of runtime/provider objects.
// Keep this synchronous and browser-safe so capture and download use the same boundary.
export const DIAGNOSTIC_PRIVACY_MODE = 'minimized-v1';

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function number(value, max = 1_000_000_000) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

function count(value) {
  const result = number(value);
  return Number.isInteger(result) ? result : null;
}

function pickNumbers(value, keys) {
  const source = record(value);
  return Object.fromEntries(keys.filter(key => count(source[key]) !== null).map(key => [key, source[key]]));
}

function pickBooleans(value, keys) {
  const source = record(value);
  return Object.fromEntries(keys.filter(key => typeof source[key] === 'boolean').map(key => [key, source[key]]));
}

function choice(value, values, fallback = null) {
  return values.includes(value) ? value : fallback;
}

export function sanitizeDiagnosticTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function requestId(value) {
  if (typeof value !== 'string') return null;
  return /^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|waffer-[a-z0-9]{8,12}-[a-z0-9]{6})$/i.test(value) ? value : null;
}

function commit(value) {
  return typeof value === 'string' && /^[a-f0-9]{7,40}$/i.test(value) ? value : null;
}

function engineVersion(value) {
  return typeof value === 'string' && /^mvp-\d{4}-\d{2}$/.test(value) ? value : null;
}

function amount(value) {
  if (typeof value === 'number') return number(value);
  if (typeof value !== 'string') return null;
  // Do not extract a number from arbitrary OCR text, VINs, names or descriptions.
  const match = value.trim().match(/^(?:(?:USD|SAR|US\$|\$|ر\.س)\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:\s*(?:USD|SAR|US\$|\$|ر\.س))?$/i);
  return match ? number(Number(match[1].replace(/,/g, ''))) : null;
}

function vehicleSummary(value) {
  const source = record(value);
  const vin = typeof source.vin === 'string' ? source.vin.trim() : '';
  const numericId = typeof source.vehicleId === 'string' && /^\d{1,9}$/.test(source.vehicleId)
    ? Number(source.vehicleId) : source.vehicleId;
  return {
    vehicleId: count(numericId) > 0 ? numericId : null,
    vinPresent: Boolean(vin) || source.vinPresent === true || source.vinRedacted === true,
    vinValid: /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin) || source.vinValid === true
  };
}

function acceptanceSummary(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    ...pickBooleans(value, ['schemaValid', 'hasItems', 'hasPrintedTotal', 'hasConfidence', 'hasVin']),
    ...pickNumbers(value, ['identifiedParts', 'itemCount', 'missingShapeFieldCount', 'invalidItemCount']),
    ...(Array.isArray(value.missingShapeFields) ? { missingShapeFieldCount: value.missingShapeFields.length } : {}),
    ...(Array.isArray(value.invalidItemIndexes) ? { invalidItemCount: value.invalidItemIndexes.length } : {})
  };
}

function uploadSummary(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    mimeType: choice(value.mimeType, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    ...pickBooleans(value, ['optimized']),
    ...pickNumbers(value, ['bytes', 'originalBytes', 'uploadBytes', 'originalWidth', 'originalHeight', 'uploadWidth', 'uploadHeight'])
  };
}

function catalogSummary(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    status: choice(value.status, ['NOT_STARTED', 'RUNNING', 'COMPLETED', 'TIMED_OUT', 'RATE_LIMITED', 'BLOCKED', 'FAILED', 'SKIPPED']),
    ...pickNumbers(value, ['matched', 'totalItems', 'partItems', 'skippedItems', 'axleRequested', 'axleVerified', 'elapsedMs', 'retryAfterSeconds'])
  };
}

function pricingSummary(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    ...pickNumbers(value, ['checkedItems', 'verifiedOfferCount', 'marketRangeCount', 'matchedListingCount', 'verifiedSavingCount']),
    currency: choice(value.currency, ['USD', 'SAR'])
  };
}

export function sanitizeFieldTestEvidence(value, { includeTotals = false } = {}) {
  if (!value || typeof value !== 'object') return null;
  return {
    privacyMode: DIAGNOSTIC_PRIVACY_MODE,
    requestId: requestId(value.requestId),
    completedAt: sanitizeDiagnosticTimestamp(value.completedAt),
    engineVersion: engineVersion(value.engineVersion),
    commit: commit(value.commit),
    acceptance: acceptanceSummary(value.acceptance),
    itemSummary: pickNumbers(value.itemSummary, ['total', 'part', 'labor', 'service', 'fee', 'nonPart']),
    upload: uploadSummary(value.upload),
    vehicle: vehicleSummary(value.vehicle),
    catalogState: catalogSummary(value.catalogState),
    pricingSummary: pricingSummary(value.pricingSummary),
    ...(includeTotals ? { total: amount(value.total), calculatedTotal: amount(value.calculatedTotal) } : {})
  };
}

export function sanitizeFieldTestEntry(value) {
  const source = record(value);
  return {
    id: Number(source.id ?? source.scenarioId),
    status: choice(source.status, ['PENDING', 'PASS', 'FAIL'], 'PENDING'),
    testedAt: sanitizeDiagnosticTimestamp(source.testedAt),
    privacyMode: DIAGNOSTIC_PRIVACY_MODE,
    notes: '',
    notesPresent: source.notesPresent === true || (typeof source.notes === 'string' && Boolean(source.notes.trim())),
    evidence: sanitizeFieldTestEvidence(source.evidence, { includeTotals: Number(source.id ?? source.scenarioId) === 10 })
  };
}

export function sanitizeFieldTestDraft(value = {}) {
  const entries = new Map();
  for (const entry of Array.isArray(value?.scenarios) ? value.scenarios : []) {
    const sanitized = sanitizeFieldTestEntry(entry);
    if (Number.isInteger(sanitized.id) && sanitized.id >= 1 && sanitized.id <= 10) entries.set(sanitized.id, sanitized);
  }
  return {
    version: 1,
    privacyMode: DIAGNOSTIC_PRIVACY_MODE,
    updatedAt: sanitizeDiagnosticTimestamp(value?.updatedAt),
    scenarios: [...entries.values()].sort((a, b) => a.id - b.id)
  };
}

export function sanitizeFieldTestPreflight(value) {
  if (!value || typeof value !== 'object') return null;
  const checkIds = ['runtime-config', 'image-optimizer', 'canvas-jpeg', 'local-storage', 'service-worker', 'network-online', 'readiness-endpoint', 'runtime-configuration', 'field-test-integrity', 'csp', 'preflight-runtime'];
  return {
    format: 'waffer-browser-preflight-v1',
    ranAt: sanitizeDiagnosticTimestamp(value.ranAt),
    status: choice(value.status, ['PASS', 'WARN', 'FAIL']),
    checks: (Array.isArray(value.checks) ? value.checks : [])
      .filter(check => checkIds.includes(check?.id)).slice(0, checkIds.length)
      .map(check => ({ id: check.id, ok: check.ok === true, severity: choice(check.severity, ['critical', 'warning']), details: '' })),
    deployment: {
      environment: choice(value.deployment?.environment, ['production', 'preview', 'development']),
      commit: commit(value.deployment?.commit),
      engineVersion: engineVersion(value.deployment?.engineVersion)
    },
    readiness: {
      launchPhase: choice(value.readiness?.launchPhase, ['field-test']),
      ...pickBooleans(value.readiness, ['configuredAnalysis', 'configuredCatalog', 'verifiedPricingReady']),
      ...pickNumbers(value.readiness, ['fieldTestPassed', 'fieldTestPending'])
    }
  };
}

export function buildDiagnosticReport({
  analysis = {}, vehicle = {}, catalogState = null, pricingSummary: pricing = null,
  pricingCapability = false, upload = null, exportedAt = new Date().toISOString()
} = {}) {
  const source = record(analysis);
  const evidence = sanitizeFieldTestEvidence({ ...source, commit: source.deployment?.commit, vehicle, catalogState, pricingSummary: pricing, upload }, { includeTotals: true });
  const context = record(source.engineContext);
  return {
    format: 'waffer-diagnostic-summary-v1',
    privacyMode: DIAGNOSTIC_PRIVACY_MODE,
    exportedAt: sanitizeDiagnosticTimestamp(exportedAt),
    requestId: evidence.requestId,
    completedAt: evidence.completedAt,
    engineVersion: evidence.engineVersion,
    commit: evidence.commit,
    engineContext: {
      market: choice(context.market, ['US', 'SA']),
      locale: choice(context.locale, ['en-US', 'ar-US', 'en-SA', 'ar-SA']),
      currency: choice(context.currency, ['USD', 'SAR'])
    },
    acceptance: evidence.acceptance,
    catalogState: evidence.catalogState,
    pricingCapability: pricingCapability === true,
    pricingSummary: evidence.pricingSummary,
    upload: evidence.upload,
    vehicle: evidence.vehicle,
    analysisSummary: {
      totalsComparable: evidence.total !== null && evidence.calculatedTotal !== null,
      totalsMatch: evidence.total !== null && evidence.calculatedTotal !== null
        ? Math.abs(evidence.total - evidence.calculatedTotal) < 0.01 : null,
      ...Object.fromEntries(['transparency', 'identityConfidence', 'compatibilityConfidence', 'priceConfidence', 'overallConfidence']
        .map(key => [key, number(source[key], 100)])),
      itemCount: Array.isArray(source.items) ? source.items.length : 0,
      missingCount: Array.isArray(source.missing) ? source.missing.length : 0,
      conflictCount: Array.isArray(source.conflicts) ? source.conflicts.length : 0
    }
  };
}
