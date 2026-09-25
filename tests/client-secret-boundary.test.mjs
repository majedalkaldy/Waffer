import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CLIENT_FILES = [
  'index.html',
  'app.js',
  'app-module.js',
  'vin-ui.js',
  'parts-match.js',
  'sw.js',
  'styles.css',
  'manifest.webmanifest',
  'lib/i18n.js',
  'lib/runtime-config.js',
  'lib/identity.js',
  'lib/total-check.js',
  'lib/image-optimization.js',
  'lib/pricing-client.js',
  'lib/field-test-client.js',
  'lib/field-test-fixtures.js',
  'lib/field-test-evidence-validator.js'
];

const FORBIDDEN_CLIENT_TOKENS = [
  'OPENAI_API_KEY',
  'AUTOPARTS_API_KEY',
  'x-apiprofile-key',
  'api.openai.com',
  'auto-parts-catalog.apiprofile.com',
  'process.env.OPENAI',
  'process.env.AUTOPARTS'
];

function readClientFile(path) {
  const url = new URL('../' + path, import.meta.url);
  assert.equal(fs.existsSync(url), true, 'Missing client boundary file: ' + path);
  return fs.readFileSync(url, 'utf8');
}

test('browser-delivered assets never contain server secret names or direct upstream endpoints', () => {
  for (const path of CLIENT_FILES) {
    const source = readClientFile(path);
    for (const token of FORBIDDEN_CLIENT_TOKENS) {
      assert.equal(
        source.includes(token),
        false,
        path + ' exposes forbidden client token: ' + token
      );
    }
  }
});

test('browser-delivered JavaScript uses Waffer same-origin APIs instead of trusted upstreams', () => {
  const javascriptFiles = CLIENT_FILES.filter(path => /\.js$/.test(path));
  const directExternalFetch = /fetch\(\s*['"]https?:\/\//i;

  for (const path of javascriptFiles) {
    const source = readClientFile(path);
    assert.equal(
      directExternalFetch.test(source),
      false,
      path + ' contains a direct external fetch; route trusted upstreams through Waffer APIs'
    );
  }
});

test('client runtime does not reference process.env or server-only authorization headers', () => {
  for (const path of CLIENT_FILES.filter(path => /\.js$/.test(path))) {
    const source = readClientFile(path);
    assert.equal(/\bprocess\.env\b/.test(source), false, path + ' references process.env');
    assert.equal(
      /['"]Authorization['"]\s*:/i.test(source),
      false,
      path + ' sets an Authorization header in browser code'
    );
  }
});
