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

function selectEngine(values, vehicle = {}) {
  for (const raw of [vehicle?.nhtsa?.engineModel, vehicle?.engineModel, vehicle?.engine]) {
    const exact = exactValue(values, raw);
    if (exact) return { value: exact, basis: 'EXACT_TEXT' };
  }
  // Displacement/cylinder counts and trim prefixes cannot prove exact fitment.
  return null;
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
  const trim = exactValue(cleanValues(trimPayload), rawTrim);
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
      trim: 'EXACT_TEXT',
      engine: engineMatch.basis
    }
  };
}
