import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html',
  'parts-match.js',
  'vin-ui.js',
  'api/analyze.js',
  'api/vehicles.js',
  'api/products.js',
  'api/articles.js',
  'api/article-criteria.js',
  'api/vin.js',
  'api/price-compare.js',
  'api/health.js',
  'api/self-test.js',
  'lib/market-config.js',
  'lib/runtime-config.js',
  'lib/analysis-normalizer.js',
  'lib/upload-validation.js',
  'lib/i18n.js',
  'lib/identity.js',
  'sw.js',
  'manifest.webmanifest',
  'robots.txt',
  'docs/FIELD_TEST.md',
  'package.json',
  '.github/workflows/ci.yml',
  'tests/api-timeouts.test.mjs',
  'tests/analyze-cleanup.test.mjs',
  'tests/identity-contract.test.mjs',
  'tests/catalog-shortlist.test.mjs',
  'tests/pipeline-contract.test.mjs',
  'tests/launch-gate.test.mjs',
  'tests/runtime-localization.test.mjs',
  'lib/launch-readiness.js',
  'scripts/check-launch-gate.mjs',
  'docs/FIELD_TEST_RESULTS.json',
  'docs/FIELD_TEST_AUTOMATION.json',
  'docs/LAUNCH_READINESS.md',
  'lib/total-check.js',
  'tests/field-scenarios-synthetic.test.mjs',
  'lib/image-optimization.js',
  'tests/image-optimization.test.mjs',
  'lib/analysis-prompt.js',
  'tests/analysis-prompt.test.mjs',
  'tests/normalizer-locale.test.mjs',
  'tests/price-localization.test.mjs',
  'lib/analysis-abuse-guard.js',
  'tests/analysis-abuse-guard.test.mjs',
  'tests/analyze-guard-integration.test.mjs',
  'lib/catalog-abuse-guard.js',
  'tests/catalog-abuse-guard.test.mjs',
  'tests/catalog-guard-integration.test.mjs',
  'tests/catalog-failure-propagation.test.mjs',
  'tests/runtime-resilience.test.mjs',
  'lib/catalog-health-probe.js',
  'tests/catalog-health-probe.test.mjs',
  'tests/manufacturers-cdn-cache.test.mjs',
  'tests/catalog-data-cdn-cache.test.mjs',
  'lib/price-provider.js',
  'tests/price-provider-contract.test.mjs',
  'docs/PRICE_PROVIDER_CONTRACT.md',
  'docs/VERCEL_FIREWALL_PLAN.md'
];

const failures = [];
const read = path => fs.readFileSync(path, 'utf8');

for (const path of required) {
  if (!fs.existsSync(path)) failures.push(`Missing required file: ${path}`);
}

if (!failures.length) {
  const jsFiles = required.filter(file => /\.js$|\.mjs$/.test(file));
  for (const file of jsFiles) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
      failures.push(`JavaScript syntax error in ${file}: ${String(error.stderr || error.message).trim()}`);
    }
  }

  const index = read('index.html');

  const inlineScripts = [...index.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/.test(match[1] || ''));
  for (const [scriptIndex, match] of inlineScripts.entries()) {
    const attrs = match[1] || '';
    const source = match[2] || '';
    try {
      if (/type\s*=\s*["']module["']/i.test(attrs)) {
        const temp = path.join(os.tmpdir(), `waffer-inline-${scriptIndex}.mjs`);
        fs.writeFileSync(temp, source);
        execFileSync(process.execPath, ['--check', temp], { stdio: 'pipe' });
        fs.unlinkSync(temp);
      } else {
        new vm.Script(source);
      }
    } catch (error) {
      failures.push(`Inline script syntax error #${scriptIndex + 1}: ${String(error.stderr || error.message).trim()}`);
    }
  }
  const ids = [...index.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const idCounts = new Map();
  for (const id of ids) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  for (const [id, count] of idCounts) {
    if (count > 1) failures.push(`Duplicate DOM id: ${id}`);
  }

  const refs = [...index.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
  for (const ref of new Set(refs)) {
    if (!idCounts.has(ref)) failures.push(`Missing DOM element referenced by JS: ${ref}`);
  }

  const handlers = [...index.matchAll(/\bonclick="([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
  for (const name of new Set(handlers)) {
    const fn = new RegExp(`function\\s+${name}\\s*\\(`);
    const variable = new RegExp(`(?:const|let|var)\\s+${name}\\s*=`);
    if (!fn.test(index) && !variable.test(index)) failures.push(`Undefined onclick handler: ${name}`);
  }

  const analyze = read('api/analyze.js');
  const abuseGuard = read('lib/analysis-abuse-guard.js');
  const catalogAbuseGuard = read('lib/catalog-abuse-guard.js');
  const matcher = read('parts-match.js');
  const vinUi = read('vin-ui.js');
  const vehiclesApi = read('api/vehicles.js');
  const productsApi = read('api/products.js');
  const articlesApi = read('api/articles.js');
  const criteriaApi = read('api/article-criteria.js');
  const vinApi = read('api/vin.js');
  const health = read('api/health.js');
  const identity = read('lib/identity.js');
  const priceProvider = read('lib/price-provider.js');
  const priceCompare = read('api/price-compare.js');

  if (!identity.includes('hasUsablePartNumber') || !identity.includes('hasUsableVehicleIdentity')) {
    failures.push('Shared identity verification helpers are missing');
  }
  if (!analyze.includes("from '../lib/analysis-normalizer.js'")) {
    failures.push('Analysis API normalizer import is missing');
  }
  const normalizer = read('lib/analysis-normalizer.js');
  if (!normalizer.includes("from './identity.js'") ||
      !priceCompare.includes("from '../lib/identity.js'")) {
    failures.push('Identity rules are not shared by analysis and price comparison');
  }
  if (/Boolean\(String\(partNumber/.test(priceCompare) ||
      /Boolean\(vehicle\.vehicleId \|\| vehicle\.vin\)/.test(priceCompare)) {
    failures.push('Price comparison still accepts unverified identity placeholders');
  }
  if (!priceCompare.includes("requestedLocale.toLowerCase().startsWith('en')") ||
      !priceCompare.includes('Market price and savings were not calculated') ||
      !priceCompare.includes('لم يتم احتساب سعر السوق أو التوفير')) {
    failures.push('Price comparison human-readable localization contract is incomplete');
  }
  if (!priceCompare.includes("code: 'PART_IDENTITY_REQUIRED'") ||
      !priceCompare.includes("workshopPrice: priceValid ? 'VALID' : 'INVALID_OR_MISSING'") ||
      !priceCompare.includes("quantity: quantityValid ? 'VALID' : 'DEFAULTED_TO_1'")) {
    failures.push('Price comparison input validation contract is incomplete');
  }
  if (!priceCompare.includes('Number.isFinite(rawPrice) && rawPrice >= 0') ||
      !priceCompare.includes('Number.isFinite(rawQuantity) && rawQuantity > 0')) {
    failures.push('Price comparison numeric validation is incomplete');
  }
  if (!priceCompare.includes("from '../lib/price-provider.js'") ||
      !priceCompare.includes('lookupVerifiedPricing({') ||
      !priceCompare.includes('calculateVerifiedOfferSaving({')) {
    failures.push('Price comparison is not wired to the trusted price-provider contract');
  }
  if (!priceProvider.includes('normalizeVerifiedMarketRange') ||
      !priceProvider.includes('normalizeVerifiedOffer') ||
      !priceProvider.includes("'CALCULATED_FROM_VERIFIED_OFFER'")) {
    failures.push('Trusted price-provider validation contract is incomplete');
  }

  if (!analyze.includes("from '../lib/analysis-abuse-guard.js'") ||
      !analyze.includes('checkAnalysisRequestProvenance(req)') ||
      !analyze.includes('checkAnalysisRequestLimit(req, RUNTIME_CONFIG)') ||
      !analyze.includes("code: 'ANALYSIS_CLIENT_RATE_LIMITED'")) {
    failures.push('Analysis abuse guard is not fully wired before paid upstream work');
  }
  if (!abuseGuard.includes("headerValue(req?.headers, 'x-forwarded-for')") ||
      !abuseGuard.includes("createHash('sha256')") ||
      !abuseGuard.includes("fetchSite === 'cross-site'")) {
    failures.push('Analysis abuse guard must use Vercel client IP hashing and cross-site protection');
  }
  const guardIndex = analyze.indexOf('checkAnalysisRequestLimit(req, RUNTIME_CONFIG)');
  const validationIndex = analyze.indexOf('if (!uploadValidation.ok)');
  const openAiIndex = analyze.indexOf("fetch('https://api.openai.com/v1/");
  if (!(guardIndex > validationIndex && openAiIndex > guardIndex)) {
    failures.push('Analysis rate guard must run after basic validation and before OpenAI');
  }
  if (!index.includes('ANALYSIS_CLIENT_RATE_LIMITED') ||
      !index.includes('ANALYSIS_CROSS_SITE_BLOCKED')) {
    failures.push('Client UI is missing abuse-guard error messages');
  }

  if (!catalogAbuseGuard.includes("code:'CATALOG_CLIENT_RATE_LIMITED'") ||
      !catalogAbuseGuard.includes("fetchSite === 'cross-site'") ||
      !catalogAbuseGuard.includes("update('waffer-catalog|' + ip)")) {
    failures.push('Catalog abuse guard contract is incomplete');
  }
  for (const [source,label] of [
    [vehiclesApi,'api/vehicles.js'],
    [productsApi,'api/products.js'],
    [articlesApi,'api/articles.js'],
    [criteriaApi,'api/article-criteria.js'],
    [vinApi,'api/vin.js']
  ]) {
    if (!source.includes("from '../lib/catalog-abuse-guard.js'") ||
        !source.includes('enforceCatalogRequestGuard(req, res, RUNTIME_CONFIG)')) {
      failures.push(label + ' is missing the catalog abuse guard');
    }
  }
  if (!matcher.includes("data?.code || 'CATALOG_UPSTREAM_ERROR'") ||
      !matcher.includes("error?.code === 'CATALOG_CLIENT_RATE_LIMITED'")) {
    failures.push('Parts matcher must preserve catalog rate-limit state');
  }
  if (!vinUi.includes("result?.code === 'CATALOG_CLIENT_RATE_LIMITED'")) {
    failures.push('VIN UI must show explicit catalog rate-limit feedback');
  }
  if (!index.includes("matchError?.code==='CATALOG_CLIENT_RATE_LIMITED'")) {
    failures.push('Result UI must show explicit catalog rate-limit feedback');
  }

  if (vinUi.includes('vehicles[0]')) {
    failures.push('VIN resolver must not silently choose the first vehicle variant');
  }
  if (!index.includes('id="vehicleCandidates"') || !index.includes('id="candidateSelect"')) {
    failures.push('VIN ambiguity UI is missing');
  }
  if (!index.includes('vehicleData?.ambiguous')) {
    failures.push('Analysis flow must stop until an ambiguous VIN variant is selected');
  }
  if (!index.includes("year=String(document.getElementById('year').value||'').trim();")) {
    failures.push('Analysis must refresh model year after VIN resolution');
  }
  if (!index.includes("makeId:document.getElementById('make').value") ||
      !index.includes("make:document.getElementById('make').selectedOptions?.[0]?.text||''") ||
      !index.includes("vehicleId:window.wafferVehicleId||null")) {
    failures.push('Analysis vehicle context must include make ID, display name, and resolved vehicle ID');
  }


  for (const file of required.filter(path => /\.js$|\.mjs$/.test(path))) {
    const source = read(file);
    if (/\|\|\s*[A-Za-z_$][\w$]*\(\)\s*\?/.test(source)) {
      failures.push(`Ambiguous || / ternary precedence found in ${file}; add parentheses explicitly`);
    }
  }

  const marketSensitiveFiles = [
    'parts-match.js',
    'api/vehicles.js',
    'api/products.js',
    'api/articles.js',
    'api/article-criteria.js',
    'api/health.js'
  ];
  for (const file of marketSensitiveFiles) {
    const text = read(file);
    if (/countryFilterId\s*[:=]\s*63/.test(text)) failures.push(`Hard-coded countryFilterId remains in ${file}`);
    if (/type-id\/1(?:['"`]|\/)/.test(text)) failures.push(`Hard-coded vehicle type ID remains in ${file}`);
  }
  if (/item\?\.category|item\.category/.test(analyze)) failures.push('Legacy category field remains in analyze API');
  if (/item\?\.category|item\.category/.test(matcher)) failures.push('Legacy category field remains in parts matcher');

  const allText = required.map(path => read(path)).join('\n');
  if (/sk-[A-Za-z0-9_-]{10,}/.test(allText)) failures.push('Possible hard-coded OpenAI secret');
  if (/x-apiprofile-key\s*:\s*['"][^'"]+['"]/.test(allText)) failures.push('Possible hard-coded catalog secret');

  const apiContracts = {
    'api/analyze.js': 'POST',
    'api/price-compare.js': 'POST',
    'api/vehicles.js': 'GET',
    'api/products.js': 'GET',
    'api/articles.js': 'GET',
    'api/article-criteria.js': 'GET',
    'api/vin.js': 'GET',
    'api/health.js': 'GET',
    'api/self-test.js': 'GET'
  };
  for (const [path, method] of Object.entries(apiContracts)) {
    const text = read(path);
    if (!text.includes(`res.setHeader('Allow', '${method}')`)) failures.push(`${path} missing Allow: ${method}`);
    if (!text.includes("Cache-Control', 'no-store")) failures.push(`${path} missing no-store`);
    if (!text.includes("X-Content-Type-Options', 'nosniff")) failures.push(`${path} missing nosniff`);
  }

  const packageJson = JSON.parse(read('package.json'));
  const ciWorkflow = read('.github/workflows/ci.yml');
  if (packageJson?.scripts?.test !== 'node --test tests/*.test.mjs') {
    failures.push('package.json test script does not run regression tests');
  }
  if (packageJson?.scripts?.gate !== 'node scripts/check-launch-gate.mjs') {
    failures.push('package.json gate script is missing or unexpected');
  }
  if (packageJson?.scripts?.ci !== 'npm run check && npm test && npm run gate') {
    failures.push('package.json ci script must run static checks, tests, and launch gate');
  }
  if (!ciWorkflow.includes('run: npm run ci')) {
    failures.push('GitHub Actions CI does not run npm run ci');
  }
  if (!ciWorkflow.includes('contents: read')) {
    failures.push('GitHub Actions CI permissions are not explicitly read-only');
  }
  const pipelineTest = read('tests/pipeline-contract.test.mjs');
  for (const requiredSignal of [
    "assert.equal(analysis.acceptance.schemaValid, true)",
    "assert.equal(matches[0].requestedAxle, 'front')",
    "assert.equal(matches[1].skipped, true)",
    "assert.equal(priceRes.body.saving.status, 'NOT_CALCULATED')"
  ]) {
    if (!pipelineTest.includes(requiredSignal)) {
      failures.push('Pipeline contract test is missing critical assertion: ' + requiredSignal);
    }
  }

  const automationCoverage = JSON.parse(read('docs/FIELD_TEST_AUTOMATION.json'));
  if (!Array.isArray(automationCoverage?.scenarios) || automationCoverage.scenarios.length !== 10) {
    failures.push('Automated field-test coverage tracker must contain exactly ten scenarios');
  } else {
    const allowedCoverage = new Set(['COVERED','PARTIAL','NOT_AUTOMATED']);
    const coverageIds = automationCoverage.scenarios.map(item => Number(item?.id));
    if (new Set(coverageIds).size !== 10 || ![1,2,3,4,5,6,7,8,9,10].every(id => coverageIds.includes(id))) {
      failures.push('Automated field-test coverage tracker must contain unique scenario ids 1..10');
    }
    for (const scenario of automationCoverage.scenarios) {
      if (!allowedCoverage.has(String(scenario?.coverage || ''))) {
        failures.push('Invalid automated field-test coverage for scenario ' + scenario?.id);
      }
    }
  }

  const priceProviderDoc = read('docs/PRICE_PROVIDER_CONTRACT.md');
  for (const requiredPricingBoundary of ['Market Range','Verified Offer','NOT_CALCULATED','finalUnitPrice']) {
    if (!priceProviderDoc.includes(requiredPricingBoundary)) {
      failures.push('Price provider contract document is missing boundary: ' + requiredPricingBoundary);
    }
  }

  const readinessDoc = read('docs/LAUNCH_READINESS.md');
  for (const requiredBoundary of [
    'الاختبار الميداني الحقيقي',
    'CONTRACT READY / PROVIDER MISSING',
    'IMPLEMENTED IN CODE',
    'WAF MONITORING ACTIVE',
    'READ ACCESS RESTORED / WAF WRITE TOOL UNAVAILABLE',
    'GitHub Rulesets = []'
  ]) {
    if (!readinessDoc.includes(requiredBoundary)) {
      failures.push('Launch readiness document is missing boundary: ' + requiredBoundary);
    }
  }

  const launchResults = JSON.parse(read('docs/FIELD_TEST_RESULTS.json'));
  if (!Array.isArray(launchResults?.scenarios) || launchResults.scenarios.length !== 10) {
    failures.push('Field-test results tracker must contain exactly ten scenarios');
  }
  const launchIds = (launchResults?.scenarios || []).map(item => Number(item?.id));
  if (new Set(launchIds).size !== 10 || ![1,2,3,4,5,6,7,8,9,10].every(id => launchIds.includes(id))) {
    failures.push('Field-test results tracker must contain unique scenario ids 1..10');
  }
  const launchStatuses = new Set(['PENDING','PASS','FAIL']);
  for (const scenario of launchResults?.scenarios || []) {
    if (!launchStatuses.has(String(scenario?.status || '').toUpperCase())) {
      failures.push('Invalid field-test status for scenario ' + scenario?.id);
    }
  }

  if (!index.includes("function ui(ar,en){return window.wafferLocale?.startsWith('en')?en:ar;}")) {
    failures.push('Core bilingual runtime helper is missing');
  }
  for (const legacyRuntimeText of [
    "setStage('قراءة بيانات السيارة والملف')",
    "typeSummary.textContent='التصنيف:",
    "decision.textContent='ملخص قبل الموافقة:"
  ]) {
    if (index.includes(legacyRuntimeText)) {
      failures.push('Unlocalized core runtime text remains: ' + legacyRuntimeText);
    }
  }

  const imagePolicy = read('lib/image-optimization.js');
  if (!imagePolicy.includes('export function fitWithinMaxDimension') ||
      !imagePolicy.includes('export function shouldOptimizeImage') ||
      !imagePolicy.includes('JPEG_QUALITY_LADDER')) {
    failures.push('Shared image optimization policy is incomplete');
  }
  if (!index.includes('window.wafferFitImageWithinMaxDimension=fitWithinMaxDimension') ||
      !index.includes('window.wafferShouldOptimizeImage=shouldOptimizeImage')) {
    failures.push('Browser upload flow is not wired to shared image optimization policy');
  }

  const totalCheckModule = read('lib/total-check.js');
  if (!totalCheckModule.includes('export function compareDisplayedTotals')) {
    failures.push('Shared displayed-total comparison helper is missing');
  }
  if (!index.includes("window.wafferCompareDisplayedTotals=compareDisplayedTotals")) {
    failures.push('UI does not expose the shared total comparison helper');
  }
  if (index.includes("printed.match(/[\\d,.]+/)")) {
    failures.push('Legacy inline total parsing remains in the UI');
  }

  const runtime = read('lib/runtime-config.js');
  if (!runtime.includes("engineVersion: 'mvp-2026-09'")) failures.push('Unexpected engine version');
  if (!runtime.includes('maxUploadBytes')) failures.push('Runtime upload limit missing');
  if (!runtime.includes('clientAnalysisTimeoutMs')) failures.push('Client analysis timeout is missing');
  if (!runtime.includes('clientAnalysisSafetyMarginMs')) failures.push('Client analysis safety margin is missing');
  if (!runtime.includes('analysisRateLimitBurstWindowMs') ||
      !runtime.includes('analysisRateLimitBurstMax') ||
      !runtime.includes('analysisRateLimitHourlyWindowMs') ||
      !runtime.includes('analysisRateLimitHourlyMax')) {
    failures.push('Analysis rate-limit configuration is missing');
  }
  if (!runtime.includes('catalogRateLimitBurstWindowMs') ||
      !runtime.includes('catalogRateLimitBurstMax') ||
      !runtime.includes('catalogRateLimitHourlyWindowMs') ||
      !runtime.includes('catalogRateLimitHourlyMax')) {
    failures.push('Catalog rate-limit configuration is missing');
  }
  if (!runtime.includes('pdfCleanupTimeoutMs')) failures.push('PDF cleanup timeout is missing');
  if (!runtime.includes('clientManufacturersTimeoutMs')) failures.push('Client manufacturers timeout is missing');
  if (!runtime.includes('manufacturersCdnCacheSeconds') ||
      !runtime.includes('manufacturersCdnStaleSeconds')) {
    failures.push('Manufacturer CDN cache configuration is missing');
  }
  if (!runtime.includes('clientVinTimeoutMs')) failures.push('Client VIN timeout is missing');
  if (!runtime.includes('healthCatalogCacheMs')) failures.push('Catalog health cache duration is missing');
  if (!runtime.includes('catalogDataCdnCacheSeconds') ||
      !runtime.includes('catalogDataCdnStaleSeconds') ||
      !runtime.includes('catalogCriteriaCdnCacheSeconds') ||
      !runtime.includes('catalogCriteriaCdnStaleSeconds')) {
    failures.push('Catalog CDN cache policy is missing');
  }

  const catalogBodyTimeoutChecks = [
    [productsApi, 'data = await response.json()', 'clearTimeout(timer)', 'api/products.js'],
    [articlesApi, 'data = await response.json()', 'clearTimeout(timer)', 'api/articles.js'],
    [criteriaApi, 'text = await response.text()', 'clearTimeout(timer)', 'api/article-criteria.js'],
    [vinApi, 'text = await response.text()', 'clearTimeout(timer)', 'api/vin.js']
  ];
  for (const [source, bodyRead, clearTimer, label] of catalogBodyTimeoutChecks) {
    const bodyIndex = source.indexOf(bodyRead);
    const clearIndex = source.indexOf(clearTimer);
    if (!(bodyIndex >= 0 && clearIndex > bodyIndex)) {
      failures.push(label + ' timeout does not cover response body consumption');
    }
  }
  if (!productsApi.includes("code: 'CATALOG_TIMEOUT'") ||
      !articlesApi.includes("code: 'CATALOG_TIMEOUT'") ||
      !criteriaApi.includes("code: 'CATALOG_TIMEOUT'")) {
    failures.push('Catalog endpoint timeouts are not classified consistently');
  }
  if (!vinApi.includes("code: 'VIN_TIMEOUT'")) {
    failures.push('VIN API timeout is not classified explicitly');
  }
  if (!vinUi.includes('clientVinTimeoutMs') ||
      !vinUi.includes("timeoutError.code = 'VIN_TIMEOUT'") ||
      !vinUi.includes("if (error?.name === 'AbortError') throw error;")) {
    failures.push('VIN client timeout/body-abort handling is incomplete');
  }

  const manufacturersLoaderStart = index.indexOf('async function loadManufacturers(){');
  const manufacturersLoaderEnd = index.indexOf("window.addEventListener('wafferPartsMatched'", manufacturersLoaderStart);
  const manufacturersLoader = manufacturersLoaderStart >= 0 && manufacturersLoaderEnd > manufacturersLoaderStart
    ? index.slice(manufacturersLoaderStart, manufacturersLoaderEnd)
    : '';
  if (!index.includes('id="retryMakes"') || !manufacturersLoader.includes('manufacturersController?.abort()')) {
    failures.push('Manufacturers loader is not recoverable/abortable');
  }
  if (!manufacturersLoader.includes('d=await r.json()') ||
      manufacturersLoader.indexOf('d=await r.json()') > manufacturersLoader.indexOf('clearTimeout(timer)')) {
    failures.push('Client manufacturers timeout does not cover response body consumption');
  }
  if (index.includes('<option>Ford — فورد</option>') || index.includes('<option>Toyota — تويوتا</option>')) {
    failures.push('Static placeholder makes can masquerade as catalog-loaded manufacturers');
  }
  const vehiclesBodyRead = vehiclesApi.indexOf('data = await response.json()');
  const vehiclesTimeoutClear = vehiclesApi.indexOf('clearTimeout(timer)');
  if (!(vehiclesBodyRead >= 0 && vehiclesTimeoutClear > vehiclesBodyRead)) {
    failures.push('Manufacturers API timeout does not cover response body consumption');
  }
  if (!vehiclesApi.includes("code: 'CATALOG_TIMEOUT'")) {
    failures.push('Manufacturers API timeout is not classified explicitly');
  }
  for (const [source,label] of [
    [productsApi,'api/products.js'],
    [articlesApi,'api/articles.js'],
    [criteriaApi,'api/article-criteria.js']
  ]) {
    const cacheHeaderIndex = source.indexOf("'Vercel-CDN-Cache-Control'");
    const upstreamGuardIndex = source.indexOf('if (!response.ok)');
    if (!(cacheHeaderIndex > upstreamGuardIndex)) {
      failures.push(label + ' CDN cache header must only be applied after successful upstream validation');
    }
  }
  if (vinApi.includes("'Vercel-CDN-Cache-Control'")) {
    failures.push('VIN responses must never be stored in the Vercel CDN');
  }
  const manufacturerCacheHeader = vehiclesApi.indexOf("'Vercel-CDN-Cache-Control'");
  const manufacturerUpstreamGuard = vehiclesApi.indexOf('if (!response.ok)');
  if (!(manufacturerCacheHeader > manufacturerUpstreamGuard)) {
    failures.push('Manufacturer CDN cache header must only be applied after successful upstream validation');
  }
  if (index.includes("fetch('/api/vehicles',{cache:'no-store'")) {
    failures.push('Manufacturer client request still bypasses the Vercel CDN cache');
  }

  if (!health.includes("analysis: configured.analysis ? 'configured_not_probed' : 'not_configured'") ||
      !health.includes("analysis: configured.analysis ? 'configuration_only' : 'unavailable'")) {
    failures.push('Health contract does not distinguish configured analysis from live verification');
  }
  if (!health.includes("from '../lib/catalog-health-probe.js'") ||
      !health.includes('probeCatalogHealth({') ||
      !health.includes('catalogCache:')) {
    failures.push('Health endpoint is not using the cached catalog probe contract');
  }
  if (!health.includes('quoteAnalysisVerified: false')) {
    failures.push('Health capabilities overstate analysis verification');
  }
  if (!health.includes("from '../lib/price-provider.js'") ||
      !health.includes('priceProviderInterface: true') ||
      !health.includes('verifiedMarketPricing: configured.pricing')) {
    failures.push('Health does not expose price-provider readiness truthfully');
  }
  const healthFunctionStart = index.indexOf('async function checkSystemHealth(){');
  const healthFunctionEnd = index.indexOf('checkSystemHealth();', healthFunctionStart);
  const healthClient = healthFunctionStart >= 0 && healthFunctionEnd > healthFunctionStart
    ? index.slice(healthFunctionStart, healthFunctionEnd)
    : '';
  if (!healthClient.includes('d=await r.json()') ||
      healthClient.indexOf('d=await r.json()') > healthClient.indexOf('clearTimeout(timer)')) {
    failures.push('Client health timeout does not cover response body consumption');
  }
  if (!healthClient.includes('run!==healthCheckRun') || !healthClient.includes('healthCheckController?.abort()')) {
    failures.push('Client health checks are not protected against stale responses');
  }
  if (!healthClient.includes('Core services ready') || !healthClient.includes('الخدمات الأساسية جاهزة')) {
    failures.push('Health status is not localized for Arabic and English');
  }

  const normalizerSource = read('lib/analysis-normalizer.js');
  if (!normalizerSource.includes("const isEnglish = String(locale || '').toLowerCase().startsWith('en')") ||
      !normalizerSource.includes("partNumber: 'not visible'") ||
      !normalizerSource.includes("partNumber: 'غير ظاهر'")) {
    failures.push('Analysis normalizer locale-aware fallback contract is incomplete');
  }
  if (!index.includes('window.wafferHasUsablePartNumber=hasUsablePartNumber') ||
      index.includes("!/غير ظاهر|غير متوفر/i.test(String(i.partNumber))")) {
    failures.push('Result evidence UI must use shared part-identity rules instead of locale-specific regexes');
  }

  const analysisPrompt = read('lib/analysis-prompt.js');
  if (!analyze.includes("from '../lib/analysis-prompt.js'") ||
      !analyze.includes('buildAnalysisPrompt({')) {
    failures.push('Analysis API is not wired to the shared locale-aware prompt builder');
  }
  if (analyze.includes('استخدم العربية الواضحة والمختصرة') ||
      analyze.includes('رسالة عربية مهذبة')) {
    failures.push('Analysis API still contains a hard-coded Arabic-only output prompt');
  }
  if (!analysisPrompt.includes("locale: 'en-SA'") && !analysisPrompt.includes("startsWith('en')")) {
    failures.push('Analysis prompt builder has no explicit English locale branch');
  }
  if (!analysisPrompt.includes('All human-readable string values in the JSON must be concise English') ||
      !analysisPrompt.includes('جميع القيم النصية المقروءة للمستخدم في JSON يجب أن تكون بالعربية')) {
    failures.push('Analysis prompt builder must enforce output language for both English and Arabic');
  }

  if (analyze.includes('res.locals.openaiFileId')) {
    failures.push('PDF cleanup still depends on response locals instead of one finally path');
  }
  if (!analyze.includes('finally {\n    await cleanupOpenAIFile(openaiFileId')) {
    failures.push('Uploaded PDF cleanup is not guaranteed by handler finally');
  }
  const pdfJsonRead = analyze.indexOf('uj = await up.json()');
  const pdfTimeoutClear = analyze.indexOf('clearTimeout(uploadTimeout)');
  if (!(pdfJsonRead >= 0 && pdfTimeoutClear > pdfJsonRead)) {
    failures.push('PDF upload timeout does not cover response body consumption');
  }
  const analysisJsonRead = analyze.indexOf('data = await rr.json()');
  const analysisTimeoutClear = analyze.indexOf('clearTimeout(timeout)');
  if (!(analysisJsonRead >= 0 && analysisTimeoutClear > analysisJsonRead)) {
    failures.push('Analysis timeout does not cover response body consumption');
  }
  if (!analyze.includes("if (error?.name === 'AbortError') throw error;")) {
    failures.push('Response body timeout aborts are not preserved as timeout errors');
  }
  if (!analyze.includes("code: 'ANALYSIS_UPSTREAM_INVALID'")) {
    failures.push('Malformed upstream/model JSON is not classified explicitly');
  }

  if (!index.includes('signal:analysisController.signal')) {
    failures.push('Analysis request is not abortable from the client');
  }
  if (!index.includes('{signal:catalogController.signal,runId}')) {
    failures.push('Catalog matcher is not bound to the active analysis run');
  }
  if (!index.includes('event.detail?.wafferRunId') || !index.includes('window.wafferAnalysisRunId')) {
    failures.push('Stale catalog event guard is missing');
  }
  if (/Promise\.race\(\[\s*window\.matchWafferParts/.test(index)) {
    failures.push('Catalog timeout still races without cancelling the underlying matcher');
  }
  if (!matcher.includes('fetch(url, { signal: controller.signal })') ||
      !matcher.includes("signal.addEventListener('abort'")) {
    failures.push('Catalog upstream requests are not abortable');
  }
  if (!matcher.includes("(supplier || 'unknown-supplier') + '|' + number")) {
    failures.push('Catalog article dedupe key must include supplier plus part number');
  }
  if (matcher.includes("product.includes('oe')") ||
      matcher.includes("product.includes('original equipment')") ||
      matcher.includes('مرشح OE')) {
    failures.push('Catalog text must not infer OE/OEM quality without explicit provider evidence');
  }
  if (!matcher.includes("return 'بديل كتالوج — يحتاج تحقق';")) {
    failures.push('Catalog quality label must remain neutral without verified quality evidence');
  }
  for (const hardCode of [
    'CATALOG_CLIENT_RATE_LIMITED',
    'CATALOG_CROSS_SITE_BLOCKED',
    'CATALOG_ORIGIN_MISMATCH',
    'CATALOG_ORIGIN_INVALID'
  ]) {
    if (!matcher.includes(hardCode)) {
      failures.push('Catalog matcher is missing hard-block propagation for ' + hardCode);
    }
  }
  if (!matcher.includes('throw error;') ||
      !matcher.includes("status: error?.code === 'CATALOG_TIMEOUT'")) {
    failures.push('Catalog matcher must propagate hard failures after recording state');
  }
  if (!index.includes("matchError?.code==='CATALOG_CLIENT_RATE_LIMITED'") ||
      !index.includes("matchError?.code==='CATALOG_TIMEOUT'") ||
      !index.includes("'CATALOG_ORIGIN_MISMATCH'")) {
    failures.push('Catalog UI does not distinguish rate-limit, timeout, and security-block failures');
  }
  const matcherPrecondition = matcher.match(/if \(!analysis \|\| !vehicleId \|\| !items\.length\) \{([\s\S]*?)\n    \}\n\n    try/);
  if (matcherPrecondition?.[1]?.includes('error?.message')) {
    failures.push('Catalog precondition references an undefined error variable');
  }

  const i18nSource = read('lib/i18n.js');
  const arLocaleStart = i18nSource.indexOf("'ar-SA': {");
  const enLocaleStart = i18nSource.indexOf("'en-SA': {");
  const localeEnd = i18nSource.indexOf('\n  }\n};', enLocaleStart);
  const duplicateLocaleKeys = (block, locale) => {
    const keys = [...block.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*:/gm)].map(match => match[1]);
    const counts = new Map();
    for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
    for (const [key, count] of counts) {
      if (count > 1) failures.push(`Duplicate i18n key "${key}" in ${locale}`);
    }
  };
  if (arLocaleStart < 0 || enLocaleStart < 0 || localeEnd < 0) {
    failures.push('Could not locate localization source blocks for duplicate-key checks');
  } else {
    duplicateLocaleKeys(i18nSource.slice(arLocaleStart, enLocaleStart), 'ar-SA');
    duplicateLocaleKeys(i18nSource.slice(enLocaleStart, localeEnd), 'en-SA');
  }

  try {
    const { UI_STRINGS } = await import('../lib/i18n.js');
    const locales = Object.keys(UI_STRINGS);
    const baseKeys = new Set(Object.keys(UI_STRINGS['ar-SA'] || {}));
    for (const locale of locales) {
      const keys = new Set(Object.keys(UI_STRINGS[locale] || {}));
      for (const key of baseKeys) {
        if (!keys.has(key)) failures.push(`Missing i18n key "${key}" in ${locale}`);
      }
      for (const key of keys) {
        if (!baseKeys.has(key)) failures.push(`Extra i18n key "${key}" in ${locale}`);
      }
    }

    const usedKeys = [...index.matchAll(/\bt\(locale,\s*['"]([^'"]+)['"]\)/g)].map(match => match[1]);
    for (const key of new Set(usedKeys)) {
      if (!baseKeys.has(key)) failures.push(`UI references missing i18n key "${key}"`);
    }
  } catch (error) {
    failures.push('Localization semantic checks failed: ' + error.message);
  }

  try {
    const { RUNTIME_CONFIG } = await import('../lib/runtime-config.js');
    const { getMarketConfig } = await import('../lib/market-config.js');
    const sa = getMarketConfig({ market: 'SA' });
    const saEnglish = getMarketConfig({ market: 'SA', locale: 'en-SA' });
    const tampered = getMarketConfig({ market: 'SA', currency: 'USD', langId: 999, countryFilterId: 999 });
    const unsupported = getMarketConfig({ market: 'ZZ' });

    if (RUNTIME_CONFIG.engineVersion !== 'mvp-2026-09') failures.push('Runtime engine version mismatch');
    if (RUNTIME_CONFIG.launchPhase !== 'field-test') failures.push('Unexpected launch phase');
    if (!(RUNTIME_CONFIG.clientAnalysisSafetyMarginMs >= 10000)) {
      failures.push('Client analysis safety margin must be at least 10 seconds');
    }
    if (!(RUNTIME_CONFIG.clientAnalysisTimeoutMs >=
          RUNTIME_CONFIG.pdfUploadTimeoutMs +
          RUNTIME_CONFIG.analysisTimeoutMs +
          RUNTIME_CONFIG.clientAnalysisSafetyMarginMs)) {
      failures.push('Client analysis timeout must cover PDF upload + analysis + safety margin');
    }
    if (!(RUNTIME_CONFIG.analysisRateLimitBurstWindowMs > 0 &&
          RUNTIME_CONFIG.analysisRateLimitBurstMax > 0 &&
          RUNTIME_CONFIG.analysisRateLimitHourlyWindowMs > RUNTIME_CONFIG.analysisRateLimitBurstWindowMs &&
          RUNTIME_CONFIG.analysisRateLimitHourlyMax >= RUNTIME_CONFIG.analysisRateLimitBurstMax)) {
      failures.push('Analysis rate-limit configuration is invalid');
    }
    if (!(RUNTIME_CONFIG.catalogRateLimitBurstWindowMs > 0 &&
          RUNTIME_CONFIG.catalogRateLimitBurstMax > 0 &&
          RUNTIME_CONFIG.catalogRateLimitHourlyWindowMs > RUNTIME_CONFIG.catalogRateLimitBurstWindowMs &&
          RUNTIME_CONFIG.catalogRateLimitHourlyMax >= RUNTIME_CONFIG.catalogRateLimitBurstMax)) {
      failures.push('Catalog rate-limit configuration is invalid');
    }
    if (!(RUNTIME_CONFIG.pdfCleanupTimeoutMs > 0 && RUNTIME_CONFIG.pdfCleanupTimeoutMs <= 10000)) {
      failures.push('PDF cleanup timeout must be positive and bounded');
    }
    if (!(RUNTIME_CONFIG.clientManufacturersTimeoutMs > RUNTIME_CONFIG.manufacturersTimeoutMs)) {
      failures.push('Client manufacturers timeout must exceed server manufacturers timeout');
    }
    if (!(RUNTIME_CONFIG.manufacturersCdnCacheSeconds > 0 &&
          RUNTIME_CONFIG.manufacturersCdnStaleSeconds >= RUNTIME_CONFIG.manufacturersCdnCacheSeconds)) {
      failures.push('Manufacturer CDN cache configuration is invalid');
    }
    if (!(RUNTIME_CONFIG.clientVinTimeoutMs > RUNTIME_CONFIG.vinTimeoutMs)) {
      failures.push('Client VIN timeout must exceed server VIN timeout');
    }
    if (!(RUNTIME_CONFIG.healthCatalogCacheMs >= RUNTIME_CONFIG.healthCatalogTimeoutMs)) {
      failures.push('Catalog health cache duration must cover at least one probe timeout');
    }
    if (!(RUNTIME_CONFIG.catalogDataCdnCacheSeconds > 0 &&
          RUNTIME_CONFIG.catalogDataCdnStaleSeconds >= RUNTIME_CONFIG.catalogDataCdnCacheSeconds &&
          RUNTIME_CONFIG.catalogCriteriaCdnCacheSeconds >= RUNTIME_CONFIG.catalogDataCdnCacheSeconds &&
          RUNTIME_CONFIG.catalogCriteriaCdnStaleSeconds >= RUNTIME_CONFIG.catalogCriteriaCdnCacheSeconds)) {
      failures.push('Catalog CDN cache policy is invalid');
    }

    const robots = read('robots.txt');
    const indexHtml = read('index.html');
    if (RUNTIME_CONFIG.launchPhase === 'field-test') {
      if (!robots.includes('Disallow: /')) failures.push('Field-test phase must block robots indexing');
      if (!/name="robots"\s+content="noindex,nofollow"/i.test(indexHtml)) failures.push('Field-test phase must include noindex,nofollow');
    }
    if (!(RUNTIME_CONFIG.maxUploadBytes > 0)) failures.push('Runtime upload limit must be positive');
    const estimatedJsonPayload = Math.ceil(RUNTIME_CONFIG.maxUploadBytes * 4 / 3) + 128 * 1024;
    if (!(estimatedJsonPayload < RUNTIME_CONFIG.functionPayloadLimitBytes)) {
      failures.push('Configured binary upload limit can exceed Vercel request payload ceiling after Base64 overhead');
    }
    if (!RUNTIME_CONFIG.supportedMimeTypes.includes('application/pdf')) failures.push('PDF support missing from runtime config');
    if (!(sa.supported && sa.market === 'SA' && sa.currency === 'SAR')) failures.push('Saudi market configuration is invalid');
    if (saEnglish.locale !== 'en-SA') failures.push('Supported Saudi English locale is unavailable');
    if (tampered.currency !== 'SAR' || tampered.catalog.langId !== 4 || tampered.catalog.countryFilterId !== 63) {
      failures.push('Client input can override protected market catalog configuration');
    }
    if (unsupported.supported !== false) failures.push('Unsupported market fallback is not explicit');
  } catch (error) {
    failures.push('Runtime/market semantic checks failed: ' + error.message);
  }

  try {
    const { validateBase64Upload, detectUploadMime } = await import('../lib/upload-validation.js');
    const pdf = Buffer.from('%PDF-1.7\n');
    const jpg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10]);
    const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]);
    const webp = Buffer.concat([Buffer.from('RIFF'),Buffer.from([0,0,0,0]),Buffer.from('WEBP'),Buffer.from([0])]);

    if (detectUploadMime(pdf) !== 'application/pdf') failures.push('PDF signature detection failed');
    if (detectUploadMime(jpg) !== 'image/jpeg') failures.push('JPEG signature detection failed');
    if (detectUploadMime(png) !== 'image/png') failures.push('PNG signature detection failed');
    if (detectUploadMime(webp) !== 'image/webp') failures.push('WEBP signature detection failed');

    const validPdf = validateBase64Upload({
      base64: pdf.toString('base64'),
      claimedMimeType: 'application/pdf',
      maxBytes: 1000
    });
    if (!validPdf.ok) failures.push('Valid PDF upload rejected');

    const mismatch = validateBase64Upload({
      base64: jpg.toString('base64'),
      claimedMimeType: 'image/png',
      maxBytes: 1000
    });
    if (mismatch.code !== 'MIME_SIGNATURE_MISMATCH') failures.push('MIME/signature mismatch was not rejected');

    const tooLarge = validateBase64Upload({
      base64: Buffer.alloc(101, 1).toString('base64'),
      claimedMimeType: 'image/jpeg',
      maxBytes: 100
    });
    if (tooLarge.code !== 'FILE_TOO_LARGE') failures.push('Oversized upload was not rejected before signature validation');
  } catch (error) {
    failures.push('Upload validation tests failed: ' + error.message);
  }

  try {
    const { normalizeAnalysisResult } = await import('../lib/analysis-normalizer.js');
    const base = {
      total: '300 SAR',
      status: 'ok',
      transparency: 90,
      identityConfidence: 90,
      compatibilityConfidence: 90,
      priceConfidence: 90,
      overallConfidence: 90,
      missing: [],
      conflicts: [],
      items: [{ name: 'Brake pad', partNumber: 'TEST-1', itemType: 'part', identityConfidence: 90, price: '300' }]
    };

    const noVin = normalizeAnalysisResult({
      result: base,
      safeVehicle: { vin: 'غير متوفر' },
      market: 'SA',
      locale: 'en-SA',
      currency: 'SAR',
      engineVersion: 'mvp-2026-09',
      requestId: 'test',
      completedAt: '2026-09-22T00:00:00.000Z'
    });
    if (noVin.compatibilityConfidence > 45) failures.push('Compatibility confidence cap without VIN is broken');

    const noPartIdentity = normalizeAnalysisResult({
      result: { ...base, items: [{ name: 'Brake pad', partNumber: 'غير ظاهر', itemType: 'weird', identityConfidence: 99, price: '300' }] },
      safeVehicle: { vin: '1HGCM82633A004352' },
      market: 'SA',
      locale: 'ar-SA',
      currency: 'SAR',
      engineVersion: 'mvp-2026-09',
      requestId: 'test2',
      completedAt: '2026-09-22T00:00:00.000Z'
    });
    if (noPartIdentity.identityConfidence > 40 || noPartIdentity.priceConfidence > 15) {
      failures.push('Confidence caps without visible part numbers are broken');
    }
    if (noPartIdentity.items[0]?.itemType !== 'service') failures.push('Unknown itemType without part identity should not default to part');

    const inferredPart = normalizeAnalysisResult({
      result: { ...base, items: [{ name: 'Brake pad', partNumber: 'ABC-123', itemType: 'weird', identityConfidence: 80, price: '300' }] },
      safeVehicle: { vin: '1HGCM82633A004352' },
      market: 'SA',
      locale: 'ar-SA',
      currency: 'SAR',
      engineVersion: 'mvp-2026-09',
      requestId: 'test-part',
      completedAt: '2026-09-22T00:00:00.000Z'
    });
    if (inferredPart.items[0]?.itemType !== 'part') failures.push('Unknown itemType with visible part number should fall back to part');

    const malformedMixed = normalizeAnalysisResult({
      result: { ...base, items: [{ name: 'Brake pad', partNumber: 'ABC-123', itemType: 'part' }, { price: '50' }] },
      safeVehicle: { vin: '1HGCM82633A004352' },
      market: 'SA',
      locale: 'ar-SA',
      currency: 'SAR',
      engineVersion: 'mvp-2026-09',
      requestId: 'test-malformed',
      completedAt: '2026-09-22T00:00:00.000Z'
    });
    if (malformedMixed.acceptance.schemaValid !== false || !malformedMixed.acceptance.invalidItemIndexes.includes(1)) {
      failures.push('Malformed raw line items are not reported in acceptance metadata');
    }

    const incomplete = normalizeAnalysisResult({
      result: { status: 'x', items: [] },
      safeVehicle: { vin: '' },
      market: 'SA',
      locale: 'ar-SA',
      currency: 'SAR',
      engineVersion: 'mvp-2026-09',
      requestId: 'test3',
      completedAt: '2026-09-22T00:00:00.000Z'
    });
    if (incomplete.acceptance.schemaValid !== false || !incomplete.acceptance.missingShapeFields.includes('total')) {
      failures.push('Missing raw AI contract fields are not detected');
    }
  } catch (error) {
    failures.push('Analysis normalizer tests failed: ' + error.message);
  }

  try {
    const { default: priceCompareHandler } = await import('../api/price-compare.js');
    let statusCode = 200;
    let body = null;
    const headers = {};
    const req = {
      method: 'POST',
      body: {
        partName: 'brake pad',
        partNumber: 'TEST-123',
        workshopPrice: 300,
        quantity: 1,
        market: 'SA',
        locale: 'en-SA',
        currency: 'USD',
        vehicle: { vin: '1HGCM82633A004352' }
      }
    };
    const res = {
      setHeader(name, value) { headers[name] = value; },
      status(code) { statusCode = code; return this; },
      json(value) { body = value; return value; }
    };
    await priceCompareHandler(req, res);
    if (statusCode !== 200) failures.push('price-compare deterministic smoke test did not return 200');
    if (body?.context?.currency !== 'SAR') failures.push('price-compare allowed client currency override');
    if (body?.marketPrice?.min !== null || body?.marketPrice?.median !== null || body?.marketPrice?.max !== null) {
      failures.push('price-compare fabricated market pricing without provider');
    }
    if (body?.saving?.amount !== null || body?.saving?.status !== 'NOT_CALCULATED') {
      failures.push('price-compare calculated savings without trusted price source');
    }
  } catch (error) {
    failures.push('Price comparison trust-boundary test failed: ' + error.message);
  }

  try {
    const { default: selfTestHandler } = await import('../api/self-test.js');
    let statusCode = 200;
    let body = null;
    const headers = {};
    const req = { method: 'GET', query: {} };
    const res = {
      setHeader(name, value) { headers[name] = value; },
      status(code) { statusCode = code; return this; },
      json(value) { body = value; return value; }
    };
    await selfTestHandler(req, res);
    if (statusCode !== 200 || body?.ok !== true) failures.push('api/self-test.js did not pass deterministic smoke test');
    if (headers.Allow !== 'GET') failures.push('api/self-test.js did not expose Allow: GET');
  } catch (error) {
    failures.push('Self-test handler execution failed: ' + error.message);
  }

  const sw = read('sw.js');
  if (!sw.includes("key.startsWith('waffer-shell-') && key !== CACHE_NAME")) {
    failures.push('Service worker must only delete obsolete Waffer shell caches');
  }
  if (sw.includes("keys.filter(key => key !== CACHE_NAME)")) {
    failures.push('Service worker still deletes unrelated origin caches');
  }
  if (sw.includes("cache.addAll(SHELL)).catch(() => undefined)")) {
    failures.push('Service worker must not swallow shell precache failures');
  }
  if (!sw.includes('/lib/i18n.js') ||
      !sw.includes('/lib/runtime-config.js') ||
      !sw.includes('/lib/total-check.js') ||
      !sw.includes('/lib/image-optimization.js') ||
      !sw.includes('/lib/identity.js')) {
    failures.push('PWA shell missing localization/runtime/total-check/image-optimization/identity modules');
  }

  try {
    JSON.parse(read('manifest.webmanifest'));
  } catch {
    failures.push('manifest.webmanifest is invalid JSON');
  }
}

if (failures.length) {
  console.error('Waffer static checks failed:');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('Waffer static checks passed.');
