import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('synthetic browser fixtures and reports are excluded from deployed assets',()=>{
 const ignored=read('.vercelignore').split(/\r?\n/).map(s=>s.trim());
 for(const path of ['tests/','test-results/','playwright-report/'])assert.ok(ignored.includes(path),path+' must not ship');
 for(const path of ['index.html','app.js','app-module.js','lib/price-provider.js','lib/pricing-view.js','lib/price-providers/ebay-runtime-registry.js','api/price-compare.js','sw.js'])assert.doesNotMatch(read(path),/(?:from\s*|import\s*\(|src=)["'][^"']*tests\//);
});
test('CI runs a pinned browser suite without deployment credentials',()=>{
 const pkg=JSON.parse(read('package.json'));const workflow=read('.github/workflows/ci.yml');
 assert.equal(pkg.devDependencies.playwright,'1.62.1');
 assert.equal(pkg.scripts['test:browser'],'node --test tests/browser/*.test.mjs');
 assert.match(workflow,/browser-regression:/);assert.match(workflow,/npm run test:browser/);
 assert.doesNotMatch(workflow,/secrets\.|VERCEL_TOKEN|EBAY_CLIENT_SECRET|OPENAI_API_KEY/);
});
