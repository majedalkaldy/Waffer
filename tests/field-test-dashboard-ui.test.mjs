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
    'fieldTestSessionGuide',
    'fieldTestNextBtn',
    'fieldTestExportReadiness',
    'fieldTestScenarioSelect',
    'fieldTestPassBtn',
    'fieldTestFailBtn',
    'fieldTestPendingBtn',
    'fieldTestNotes',
    'fieldTestRequirements',
    'fieldTestEvidencePreview',
    'fieldTestPreflightBtn',
    'fieldTestPreflightResult',
    'fieldTestFixtureBtn',
    'fieldTestFixtureResult',
    'fieldTestCaptureBtn',
    'fieldTestExportBtn',
    'fieldTestCandidateBtn',
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
  assert.ok(appModule.includes('window.wafferSummarizeFieldTestSession=summarizeFieldTestSession'));
  assert.ok(appModule.includes('window.wafferValidateFieldTestScenarioEvidence=validateFieldTestScenarioEvidence'));
  assert.ok(appModule.includes('window.wafferValidateFieldTestDraft=validateFieldTestDraft'));
  assert.ok(appModule.includes('window.wafferBuildOfficialFieldTestResultsFromDraft=buildOfficialFieldTestResultsFromDraft'));
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

test('browser preflight is cost-free, diagnostic-only, and exported separately',()=>{
  assert.ok(app.includes('async function runFieldTestPreflight()'));
  assert.ok(app.includes("fetch('/api/readiness',{cache:'no-store'})"));
  assert.ok(app.includes("fetch('/index.html',{cache:'no-store'})"));
  assert.ok(app.includes("document.createElement('canvas')"));
  assert.ok(app.includes("navigator.serviceWorker.getRegistration()"));
  assert.ok(app.includes("preflight:fieldTestPreflight"));

  const start=app.indexOf('async function runFieldTestPreflight()');
  const end=app.indexOf('function renderFieldTestPreflight()',start);
  assert.ok(start>=0 && end>start);
  const source=app.slice(start,end);
  for(const paidPath of [
    '/api/analyze',
    '/api/vin',
    '/api/vehicles',
    '/api/products',
    '/api/articles',
    '/api/article-criteria',
    '/api/price-compare'
  ]){
    assert.equal(source.includes(paidPath),false,paidPath);
  }
  assert.ok(app.includes('Preflight only. This does not mark any field-test scenario PASS.'));
});

test('debug fixture generator uses local browser helpers and never calls upstream APIs',()=>{
  assert.ok(app.includes('async function generateFieldTestFixture()'));
  assert.ok(app.includes('window.wafferFieldTestFixtureDefinition'));
  assert.ok(app.includes('window.wafferBuildFieldTestPdfBytes'));
  assert.ok(app.includes("document.createElement('canvas')"));
  assert.ok(app.includes('new DataTransfer()'));

  const start=app.indexOf('async function generateFieldTestFixture()');
  const end=app.indexOf('function renderFieldTestDashboard()',start);
  assert.ok(start>=0 && end>start);
  const source=app.slice(start,end);
  for(const path of ['/api/analyze','/api/vin','/api/vehicles','/api/products','/api/articles','/api/article-criteria','/api/price-compare']){
    assert.equal(source.includes(path),false,path);
  }
});

test('module bootstrap exposes and PWA caches fixture helpers',()=>{
  assert.ok(appModule.includes("from '/lib/field-test-fixtures.js'"));
  assert.ok(appModule.includes('window.wafferFieldTestFixtureDefinition=fieldTestFixtureDefinition'));
  assert.ok(appModule.includes('window.wafferBuildFieldTestPdfBytes=buildFieldTestPdfBytes'));
  assert.ok(sw.includes("'/lib/field-test-fixtures.js'"));
});


test('guided field-test session shows next scenario and validates full draft before export',()=>{
  assert.ok(app.includes('function renderFieldTestSessionGuide()'));
  assert.ok(app.includes('function selectNextFieldTestScenario()'));
  assert.ok(app.includes('window.wafferSummarizeFieldTestSession'));
  assert.ok(app.includes('window.wafferValidateFieldTestDraft'));
  assert.ok(app.includes("fieldTestNextBtn: () => selectNextFieldTestScenario()"));
  assert.ok(app.includes('preflight:fieldTestPreflight'));
  assert.ok(app.includes('validation.promotionCandidate'));
  assert.ok(app.includes('This draft is not ready for promotion yet.'));
  assert.ok(app.includes("if(input.status==='PASS')"));
});

test('guided session export remains draft-only and never writes official results',()=>{
  const start=app.indexOf('function exportFieldTestDraft()');
  const end=app.indexOf('function clearFieldTestDraft()',start);
  assert.ok(start>=0 && end>start);
  const source=app.slice(start,end);
  assert.ok(source.includes('downloadJsonFile'));
  assert.equal(source.includes("fetch('/docs/FIELD_TEST_RESULTS.json'"),false);
  assert.equal(source.includes("method:'POST'"),false);
  assert.equal(source.includes("method:'PUT'"),false);
});


test('browser candidate export is gated by promotionCandidate and remains local-only',()=>{
  assert.ok(app.includes('function exportFieldTestCandidate()'));
  assert.ok(app.includes("candidateButton.disabled=!draftCheck?.validation?.promotionCandidate"));
  assert.ok(app.includes('window.wafferBuildOfficialFieldTestResultsFromDraft'));
  assert.ok(app.includes('Candidate export requires a valid 10/10 PASS draft with complete evidence.'));
  assert.ok(app.includes("fieldTestCandidateBtn: () => exportFieldTestCandidate()"));

  const start=app.indexOf('function exportFieldTestCandidate()');
  const end=app.indexOf('function clearFieldTestDraft()',start);
  assert.ok(start>=0 && end>start);
  const source=app.slice(start,end);
  assert.ok(source.includes('downloadJsonFile'));
  assert.equal(source.includes("fetch('/docs/FIELD_TEST_RESULTS.json'"),false);
  assert.equal(source.includes("method:'POST'"),false);
  assert.equal(source.includes("method:'PUT'"),false);
});
