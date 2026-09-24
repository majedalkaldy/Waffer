import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const appModule=fs.readFileSync(new URL('../app-module.js',import.meta.url),'utf8');
const vin=fs.readFileSync(new URL('../vin-ui.js',import.meta.url),'utf8');
const matcher=fs.readFileSync(new URL('../parts-match.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('HTML uses only external stylesheet and contains no inline styles',()=>{
  assert.ok(index.includes('<link rel="stylesheet" href="/styles.css">'));
  assert.equal(/<style\b/i.test(index),false);
  assert.equal(/\sstyle\s*=\s*["']/i.test(index),false);
});

test('client runtimes do not emit inline style attributes or direct style assignments',()=>{
  for(const [name,source] of Object.entries({app,appModule,vin,matcher})){
    assert.equal(/style\s*=\s*["'`]/i.test(source),false,name);
    assert.equal(/\.style\.[A-Za-z_$][\w$]*\s*=/i.test(source),false,name);
    assert.equal(/setAttribute\(\s*['"]style['"]/i.test(source),false,name);
    assert.equal(/style\.cssText\s*=/i.test(source),false,name);
  }
});

test('external stylesheet contains migrated static and dynamic presentation rules',()=>{
  for(const selector of [
    '.wf-inline-1',
    '.wf-inline-19',
    '.system-status-ok',
    '.system-status-warn',
    '.catalog-alt-card',
    '.catalog-alt-image',
    '.catalog-match-card',
    '.catalog-match-title'
  ]){
    assert.ok(css.includes(selector),selector);
  }
});

test('PWA shell caches the external stylesheet',()=>{
  assert.ok(sw.includes("'/styles.css'"));
});
