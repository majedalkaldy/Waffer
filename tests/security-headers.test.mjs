import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const rule=config.headers?.find(item=>item.source==='/(.*)');
const headers=new Map((rule?.headers||[]).map(item=>[item.key,item.value]));

test('security headers apply to all routes',()=>{
  assert.ok(rule);
  for(const key of [
    'Content-Security-Policy',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy'
  ]){
    assert.ok(headers.has(key),key);
  }
});

test('CSP blocks framing and plugins and limits network connections to same origin',()=>{
  const csp=headers.get('Content-Security-Policy')||'';
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("connect-src 'self'"));
  assert.ok(csp.includes("base-uri 'self'"));
  assert.ok(csp.includes("form-action 'self'"));
  const connectDirective=csp
    .split(';')
    .map(part=>part.trim())
    .find(part=>part.startsWith('connect-src'))||'';
  assert.equal(connectDirective.includes('*'),false);
});

test('CSP preserves current image compression and catalog image requirements',()=>{
  const csp=headers.get('Content-Security-Policy')||'';
  assert.ok(csp.includes("img-src 'self' data: blob: https:"));
  assert.ok(csp.includes("worker-src 'self' blob:"));
  assert.ok(csp.includes("manifest-src 'self'"));
});

test('scripts and styles require same-origin files without inline exceptions',()=>{
  const csp=headers.get('Content-Security-Policy')||'';
  const scriptDirective=csp
    .split(';')
    .map(part=>part.trim())
    .find(part=>part.startsWith('script-src'))||'';
  assert.equal(scriptDirective,"script-src 'self'");
  assert.equal(scriptDirective.includes("'unsafe-inline'"),false);
  assert.equal(csp.includes("'unsafe-eval'"),false);
  const styleDirective=csp
    .split(';')
    .map(part=>part.trim())
    .find(part=>part.startsWith('style-src'))||'';
  assert.equal(styleDirective,"style-src 'self'");
  assert.equal(styleDirective.includes("'unsafe-inline'"),false);
});

test('browser metadata headers use restrictive values',()=>{
  assert.equal(headers.get('X-Frame-Options'),'DENY');
  assert.equal(headers.get('X-Content-Type-Options'),'nosniff');
  assert.equal(headers.get('Referrer-Policy'),'strict-origin-when-cross-origin');
  assert.equal(
    headers.get('Permissions-Policy'),
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  assert.equal(headers.get('X-DNS-Prefetch-Control'),'off');
  assert.equal(headers.get('X-Permitted-Cross-Domain-Policies'),'none');
});
