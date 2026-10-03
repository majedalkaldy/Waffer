function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function placeholder(value) {
  return /replace[- ]?(?:me|with)?|placeholder|^todo$|^tbd$/i.test(text(value));
}

function sourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

// Input quality only. This never certifies an offer, live fitment, or market price.
export function validateEbayPilotInput(payload, {environment} = {}) {
  const errors = [];
  const warnings = [];
  const cases = Array.isArray(payload) ? payload : payload?.cases;
  if (!['sandbox', 'production'].includes(environment)) errors.push('ENVIRONMENT_REQUIRED_OR_INVALID');
  if (!Array.isArray(cases)) {
    return {valid: false, environment, caseCount: 0, errors: [...errors, 'CASES_ARRAY_REQUIRED'], warnings, cases: []};
  }
  const minimum = environment === 'production' ? 20 : 1;
  if (cases.length < minimum || cases.length > 50) errors.push('CASE_COUNT_OUT_OF_RANGE');
  const ids = new Set();
  const inputs = new Set();
  const results = cases.map((entry, index) => {
    const reasons = [];
    const caseId = text(entry?.caseId);
    const partNumber = text(entry?.partNumber || entry?.requestedPartNumber);
    const partName = text(entry?.partName || entry?.name);
    const vehicle = entry?.vehicle || {};
    if (!caseId || placeholder(caseId)) reasons.push('CASE_ID_REQUIRED');
    if (ids.has(caseId)) reasons.push('DUPLICATE_CASE_ID');
    ids.add(caseId);
    if (!partNumber || placeholder(partNumber)) reasons.push('REAL_PART_NUMBER_REQUIRED');
    if (!partName || placeholder(partName)) reasons.push('REAL_PART_NAME_REQUIRED');
    if (!Number.isInteger(entry?.quantity) || entry.quantity < 1) reasons.push('POSITIVE_INTEGER_QUANTITY_REQUIRED');
    if (!/^\d{4}$/.test(String(vehicle.year || '')) || Number(vehicle.year) < 1981 || Number(vehicle.year) > 2100) reasons.push('VEHICLE_YEAR_INVALID');
    for (const field of ['make', 'model', 'trim', 'engine']) {
      if (!text(vehicle[field]) || placeholder(vehicle[field])) reasons.push(`VEHICLE_${field.toUpperCase()}_REQUIRED`);
    }
    const signature = [partNumber, vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.engine].map(value => String(value || '').trim().toLowerCase()).join('|');
    if (inputs.has(signature)) reasons.push('DUPLICATE_PILOT_INPUT');
    inputs.add(signature);
    if (environment === 'production') {
      if (entry?.evidence?.catalogVerified !== true) reasons.push('CATALOG_EVIDENCE_REVIEW_REQUIRED');
      if (!sourceUrl(entry?.evidence?.sourceUrl)) reasons.push('CATALOG_SOURCE_HTTPS_URL_REQUIRED');
      if (!text(entry?.evidence?.notes)) reasons.push('CATALOG_EVIDENCE_NOTES_REQUIRED');
    }
    return {caseId: caseId || String(index + 1), valid: reasons.length === 0, reasons};
  });
  if (results.some(entry => !entry.valid)) errors.push('INVALID_CASES');
  return {valid: errors.length === 0, environment, caseCount: cases.length, errors, warnings, cases: results};
}
