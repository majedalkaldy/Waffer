function clean(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEnvironment(value) {
  const environment = String(value || '').trim().toLowerCase();
  if (!['sandbox', 'production'].includes(environment)) {
    throw new Error('An explicit sandbox or production environment is required');
  }
  return environment;
}

export async function buildEbayPilotSample({
  provider,
  environment,
  cases = []
} = {}) {
  if (!provider || typeof provider.lookup !== 'function') {
    throw new Error('A configured eBay provider is required');
  }
  if (!Array.isArray(cases)) {
    throw new Error('Pilot cases must be an array');
  }

  const normalizedEnvironment = normalizeEnvironment(environment);
  const providerEnvironment = normalizeEnvironment(provider.environment);
  if (providerEnvironment !== normalizedEnvironment ||
      (String(provider.id || '').toLowerCase().endsWith('-sandbox') && normalizedEnvironment !== 'sandbox')) {
    throw new Error('Provider environment does not match the requested pilot environment');
  }
  const output = [];

  for (let index = 0; index < cases.length; index += 1) {
    const input = cases[index] || {};
    const caseId = clean(input.caseId || String(index + 1), 120);
    const requestedPartNumber = clean(input.partNumber || input.requestedPartNumber, 120);
    const requestEvidence = {requestedManufacturer: clean(input.manufacturer, 120), requestedVehicle: Object.fromEntries(['year','make','model','trim','engine'].map(key => [key, clean(String(input.vehicle?.[key] || ''), 160)])), quantity: Number(input.quantity) > 0 ? Number(input.quantity) : 1};

    if (!requestedPartNumber) {
      output.push({
        caseId,
        ...requestEvidence,
        requestedPartNumber: '',
        checkedAt: new Date().toISOString(),
        marketRange: null,
        bestOffer: null,
        runnerStatus: 'PART_NUMBER_REQUIRED'
      });
      continue;
    }

    try {
      const result = await provider.lookup({
        market: 'US',
        locale: 'en-US',
        currency: 'USD',
        part: {
          name: clean(input.partName || input.name, 240),
          number: requestedPartNumber,
          manufacturer: clean(input.manufacturer, 120)
        },
        vehicle: input.vehicle || {},
        quantity: Number(input.quantity) > 0 ? Number(input.quantity) : 1
      });

      output.push({
        caseId,
        ...requestEvidence,
        requestedPartNumber,
        // Never turn missing provider evidence into a fresh observation.
        checkedAt: result?.checkedAt || null,
        marketRange: result?.marketRange || null,
        bestOffer: result?.bestOffer || null,
        matchedListing: result?.matchedListing || null,
        runnerStatus: result?.bestOffer || result?.marketRange || result?.matchedListing
          ? 'DATA_RETURNED'
          : 'NO_VERIFIED_DATA'
      });
    } catch (error) {
      output.push({
        caseId,
        ...requestEvidence,
        requestedPartNumber,
        checkedAt: new Date().toISOString(),
        marketRange: null,
        bestOffer: null,
        runnerStatus: clean(error?.code || error?.message || 'PROVIDER_ERROR', 120)
      });
    }
  }

  return {
    captureContract: 'ebay-us-matched-listing-v1',
    evidenceKind: provider.evidenceKind || 'UNVERIFIED_CAPTURE',
    synthetic: provider.evidenceKind !== 'REAL_PROVIDER_CAPTURE',
    providerId: String(provider.id || 'ebay-us-browse-shadow').slice(0, 80),
    environment: normalizedEnvironment,
    market: 'US',
    currency: 'USD',
    generatedAt: new Date().toISOString(),
    cases: output
  };
}
