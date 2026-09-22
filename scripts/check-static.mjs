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
  } catch (error) {
    failures.push('Localization semantic checks failed: ' + error.message);
  }

  try {
    const { RUNTIME_CONFIG } = await import('../lib/runtime-config.js');
    const { getMarketConfig } = await import('../lib/market-config.js');
    const sa = getMarketConfig({ market: 'SA' });
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
    if (unsupported.supported !== false) failures.push('Unsupported market fallback is not explicit');
  } catch (error) {
    failures.push('Runtime/market semantic checks failed: ' + error.message);
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
