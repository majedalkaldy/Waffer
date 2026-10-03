export const EBAY_MOTORS_US_CATEGORY_TREE_ID = '100';

function norm(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function cleanValues(payload) {
  return (Array.isArray(payload?.compatibilityPropertyValues)
    ? payload.compatibilityPropertyValues
    : [])
    .map(entry => String(entry?.value || '').trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function exactValue(values, requested) {
  const target = norm(requested);
  if (!target) return null;
  const matches = unique(values).filter(value => norm(value) === target);
  return matches.length === 1 ? matches[0] : null;
}

function exactOrUniquePrefix(values, requested) {
  const exact = exactValue(values, requested);
  if (exact) return exact;
  const target = norm(requested);
  if (!target) return null;
  const matches = unique(values).filter(value => {
    const candidate = norm(value);
    return candidate.startsWith(target) || target.startsWith(candidate);
  });
  return matches.length === 1 ? matches[0] : null;
}

function engineDimensions(value) {
  const text = String(value || '').toUpperCase();
  let liters = null;
  const literMatch = text.match(/(\d+(?:\.\d+)?)\s*L\b/);
  if (literMatch) liters = Number(literMatch[1]);
  if (!Number.isFinite(liters)) {
    const ccMatch = text.match(/\b(\d{3,4})\s*CC\b/);
    if (ccMatch) liters = Math.round((Number(ccMatch[1]) / 1000) * 100) / 100;
  }

  let cylinders = null;
  const cylinderPatterns = [
    /\b(?:V|I|L|H|W)\s*(\d{1,2})\b/,
    /\b(\d{1,2})\s*CYL(?:INDER)?S?\b/
  ];
  for (const pattern of cylinderPatterns) {
    const match = text.match(pattern);
    if (match) {
      cylinders = Number(match[1]);
      break;
    }
  }

  return {
    liters: Number.isFinite(liters) ? liters : null,
    cylinders: Number.isFinite(cylinders) ? cylinders : null
  };
}

function selectEngine(values, vehicle = {}) {
  for (const raw of [vehicle?.nhtsa?.engineModel, vehicle?.engineModel, vehicle?.engine]) {
    const exact = exactValue(values, raw);
    if (exact) return { value: exact, basis: 'EXACT_TEXT' };
  }

  const targetLiters = Number(vehicle?.nhtsa?.displacementL ?? vehicle?.displacementL);
  const targetCylinders = Number(vehicle?.nhtsa?.engineCylinders ?? vehicle?.engineCylinders);
  if (!Number.isFinite(targetLiters) || targetLiters <= 0 ||
      !Number.isFinite(targetCylinders) || targetCylinders <= 0) {
    return null;
  }

  const matches = unique(values).filter(value => {
    const parsed = engineDimensions(value);
    if (!Number.isFinite(parsed.liters) || !Number.isFinite(parsed.cylinders)) return false;
    return Math.abs(parsed.liters - targetLiters) <= 0.11 &&
      parsed.cylinders === Math.round(targetCylinders);
  });

  return matches.length === 1
    ? { value: matches[0], basis: 'UNIQUE_ENGINE_DIMENSIONS' }
    : null;
}

export function buildCompatibilityFilter(pairs = []) {
  return pairs
    .filter(([, value]) => String(value || '').trim())
    .map(([name, value]) =>
      String(name).trim() + ':' + String(value).trim().replace(/,/g, '\\,')
    )
    .join(',');
}

export async function resolveEbayCanonicalVehicle({
  categoryId,
  vehicle = {},
  getProperties,
  getValues
} = {}) {
  const category = String(categoryId || '').trim();
  if (!category || typeof getProperties !== 'function' || typeof getValues !== 'function') {
    return { canonical: false, reason: 'RESOLVER_INPUT_INCOMPLETE' };
  }

  const propertiesPayload = await getProperties(category);
  const propertyNames = new Set(
    (Array.isArray(propertiesPayload?.compatibilityProperties)
      ? propertiesPayload.compatibilityProperties
      : [])
      .map(entry => String(entry?.name || '').trim())
      .filter(Boolean)
  );

  const required = ['Year', 'Make', 'Model', 'Trim', 'Engine'];
  if (!required.every(name => propertyNames.has(name))) {
    return { canonical: false, reason: 'CATEGORY_NOT_CAR_TRUCK_APPLICATION_COMPATIBLE' };
  }

  const rawYear = String(vehicle?.year || vehicle?.nhtsa?.year || '').trim();
  const rawMake = String(vehicle?.make || vehicle?.manufacturerName || vehicle?.nhtsa?.make || '').trim();
  const rawModel = String(vehicle?.model || vehicle?.modelName || vehicle?.nhtsa?.model || '').trim();
  const rawTrim = String(vehicle?.nhtsa?.trim || vehicle?.trim || '').trim();

  if (!/^\d{4}$/.test(rawYear) || !rawMake || !rawModel || !rawTrim) {
    return { canonical: false, reason: 'VEHICLE_IDENTITY_INCOMPLETE' };
  }

  const makePayload = await getValues(category, 'Make', [['Year', rawYear]]);
  const make = exactValue(cleanValues(makePayload), rawMake);
  if (!make) return { canonical: false, reason: 'MAKE_NOT_CANONICAL' };

  const modelPayload = await getValues(category, 'Model', [['Year', rawYear], ['Make', make]]);
  const model = exactValue(cleanValues(modelPayload), rawModel);
  if (!model) return { canonical: false, reason: 'MODEL_NOT_CANONICAL' };

  const trimPayload = await getValues(category, 'Trim', [
    ['Year', rawYear],
    ['Make', make],
    ['Model', model]
  ]);
  const trim = exactOrUniquePrefix(cleanValues(trimPayload), rawTrim);
  if (!trim) return { canonical: false, reason: 'TRIM_AMBIGUOUS_OR_UNRESOLVED' };

  const enginePayload = await getValues(category, 'Engine', [
    ['Year', rawYear],
    ['Make', make],
    ['Model', model],
    ['Trim', trim]
  ]);
  const engineMatch = selectEngine(cleanValues(enginePayload), vehicle);
  if (!engineMatch) return { canonical: false, reason: 'ENGINE_AMBIGUOUS_OR_UNRESOLVED' };

  return {
    canonical: true,
    source: 'EBAY_TAXONOMY',
    marketplace: 'EBAY_US',
    categoryTreeId: EBAY_MOTORS_US_CATEGORY_TREE_ID,
    categoryId: category,
    year: rawYear,
    make,
    model,
    trim,
    engine: engineMatch.value,
    matchBasis: {
      make: 'EXACT_TEXT',
      model: 'EXACT_TEXT',
      trim: norm(trim) === norm(rawTrim) ? 'EXACT_TEXT' : 'UNIQUE_PREFIX',
      engine: engineMatch.basis
    }
  };
}
