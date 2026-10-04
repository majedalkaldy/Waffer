import { DEMO_NOTICE, DEMO_VEHICLES, DEMO_PARTS, DEMO_SCENARIOS, simulateReview } from './fixtures.js';
const form = document.querySelector('#demo-form');
const progress = document.querySelector('#progress');
const result = document.querySelector('#result');
const run = document.querySelector('#run');
let generation = 0;
function populate(id, values) {
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value.id; option.textContent = value.label;
    document.querySelector(id).append(option);
  }
}
populate('#vehicle', DEMO_VEHICLES); populate('#part', DEMO_PARTS); populate('#scenario', DEMO_SCENARIOS);
function clear(message) {
  generation += 1;
  result.replaceChildren(); result.removeAttribute('data-status');
  progress.textContent = message; run.disabled = false; result.setAttribute('aria-busy', 'false');
}
function add(tag, text, className = '') {
  const element = document.createElement(tag); element.textContent = text;
  if (className) element.className = className;
  result.append(element); return element;
}
function render(output) {
  result.dataset.status = output.status;
  add('p', DEMO_NOTICE, 'result-label');
  add('h3', output.title || 'Choose valid demo inputs');
  add('p', output.detail || 'Only the supplied fictional choices and quantities 1–4 are supported.');
  if (!output.partNumber) return;
  add('p', `${output.vehicleLabel} / ${output.partLabel} (${output.partNumber}) / Quantity ${output.quantity}`, 'subtle');
  if (output.illustration) {
    const price = output.illustration;
    const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency }).format(cents / 100);
    add('p', `${price.fictionalSeller} · Invented amounts`, 'seller');
    add('p', `${money(price.itemCents)} × ${output.quantity} + ${money(price.shippingCents)} fictional shipping`, 'subtle');
    add('p', `${money(price.totalCents)} USD`, 'amount');
    add('p', 'Illustrative subtotal only. Tax is not modeled. No stock or real fitment is verified; no savings claim or purchase is available.', 'subtle');
  }
  const stages = output.status === 'SIMULATED_ERROR' ? 'Fixture identity → simulated source error → result withheld'
    : output.status === 'SIMULATED_EMPTY' ? 'Fixture identity → simulated empty search → result withheld'
    : output.status === 'SIMULATED_UNCERTAIN' ? 'Fixture identity → ambiguous simulated fitment → result withheld'
    : output.status === 'SIMULATED_STALE' ? 'Fixture identity → simulated fitment → stale fixture → result withheld'
    : 'Fixture identity → simulated fitment → illustrative amount → no checkout';
  add('p', stages, 'trace');
}
form.addEventListener('change', () => clear('Inputs changed. Run the demo again to see the new scenario.'));
form.addEventListener('reset', () => clear('Demo reset. Choose a scenario, then run the demo.'));
form.addEventListener('submit', async event => {
  event.preventDefault();
  clear('Running a local fixture simulation. No API request is being made.');
  const current = generation;
  const input = { vehicleId: form.elements.vehicle.value, partId: form.elements.part.value,
    scenarioId: form.elements.scenario.value, quantity: Number(form.elements.quantity.value) };
  run.disabled = true; result.setAttribute('aria-busy', 'true');
  await new Promise(resolve => setTimeout(resolve, 250));
  if (current !== generation) return;
  render(simulateReview(input)); run.disabled = false; result.setAttribute('aria-busy', 'false');
  progress.textContent = 'Synthetic simulation complete. No external calls were made.';
});
window.addEventListener('pagehide', () => clear('Choose a scenario, then run the demo.'));
window.addEventListener('pageshow', event => { if (event.persisted) clear('Choose a scenario, then run the demo.'); });
