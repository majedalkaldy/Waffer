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
  'sw.js',
  'manifest.webmanifest',
  'robots.txt',
  'docs/FIELD_TEST.md'
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
  const matcher = read('parts-match.js');

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

  const runtime = read('lib/runtime-config.js');
  if (!runtime.includes("engineVersion: 'mvp-2026-09'")) failures.push('Unexpected engine version');
  if (!runtime.includes('maxUploadBytes')) failures.push('Runtime upload limit missing');

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

    const robots = read('robots.txt');
    const indexHtml = read('index.html');
    if (RUNTIME_CONFIG.launchPhase === 'field-test') {
      if (!robots.includes('Disallow: /')) failures.push('Field-test phase must block robots indexing');
      if (!/name="robots"\s+content="noindex,nofollow"/i.test(indexHtml)) failures.push('Field-test phase must include noindex,nofollow');
    }
    if (!(RUNTIME_CONFIG.maxUploadBytes > 0)) failures.push('Runtime upload limit must be positive');
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
  if (!sw.includes('/lib/i18n.js') || !sw.includes('/lib/runtime-config.js')) {
    failures.push('PWA shell missing localization/runtime modules');
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
