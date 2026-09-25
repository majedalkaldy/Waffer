import { hasUsablePartNumber, hasUsableVin } from './identity.js';

const VALID_ITEM_TYPES = new Set(['part','labor','service','fee']);
const REQUIRED_SHAPE = [
  'total',
  'status',
  'transparency',
  'identityConfidence',
  'compatibilityConfidence',
  'priceConfidence',
  'overallConfidence',
  'items'
];

function clamp(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function hasPrintedTotal(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return !/غير مذكور|غير واضح|not stated|not mentioned|unclear|unknown/i.test(text);
}

export function normalizeAnalysisResult({
  result,
  safeVehicle,
  market,
  locale,
  currency,
  engineVersion,
  requestId,
  completedAt,
  deployment = null
}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('Invalid analysis result');
  }

  const missingShapeFields = REQUIRED_SHAPE.filter(key => !(key in result));
  const isEnglish = String(locale || '').toLowerCase().startsWith('en');
  const defaults = isEnglish
    ? {
        partNumber: 'not visible',
        manufacturer: 'not visible',
        quantity: 'not visible',
        tax: 'not stated',
        laborTotal: 'not stated',
        warranty: 'not stated'
      }
    : {
        partNumber: 'غير ظاهر',
        manufacturer: 'غير ظاهر',
        quantity: 'غير ظاهرة',
        tax: 'غير مذكورة',
        laborTotal: 'غير مذكور',
        warranty: 'غير مذكور'
      };

  const rawItems = Array.isArray(result.items) ? result.items.slice(0, 50) : [];

  const invalidItemIndexes = rawItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (!item || typeof item !== 'object') return true;
      const name = String(item?.name || item?.description || item?.item || '').trim();
      return !name;
    })
    .map(({ index }) => index);

  const normalizedItems = rawItems
    .length
    ? rawItems
        .slice(0, 50)
        .filter(item => {
          const name = String(item?.name || item?.description || item?.item || '').trim();
          const price = String(item?.price || '').trim();
          return Boolean(name || price);
        })
        .map(item => {
          const rawType = String(item?.itemType || '').toLowerCase();
          const partNumber = String(item?.partNumber || defaults.partNumber).slice(0, 120);
          const fallbackType = hasUsablePartNumber(partNumber) ? 'part' : 'service';
          return {
            ...item,
            name: String(item?.name || item?.description || item?.item || '').slice(0, 240),
            partNumber,
            manufacturer: String(item?.manufacturer || defaults.manufacturer).slice(0, 120),
            quantity: String(item?.quantity || defaults.quantity).slice(0, 80),
            price: String(item?.price || '').slice(0, 120),
            itemType: VALID_ITEM_TYPES.has(rawType) ? rawType : fallbackType,
            identityConfidence: clamp(item?.identityConfidence)
          };
        })
    : [];

  const normalized = {
    ...result,
    requestId,
    completedAt,
    engineVersion,
    deployment: {
      environment: String(deployment?.environment || '').trim().slice(0, 32) || null,
      commit: String(deployment?.commit || '').trim().slice(0, 40) || null
    },
    engineContext: { market, locale, currency },
    transparency: clamp(result.transparency),
    identityConfidence: clamp(result.identityConfidence),
    compatibilityConfidence: clamp(result.compatibilityConfidence),
    priceConfidence: clamp(result.priceConfidence),
    overallConfidence: clamp(result.overallConfidence),
    missing: Array.isArray(result.missing) ? result.missing : [],
    conflicts: Array.isArray(result.conflicts) ? result.conflicts : [],
    tax: String(result.tax || defaults.tax).slice(0, 120),
    laborTotal: String(result.laborTotal || defaults.laborTotal).slice(0, 120),
    warranty: String(result.warranty || defaults.warranty).slice(0, 300),
    nextActions: Array.isArray(result.nextActions) ? result.nextActions.slice(0, 5) : [],
    items: normalizedItems
  };

  const hasVin = hasUsableVin(safeVehicle?.vin);
  const itemCount = normalized.items.length;
  const identifiedCount = normalized.items.filter(item => hasUsablePartNumber(item.partNumber)).length;

  if (!hasVin) normalized.compatibilityConfidence = Math.min(normalized.compatibilityConfidence, 45);
  if (!identifiedCount) {
    normalized.identityConfidence = Math.min(normalized.identityConfidence, 40);
    normalized.priceConfidence = Math.min(normalized.priceConfidence, 15);
  }
  if (!itemCount) normalized.overallConfidence = Math.min(normalized.overallConfidence, 25);

  normalized.acceptance = {
    schemaValid: missingShapeFields.length === 0 && invalidItemIndexes.length === 0,
    missingShapeFields,
    invalidItemIndexes,
    hasItems: itemCount > 0,
    hasPrintedTotal: hasPrintedTotal(normalized.total),
    hasConfidence: normalized.overallConfidence > 0,
    hasVin,
    identifiedParts: identifiedCount,
    itemCount
  };

  return normalized;
}
