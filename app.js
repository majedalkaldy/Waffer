import { fetchJSON, fileType, validateFile, validateYear, readAsDataURL, assertAnalysis, VIN_PATTERN, list, text, score } from './lib/client-core.js?v=20260922-stability';
import { t } from './lib/i18n.js?v=20260922-stability';
import { getMarketConfig } from './lib/market-config.js';
import { createVinResolver } from './vin-ui.js?v=20260922-stability';
import { matchParts } from './parts-match.js?v=20260922-stability';

const $ = id => document.getElementById(id);
const state = { locale: 'ar-SA', analysis: null, snapshot: null, catalog: null, vehicle: null,
  candidates: [], autoFields: null, manualOverride: false, run: 0, busy: false,
  analysisController: null, catalogController: null, timer: null, health: null };
const tr = key => t(state.locale, key);
const number = value => new Intl.NumberFormat(state.locale).format(value);
const showText = value => text(value) || tr('notShown');
const scoreText = value => score(value) === null ? '—' : number(score(value)) + '/100';
const isCurrent = run => run === state.run;
function node(tag, value, className) {
  const element = document.createElement(tag);
  if (value != null) element.textContent = value;
  if (className) element.className = className;
  return element;
}
function notify(key, error = true) {
  $('notice').textContent = tr(key);
  $('notice').className = 'notice ' + (error ? 'error' : 'warning');
  $('notice').hidden = false;
}
function reportError(error) {
  const key = error?.code && t(state.locale, error.code) !== error.code ? error.code : 'REQUEST_FAILED';
  notify(key);
}
function clearNotice() { $('notice').hidden = true; $('notice').textContent = ''; }
function show(id) {
  for (const name of ['home','loading','result','advanced','msg']) $(name).hidden = name !== id;
  $('loading').setAttribute('aria-busy', id === 'loading' ? 'true' : 'false');
  const heading = $(id).querySelector('h1,h2');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function setBusy(busy) {
  state.busy = busy;
  $('analyzeBtn').disabled = busy;
  $('analyzeBtn').textContent = tr(busy ? 'analyzing' : 'analyze');
  $('localeSelect').disabled = busy;
  $('updateApp').disabled = busy;
}
function cancelRun() {
  state.run++;
  state.analysisController?.abort();
  state.catalogController?.abort();
  clearInterval(state.timer);
  state.timer = null;
  setBusy(false);
}
function invalidateVehicle(clearFields = false) {
  resolver.clear();
  if (clearFields && state.autoFields) {
    for (const [id, value] of Object.entries(state.autoFields)) if ($(id).value === value) $(id).value = '';
  }
  state.vehicle = null;
  state.candidates = [];
  state.autoFields = null;
  $('vehicleInfo').hidden = true;
  $('vehicleCandidates').hidden = true;
  $('candidateSelect').replaceChildren();
  $('checkVin').disabled = false;
}
function vehicleLabel(vehicle) {
  return [vehicle?.manufacturerName || vehicle?.make, vehicle?.modelName || vehicle?.model,
    vehicle?.year, vehicle?.vehicleDescription].filter(Boolean).join(' — ');
}
function selectVehicle(vehicle) {
  state.vehicle = vehicle;
  if (!vehicle) return;
  if (vehicle.manufacturerId && vehicle.manufacturerName) {
    if (![...$('make').options].some(option => option.value === vehicle.manufacturerId))
      $('make').add(new Option(vehicle.manufacturerName, vehicle.manufacturerId));
    $('make').value = vehicle.manufacturerId;
  }
  if (vehicle.modelName) $('model').value = vehicle.modelName;
  if (vehicle.year) $('year').value = vehicle.year;
  state.autoFields = { make: $('make').value, model: $('model').value, year: $('year').value };
  $('vehicleInfo').textContent = tr('vehicleSelected') + ': ' + (vehicleLabel(vehicle) || vehicle.vehicleId);
  $('vehicleInfo').hidden = false;
}
const resolver = createVinResolver({ onUpdate(result) {
  if ($('vin').value.trim().toUpperCase() !== result.vin) return;
  state.candidates = result.candidates;
  $('vehicleInfo').hidden = false;
  $('vehicleCandidates').hidden = result.candidates.length < 2;
  $('candidateSelect').replaceChildren(new Option(tr('chooseCandidate'), ''));
  for (const candidate of result.candidates)
    $('candidateSelect').add(new Option((vehicleLabel(candidate) || tr('unknown')) + ' · ' + candidate.vehicleId, candidate.vehicleId));
  if (result.selected) selectVehicle(result.selected);
  else {
    state.vehicle = null;
    $('vehicleInfo').textContent = tr(result.candidates.length ? 'vinAmbiguous' : 'vinNone');
  }
} });
async function checkVin() {
  const vin = $('vin').value.trim().toUpperCase();
  if (!VIN_PATTERN.test(vin)) { notify('VIN_INVALID'); return null; }
  if (state.vehicle?.vin === vin && !state.manualOverride) return state.vehicle;
  state.manualOverride = false;
  $('vin').value = vin;
  $('checkVin').disabled = true;
  $('vehicleInfo').hidden = false;
  $('vehicleInfo').textContent = tr('vinLoading');
  try {
    const result = await resolver.resolve(vin);
    if ($('vin').value.trim().toUpperCase() !== vin) return null;
    // Cached responses do not fire onUpdate. Preserve an explicit user selection.
    if (!state.vehicle && result.selected) selectVehicle(result.selected);
    return state.vehicle;
  } catch (error) {
    if (error?.name !== 'AbortError' && $('vin').value.trim().toUpperCase() === vin) {
      state.vehicle = null;
      $('vehicleInfo').textContent = tr('vinFailed');
    }
    return null;
  } finally {
    if ($('vin').value.trim().toUpperCase() === vin) $('checkVin').disabled = false;
  }
}
function snapshot() {
  const vin = $('vin').value.trim().toUpperCase();
  const resolved = state.vehicle?.vin === vin && !state.manualOverride ? { ...state.vehicle } : null;
  return {
    ...getMarketConfig({ locale: state.locale }),
    vin, vehicleId: resolved?.vehicleId || null, resolved,
    makeId: $('make').value,
    make: $('make').value ? $('make').selectedOptions[0]?.text || '' : '',
    model: $('model').value.trim(), year: $('year').value.trim()
  };
}
async function start() {
  if (state.busy) return;
  clearNotice();
  if (!navigator.onLine) { notify('offline'); return; }
  const file = $('file').files[0];
  const fileError = validateFile(file);
  if (fileError) { notify(fileError); return; }
  if (!validateYear($('year').value)) { notify('YEAR_INVALID'); return; }
  const vin = $('vin').value.trim().toUpperCase();
  if (vin && !VIN_PATTERN.test(vin)) { notify('VIN_INVALID'); return; }
  cancelRun();
  const run = state.run;
  state.analysis = null; state.catalog = null; state.snapshot = null;
  state.analysisController = new AbortController();
  const signal = state.analysisController.signal;
  setBusy(true); show('loading');
  const started = Date.now();
  $('elapsedTime').textContent = tr('elapsed') + ': 0 s';
  state.timer = setInterval(() => { $('elapsedTime').textContent = tr('elapsed') + ': ' + number(Math.floor((Date.now()-started)/1000)) + ' s'; }, 1000);
  try {
    if (vin && !state.manualOverride) { $('loadingStage').textContent = tr('stageVin'); await checkVin(); }
    if (!isCurrent(run) || signal.aborted) return;
    const vehicle = snapshot(); // Read year/make AFTER any VIN-driven updates.
    $('loadingStage').textContent = tr('stageFile');
    const fileData = await readAsDataURL(file, signal);
    if (!isCurrent(run)) return;
    $('loadingStage').textContent = tr('stageAnalysis');
    const data = await fetchJSON('/api/analyze', { method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ fileData, fileName: file.name, mimeType: fileType(file), vehicle }), signal, timeoutMs: 70000 });
    if (!isCurrent(run)) return;
    state.analysis = assertAnalysis(data);
    state.snapshot = vehicle;
    state.catalog = { status: vehicle.vehicleId ? 'RUNNING' : 'NOT_REQUESTED', matches: [] };
    render(); show('result');
    if (vehicle.vehicleId) void runCatalog(run, vehicle);
  } catch (error) {
    if (isCurrent(run) && error?.name !== 'AbortError') { reportError(error); show('home'); }
  } finally {
    if (isCurrent(run)) { clearInterval(state.timer); state.timer = null; setBusy(false); }
  }
}
async function runCatalog(run, vehicle) {
  const controller = new AbortController();
  state.catalogController = controller;
  try {
    const result = await matchParts(state.analysis, vehicle.vehicleId, vehicle, { signal: controller.signal });
    if (!isCurrent(run) || controller.signal.aborted) return;
    state.catalog = result;
    renderCatalog(); renderDiagnostics();
  } catch (error) {
    if (isCurrent(run) && !controller.signal.aborted) {
      state.catalog = { status:'FAILED', matches:[], errorCode:error?.code || 'REQUEST_FAILED' };
      renderCatalog(); renderDiagnostics();
    }
  }
}
function render() {
  const a = state.analysis;
  if (!a) return;
  $('rTotal').textContent = showText(a.total);
  $('currencyContext').textContent = tr('currencyContext') + ': ' + text(a.engineContext?.currency || state.snapshot.currency);
  $('rCalculatedTotal').textContent = tr('calculated') + ': ' + showText(a.calculatedTotal);
  $('rTaxLabor').textContent = tr('tax') + ': ' + showText(a.tax) + ' • ' + tr('labor') + ': ' + showText(a.laborTotal);
  $('rWarranty').textContent = tr('warranty') + ': ' + showText(a.warranty);
  $('rStatus').textContent = showText(a.status);
  $('rTransparency').textContent = scoreText(a.transparency);
  $('rIdentity').textContent = scoreText(a.identityConfidence);
  $('rCompatibility').textContent = state.snapshot.resolved ? scoreText(a.compatibilityConfidence) : '—';
  $('rPrice').textContent = '—'; // No verified market-price source in this MVP.
  $('rVehicleEvidence').textContent = state.snapshot.resolved
    ? tr('vehicleSelected') + ': ' + vehicleLabel(state.snapshot.resolved) : tr('vehicleUnverified');
  const warnings = [...list(a.missing), ...list(a.conflicts)].map(text).filter(Boolean);
  $('rAlerts').replaceChildren(...(warnings.length ? warnings : [tr('noFindings')]).map(value => node('p', value, 'notice warning')));
  $('itemsBody').replaceChildren();
  for (const item of a.items) {
    const row = node('tr');
    const kind = ({ part:'part', labor:'laborType', service:'service', fee:'fee' })[item.itemType] || 'unknown';
    for (const value of [text(item.name), tr(kind), showText(item.partNumber), showText(item.price),
      scoreText(item.identityConfidence), showText(item.compatibility), showText(item.priceAssessment), showText(item.conflict)]) row.append(node('td', value));
    $('itemsBody').append(row);
  }
  if (!a.items.length) { const row = node('tr'), cell = node('td', tr('noItems')); cell.colSpan = 8; row.append(cell); $('itemsBody').append(row); }
  $('nextActions').replaceChildren(...list(a.nextActions).map(text).filter(Boolean).map(value => node('p', value, 'notice')));
  const label = vehicleLabel(state.snapshot.resolved || state.snapshot);
  $('message').value = (label ? label + '\n\n' : '') + (text(a.workshopMessage) || tr('messageFallback'));
  renderCatalog(); renderDiagnostics();
}
function renderCatalog() {
  const catalog = state.catalog || { status:'NOT_REQUESTED', matches:[] };
  const label = ({ RUNNING:'catalogWaiting', COMPLETED:'catalogComplete', PARTIAL:'catalogPartial', TIMED_OUT:'catalogTimeout',
    NOT_REQUESTED:'catalogNone', NOT_APPLICABLE:'catalogNA', FAILED:'catalogFailed', CANCELLED:'catalogFailed' })[catalog.status] || 'catalogFailed';
  let summary = tr(label);
  if (catalog.categoryMatched != null) summary += ' ' + tr('categoryMatched') + ': ' + number(catalog.categoryMatched)
    + ' • ' + tr('candidateLines') + ': ' + number(catalog.candidateLines);
  $('catalogSummary').textContent = summary;
  $('catalogMatches').replaceChildren(node('p', summary, 'notice'));
  for (const match of list(catalog.matches)) {
    const block = node('article', null, 'candidate');
    block.append(node('h3', text(match.workshopItem)), node('p', tr(match.status), 'note'));
    if (match.productId != null) block.append(node('p', tr('category')+': '+text(match.productName)),
      node('p', tr('similarity')+': '+number(match.matchScore || 0)+'%', 'note'));
    if (match.requestedAxle && match.requestedAxle !== 'both')
      block.append(node('p', tr(match.requestedAxle)+' • '+tr('sample')+': '+number(match.criteriaChecked || 0), 'note'));
    for (const article of list(match.articles).slice(0,3)) {
      const card = node('div', null, 'notice');
      card.append(node('p', tr('partNumber')+': '+showText(article.articleNo || article.articleNumber)),
        node('p', tr('supplier')+': '+showText(article.supplierName || article.brandName || article.manufacturerName)),
        node('p', showText(article.articleProductName || article.productName), 'note'));
      if (article.axleVerified) card.append(node('p', tr('positionEvidence')+': '+tr(article.fittingPosition), 'note'));
      block.append(card);
    }
    $('catalogMatches').append(block);
  }
}
function renderDiagnostics() {
  if (!state.analysis) return;
  const a = state.analysis, c = state.catalog;
  $('diagnostics').textContent = JSON.stringify({ clientVersion:'stability-2026-09-22', requestId:a.requestId || null,
    engineVersion:a.engineVersion || null, completedAt:a.completedAt || null, context:a.engineContext || null,
    sourceLocale:state.snapshot.locale, itemCount:a.items.length, providerAcceptance:a.acceptance || null,
    catalog: c ? { status:c.status, elapsedMs:c.elapsedMs ?? null, categoryMatched:c.categoryMatched ?? null,
      candidateLines:c.candidateLines ?? null } : null }, null, 2);
}
function reset() {
  cancelRun(); invalidateVehicle(); clearNotice();
  state.analysis = null; state.snapshot = null; state.catalog = null; state.manualOverride = false;
  for (const id of ['file','model','year','vin']) $(id).value = '';
  $('make').value = '';
  for (const id of ['fileText','rTotal','rAlerts','itemsBody','nextActions','catalogMatches','diagnostics','catalogSummary']) $(id).replaceChildren();
  $('message').value = '';
  show('home');
}
async function loadMakes() {
  $('retryMakes').hidden = true;
  try {
    const data = await fetchJSON('/api/vehicles', { timeoutMs: 11000 });
    const selected = $('make').value, label = $('make').selectedOptions[0]?.text || '';
    const manufacturers = list(data?.manufacturers);
    if (!manufacturers.length) throw new Error('No manufacturers');
    $('make').replaceChildren(new Option(tr('chooseMake'), ''));
    for (const make of manufacturers) if (make?.manufacturerId != null && text(make.manufacturerName))
      $('make').add(new Option(make.manufacturerName, String(make.manufacturerId)));
    if (selected && ![...$('make').options].some(option => option.value === selected)) $('make').add(new Option(label, selected));
    $('make').value = selected;
  } catch { $('retryMakes').hidden = false; }
}
function healthText() {
  $('systemStatus').textContent = tr(state.health?.status === 'ready' ? 'healthConfig'
    : state.health ? 'healthPartial' : 'healthUnknown');
}
async function checkHealth() {
  try { state.health = await fetchJSON('/api/health', { cache:'no-store', timeoutMs: 6000 }); }
  catch { state.health = null; }
  healthText();
}
function applyLocale(locale) {
  state.locale = locale === 'en-SA' ? 'en-SA' : 'ar-SA';
  document.documentElement.lang = state.locale === 'en-SA' ? 'en' : 'ar';
  document.documentElement.dir = state.locale === 'en-SA' ? 'ltr' : 'rtl';
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = tr(element.dataset.i18n);
  $('make').options[0].text = tr('chooseMake');
  if ($('candidateSelect').options.length) $('candidateSelect').options[0].text = tr('chooseCandidate');
  $('offlineStatus').textContent = tr('offline');
  if (state.vehicle) $('vehicleInfo').textContent = tr('vehicleSelected')+': '+vehicleLabel(state.vehicle);
  else if (state.candidates.length > 1) $('vehicleInfo').textContent = tr('vinAmbiguous');
  healthText();
  render();
}
function updateNetwork() { $('offlineStatus').hidden = navigator.onLine; }

$('analyzeBtn').addEventListener('click', start);
$('cancelBtn').addEventListener('click', () => { cancelRun(); resolver.clear(); show('home'); notify('cancelled', false); });
$('checkVin').addEventListener('click', () => { clearNotice(); void checkVin(); });
$('vin').addEventListener('input', () => { invalidateVehicle(true); state.manualOverride = false; });
$('vin').addEventListener('change', () => { if (VIN_PATTERN.test($('vin').value.trim().toUpperCase())) void checkVin(); });
$('candidateSelect').addEventListener('change', () => { state.manualOverride = false; selectVehicle(state.candidates.find(v => v.vehicleId === $('candidateSelect').value) || null); });
for (const id of ['make','model','year']) $(id).addEventListener('input', () => {
  if (state.vehicle) { state.vehicle = null; state.manualOverride = true; state.autoFields = null;
    $('vehicleInfo').hidden = false; $('vehicleInfo').textContent = tr('manualChanged'); }
});
$('file').addEventListener('change', () => {
  clearNotice();
  const file = $('file').files[0];
  if (!file) { $('fileText').textContent = ''; return; }
  const error = validateFile(file);
  if (error) { $('file').value = ''; $('fileText').textContent = ''; notify(error); return; }
  $('fileText').textContent = file.name + ' — ' + (file.size / 1024 / 1024).toFixed(2) + ' MiB';
});
$('newAnalysisBtn').addEventListener('click', reset);
$('detailsBtn').addEventListener('click', () => show('advanced'));
$('workshopBtn').addEventListener('click', () => show('msg'));
$('followupBtn').addEventListener('click', () => show('msg'));
for (const element of document.querySelectorAll('[data-view]')) element.addEventListener('click', () => show(element.dataset.view));
$('retryMakes').addEventListener('click', loadMakes);
$('copyMessageBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('message').value); notify('copied', false); }
  catch { $('message').focus(); $('message').select(); notify('copyFailed', false); }
});
$('shareSummaryBtn').addEventListener('click', async () => {
  if (!state.analysis) return;
  const content = [tr('appName'), vehicleLabel(state.snapshot.resolved || state.snapshot),
    tr('totalShown')+': '+showText(state.analysis.total), tr('confirmedSaving'), text(state.analysis.requestId)].filter(Boolean).join('\n');
  try {
    if (navigator.share) await navigator.share({ title:tr('appName'), text:content });
    else { await navigator.clipboard.writeText(content); notify('copied', false); }
  } catch (error) { if (error.name !== 'AbortError') notify('shareFailed'); }
});
$('localeSelect').addEventListener('change', () => {
  try { localStorage.setItem('waffer-locale', $('localeSelect').value); } catch { /* Storage is optional. */ }
  applyLocale($('localeSelect').value);
});
try { const saved = localStorage.getItem('waffer-locale'); if (saved === 'en-SA') $('localeSelect').value = saved; } catch { /* Private mode must not stop boot. */ }
applyLocale($('localeSelect').value);
window.addEventListener('online', () => { updateNetwork(); void checkHealth(); });
window.addEventListener('offline', updateNetwork);
updateNetwork();
void loadMakes(); void checkHealth();

let installPrompt = null;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('installBtn').hidden = false; });
$('installBtn').addEventListener('click', async () => {
  if (!installPrompt) return;
  try { await installPrompt.prompt(); await installPrompt.userChoice; } catch { /* Installation is optional. */ } finally { installPrompt = null; $('installBtn').hidden = true; }
});
window.addEventListener('appinstalled', () => { installPrompt = null; $('installBtn').hidden = true; });
if ('serviceWorker' in navigator) window.addEventListener('load', async () => {
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache:'none' });
    const offer = () => { if (registration.waiting) $('updateApp').hidden = false; };
    offer();
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', offer));
    $('updateApp').addEventListener('click', () => {
      if (state.busy || !registration.waiting) return;
      cancelRun();
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once:true });
      registration.waiting.postMessage({ type:'ACTIVATE_UPDATE' });
    });
  } catch { /* PWA availability must not block analysis. */ }
});
