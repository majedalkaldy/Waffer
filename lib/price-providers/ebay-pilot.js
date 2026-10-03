function clean(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEnvironment(value) {
  return String(value || '').trim().toLowerCase() === 'sandbox'
    ? 'sandbox'
    : 'production';
}

export async function buildEbayPilotSample({
  provider,
  environment = 'production',
  cases = []
} = {}) {
  if (!provider || typeof provider.lookup !== 'function') {
    throw new Error('A configured eBay provider is required');
  }
  if (!Array.isArray(cases)) {
    throw new Error('Pilot cases must be an array');
  }

  const normalizedEnvironment = normalizeEnvironment(environment);
  const output = [];

  for (let index = 0; index < cases.length; index += 1) {
    const input = cases[index] || {};
    const caseId = clean(input.caseId || String(index + 1), 120);
    const requestedPartNumber = clean(input.partNumber || input.requestedPartNumber, 120);

    if (!requestedPartNumber) {
      output.push({
        caseId,
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
          number: requestedPartNumber
        },
        vehicle: input.vehicle || {},
        quantity: Number(input.quantity) > 0 ? Number(input.quantity) : 1
      });

      output.push({
        caseId,
        requestedPartNumber,
        checkedAt: result?.checkedAt || new Date().toISOString(),
        marketRange: result?.marketRange || null,
        bestOffer: result?.bestOffer || null,
        runnerStatus: result?.bestOffer || result?.marketRange
          ? 'DATA_RETURNED'
          : 'NO_VERIFIED_DATA'
      });
    } catch (error) {
      output.push({
        caseId,
        requestedPartNumber,
        checkedAt: new Date().toISOString(),
        marketRange: null,
        bestOffer: null,
        runnerStatus: clean(error?.code || error?.message || 'PROVIDER_ERROR', 120)
      });
    }
  }

  return {
    providerId: String(provider.id || 'ebay-us-browse-shadow').slice(0, 80),
    environment: normalizedEnvironment,
    market: 'US',
    currency: 'USD',
    generatedAt: new Date().toISOString(),
    cases: output
  };
}
