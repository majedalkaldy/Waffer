// Fictional UX fixtures only. No provider adapter or production price contract.
export const DEMO_NOTICE = 'Synthetic demo · Fictional data · No live eBay calls';
export const DEMO_VEHICLES = Object.freeze([
  Object.freeze({ id: 'demo-sedan', label: 'Fictional 2020 Example Sedan · Demo trim · 2.0L' }),
  Object.freeze({ id: 'demo-wagon', label: 'Fictional 2021 Example Wagon · Demo trim · 2.5L' })
]);
export const DEMO_PARTS = Object.freeze([
  Object.freeze({ id: 'demo-filter', label: 'Fictional oil filter', number: 'DEMO-FILTER-001', cents: 1800 }),
  Object.freeze({ id: 'demo-pad', label: 'Fictional brake pad set', number: 'DEMO-PAD-002', cents: 4200 })
]);
export const DEMO_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'match', label: 'Simulated match', title: 'Illustrative offer only', detail: 'The fixture matches its fictional vehicle and part. These amounts are invented for this review and cannot be purchased.' }),
  Object.freeze({ id: 'empty', label: 'No results', title: 'No matching fixture results', detail: 'The simulated search returned no candidates. No price, savings, or purchase link is shown.' }),
  Object.freeze({ id: 'error', label: 'Provider error', title: 'Simulated source unavailable', detail: 'This is an intentional local error scenario. No external service was contacted. Retry the demo or choose a different scenario.' }),
  Object.freeze({ id: 'stale', label: 'Stale data', title: 'Illustrative offer withheld', detail: 'The fixture is 72 simulated hours old, beyond the demo’s 48-hour freshness window. No price or purchase link is shown.' }),
  Object.freeze({ id: 'uncertain', label: 'Fitment uncertain', title: 'Fitment needs more evidence', detail: 'The fixture cannot resolve trim and engine unambiguously. It does not invent a match. No price or purchase link is shown.' })
]);
export function simulateReview({ vehicleId, partId, scenarioId, quantity } = {}) {
  const vehicle = DEMO_VEHICLES.find(item => item.id === vehicleId);
  const part = DEMO_PARTS.find(item => item.id === partId);
  const scenario = DEMO_SCENARIOS.find(item => item.id === scenarioId);
  if (!vehicle || !part || !scenario || !Number.isInteger(quantity) || quantity < 1 || quantity > 4) {
    return { mode: 'synthetic-review', productionEligible: false, status: 'INVALID_DEMO_INPUT', illustration: null };
  }
  return {
    mode: 'synthetic-review', productionEligible: false,
    status: `SIMULATED_${scenario.id.toUpperCase()}`,
    title: scenario.title, detail: scenario.detail, vehicleLabel: vehicle.label,
    partLabel: part.label, partNumber: part.number, quantity,
    // Intentionally unlike bestOffer: no URL, checkedAt, stock or verified flags.
    illustration: scenario.id === 'match' ? {
      fictionalSeller: 'Fictional seller A', currency: 'USD',
      itemCents: part.cents, shippingCents: 400,
      totalCents: part.cents * quantity + 400
    } : null
  };
}
