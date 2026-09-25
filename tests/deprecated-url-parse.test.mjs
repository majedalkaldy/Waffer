import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TARGETS = [
  'api',
  'lib',
  'scripts',
  'app.js',
  'app-module.js',
  'parts-match.js',
  'vin-ui.js',
  'sw.js'
];

async function collectJavaScriptFiles(target) {
  const absolute = join(ROOT, target);
  const stat = await lstat(absolute);

  if (stat.isFile()) {
    return /\.(?:m?js)$/.test(target) ? [absolute] : [];
  }

  if (!stat.isDirectory()) return [];

  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) =>
    collectJavaScriptFiles(join(target, entry.name))
  ));
  return nested.flat();
}

test('application source does not use deprecated Node url.parse()', async () => {
  const files = (await Promise.all(TARGETS.map(collectJavaScriptFiles))).flat();
  const forbidden = ['url', '.parse', '('].join('');

  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (source.includes(forbidden)) offenders.push(file.replace(ROOT, ''));
  }

  assert.deepEqual(
    offenders,
    [],
    'Deprecated url.parse() usage found in Waffer source: ' + offenders.join(', ')
  );
});
