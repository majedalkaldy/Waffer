import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const appModule=fs.readFileSync(new URL('../app-module.js',import.meta.url),'utf8');
const pricingClient=fs.readFileSync(new URL('../lib/pricing-client.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('HTML contains no inline JavaScript or inline event handlers',()=>{
  const inlineScripts=[...index.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match=>!/\bsrc\s*=/.test(match[1]||''));
  assert.equal(inlineScripts.length,0);
  assert.equal(/\son[a-z]+\s*=\s*["']/i.test(index),false);
});

test('external client scripts load in the preserved order',()=>{
  const appIndex=index.indexOf('<script src="/app.js"></script>');
  const moduleIndex=index.indexOf('<script type="module" src="/app-module.js"></script>');
  const vinIndex=index.indexOf('<script src="/vin-ui.js"></script>');
  const matcherIndex=index.indexOf('<script src="/parts-match.js"></script>');
  assert.ok(appIndex>0);
  assert.ok(moduleIndex>appIndex);
  assert.ok(vinIndex>moduleIndex);
  assert.ok(matcherIndex>vinIndex);
});

test('all former inline actions are bound from app.js',()=>{
  for(const id of [
    'analyzeBtn','debugExportBtn','detailsBtn','workshopBtn',
    'shareSummaryBtn','workshopFollowupBtn','backBtn',
    'newAnalysisBtn','copyMessageBtn','resultBackBtn'
  ]){
    assert.ok(app.includes(id+':'),id);
    assert.ok(index.includes('id="'+id+'"'),id);
  }
  assert.ok(app.includes("addEventListener('click', handler)"));
});

test('latest trusted-pricing UI logic survives externalization',()=>{
  assert.ok(app.includes('async function refreshVerifiedPricing'));
  assert.ok(app.includes('window.wafferVerifiedMarketPricing'));
  assert.ok(app.includes("fetch('/api/price-compare'"));
  assert.ok(app.includes('window.wafferSummarizeVerifiedPricing'));
  assert.ok(pricingClient.includes("data?.saving?.status === 'CALCULATED_FROM_VERIFIED_OFFER'"));
});

test('module bootstrap remains same-origin and PWA caches both client scripts',()=>{
  assert.ok(appModule.includes("from '/lib/i18n.js'"));
  assert.ok(appModule.includes("from '/lib/runtime-config.js'"));
  assert.equal(/https?:\/\//.test(appModule),false);
  assert.ok(sw.includes("'/app.js'"));
  assert.ok(sw.includes("'/app-module.js'"));
  assert.ok(sw.includes("'/lib/pricing-client.js'"));
});
