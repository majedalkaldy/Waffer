import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const appModule=fs.readFileSync(new URL('../app-module.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('HTML contains no inline JavaScript or inline event handlers',()=>{
  const inlineScripts=[...index.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match=>! /\bsrc\s*=/.test(match[1]||''));
  assert.equal(inlineScripts.length,0);
  assert.equal(/\son[a-z]+\s*=\s*["']/i.test(index),false);
});

test('external client scripts load in the expected order',()=>{
  const appIndex=index.indexOf('<script src="/app.js"></script>');
  const moduleIndex=index.indexOf('<script type="module" src="/app-module.js"></script>');
  const vinIndex=index.indexOf('<script src="/vin-ui.js"></script>');
  const matcherIndex=index.indexOf('<script src="/parts-match.js"></script>');

  assert.ok(appIndex>0);
  assert.ok(moduleIndex>appIndex);
  assert.ok(vinIndex>moduleIndex);
  assert.ok(matcherIndex>vinIndex);
});

test('all former onclick actions are bound from app.js',()=>{
  for(const id of [
    'analyzeBtn',
    'debugExportBtn',
    'detailsBtn',
    'workshopBtn',
    'shareSummaryBtn',
    'workshopFollowupBtn',
    'backBtn',
    'newAnalysisBtn',
    'copyMessageBtn',
    'resultBackBtn'
  ]){
    assert.ok(app.includes(id+':'),id);
    assert.ok(index.includes('id="'+id+'"'),id);
  }
  assert.ok(app.includes("addEventListener('click', handler)"));
});

test('module bootstrap remains external and imports same-origin modules',()=>{
  assert.ok(appModule.includes("from '/lib/i18n.js'"));
  assert.ok(appModule.includes("from '/lib/runtime-config.js'"));
  assert.equal(/https?:\/\//.test(appModule),false);
});

test('PWA shell caches both external client scripts',()=>{
  assert.ok(sw.includes("'/app.js'"));
  assert.ok(sw.includes("'/app-module.js'"));
});
