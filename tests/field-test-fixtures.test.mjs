import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_TEST_FIXTURE_IDS,
  fieldTestFixtureDefinition,
  buildFieldTestPdfBytes,
  padFieldTestBytes
} from '../lib/field-test-fixtures.js';

test('fixture definitions exist for all ten field-test scenarios',()=>{
  assert.deepEqual(FIELD_TEST_FIXTURE_IDS,[1,2,3,4,5,6,7,8,9,10]);
  for(const id of FIELD_TEST_FIXTURE_IDS){
    const fixture=fieldTestFixtureDefinition(id);
    assert.equal(fixture.id,id);
    assert.ok(['image','pdf'].includes(fixture.kind));
    assert.ok(fixture.fileName);
    assert.ok(fixture.mimeType);
    assert.ok(Array.isArray(fixture.lines) && fixture.lines.length>=3);
  }
  assert.equal(fieldTestFixtureDefinition(99),null);
});

test('fixture safety modes mirror the scenarios that need VIN handling',()=>{
  assert.equal(fieldTestFixtureDefinition(1).vinMode,'clear');
  assert.equal(fieldTestFixtureDefinition(6).vinMode,'invalid');
  for(const id of [5,7,8]){
    assert.equal(fieldTestFixtureDefinition(id).needsLiveVin,true);
  }
  assert.equal(fieldTestFixtureDefinition(2).oversized,true);
  assert.equal(fieldTestFixtureDefinition(4).oversized,true);
});

test('small field-test PDF is structurally complete and readable as ASCII PDF',()=>{
  const bytes=buildFieldTestPdfBytes([
    'WAFFER TEST',
    'Brake Pads BRK-123 SAR 250',
    'TOTAL SAR 250'
  ]);
  const text=new TextDecoder().decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes('/Type /Catalog'));
  assert.ok(text.includes('/Type /Page'));
  assert.ok(text.includes('Brake Pads BRK-123 SAR 250'));
  assert.ok(text.includes('xref'));
  assert.ok(text.includes('startxref'));
  assert.ok(text.endsWith('%%EOF\n'));
  assert.ok(bytes.length<100_000);
});

test('PDF builder escapes parentheses and backslashes in fixture text',()=>{
  const text=new TextDecoder().decode(buildFieldTestPdfBytes(['A (test) \\ path']));
  assert.ok(text.includes('A \\(test\\) \\\\ path'));
});

test('padding helper can make a fixture exceed an upload threshold without changing the PDF signature',()=>{
  const base=buildFieldTestPdfBytes(['oversized']);
  const target=(3*1024*1024)+128*1024;
  const padded=padFieldTestBytes(base,target);
  assert.equal(padded.length,target);
  assert.deepEqual([...padded.slice(0,8)],[...base.slice(0,8)]);
  assert.ok(new TextDecoder().decode(padded.slice(0,8)).startsWith('%PDF-1.'));
});
