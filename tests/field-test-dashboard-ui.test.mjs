import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const appModule=fs.readFileSync(new URL('../app-module.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('field-test dashboard is diagnostic-only and exposes all operator controls',()=>{
  assert.match(index,/id="fieldTestDashboard"[^>]*class="[^"]*diagnostic[^"]*field-test-dashboard/);
  for(const id of [
    'fieldTestProgress',
    'fieldTestScenarioSelect',
    'fieldTestPassBtn',
    'fieldTestFailBtn',
    'fieldTestPendingBtn',
    'fieldTestNotes',
    'fieldTestRequirements',
    'fieldTestEvidencePreview',
    'fieldTestCaptureBtn',
    'fieldTestExportBtn',
    'fieldTestClearBtn',
    'fieldTestScenarioList'
  ]){
    assert.ok(index.includes('id="'+id+'"'),id);
  }
});

test('dashboard initializes only in debug mode and reads official metadata without mutating it',()=>{
  assert.ok(app.includes("if(!debugMode||fieldTestDashboardInitialized)return;"));
  assert.ok(app.includes("fetch('/docs/FIELD_TEST_RESULTS.json',{cache:'no-store'})"));
  assert.ok(app.includes("fetch('/docs/FIELD_TEST_AUTOMATION.json',{cache:'no-store'})"));
  assert.ok(app.includes("localStorage.setItem(FIELD_TEST_DRAFT_KEY"));
  assert.equal(app.includes("fetch('/docs/FIELD_TEST_RESULTS.json',{method:'POST'"),false);
  assert.equal(app.includes("fetch('/docs/FIELD_TEST_RESULTS.json',{method:'PUT'"),false);
});

test('module bootstrap exposes field-test helpers and signals readiness',()=>{
  assert.ok(appModule.includes("from '/lib/field-test-client.js'"));
  assert.ok(appModule.includes('window.wafferNormalizeFieldTestDashboard=normalizeFieldTestDashboard'));
  assert.ok(appModule.includes('window.wafferFieldTestScenarioRequirements=fieldTestScenarioRequirements'));
  assert.ok(appModule.includes('window.wafferValidateFieldTestScenarioEvidence=validateFieldTestScenarioEvidence'));
  assert.ok(appModule.includes("new CustomEvent('wafferClientModulesReady')"));
  assert.ok(app.includes("window.addEventListener('wafferClientModulesReady'"));
});

test('PWA caches field-test helper but not mutable result evidence files',()=>{
  assert.ok(sw.includes("'/lib/field-test-client.js'"));
  assert.equal(sw.includes("'/docs/FIELD_TEST_RESULTS.json'"),false);
  assert.equal(sw.includes("'/docs/FIELD_TEST_AUTOMATION.json'"),false);
});


test('dashboard renders scenario-specific evidence requirements safely',()=>{
  assert.ok(app.includes('function renderFieldTestRequirements'));
  assert.ok(app.includes("document.getElementById('fieldTestRequirements')"));
  assert.ok(app.includes('window.wafferFieldTestScenarioRequirements'));
  assert.ok(app.includes('item.textContent=requirement'));
  assert.equal(app.includes('fieldTestRequirements.innerHTML'),false);
});


test('dashboard previews current evidence and blocks invalid non-pending captures',()=>{
  assert.ok(app.includes('function currentFieldTestEvidenceValidation'));
  assert.ok(app.includes('function renderFieldTestEvidencePreview'));
  assert.ok(app.includes("document.getElementById('fieldTestEvidencePreview')"));
  assert.ok(app.includes("input.status!=='PENDING' && preview && !preview.validation.valid"));
  assert.ok(app.includes('Cannot save this status until the evidence is complete.'));
  assert.ok(app.includes("fieldTestNotes')?.addEventListener('input'"));
  assert.ok(app.includes('item.textContent=message.text'));
});

test('PWA caches the live field evidence validator module',()=>{
  assert.ok(sw.includes("'/lib/field-test-evidence-validator.js'"));
});
