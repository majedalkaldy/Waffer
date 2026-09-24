import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'scripts', 'build-field-test-candidate.mjs');
const officialPath = path.join(repoRoot, 'docs', 'FIELD_TEST_RESULTS.json');

function pendingDraft() {
  return {
    format: 'waffer-field-test-draft-v1',
    exportedAt: '2026-09-24T12:00:00.000Z',
    warning: 'Draft evidence only.',
    summary: {
      officialPassed: 0,
      draftPassed: 0,
      draftFailed: 0,
      draftPending: 10
    },
    scenarios: Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      title: 'Draft Scenario ' + (index + 1),
      officialStatus: 'PENDING',
      status: 'PENDING',
      testedAt: null,
      notes: '',
      evidence: null,
      automation: {
        coverage: 'COVERED',
        evidence: [],
        notes: ''
      }
    }))
  };
}

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
}

test('candidate CLI converts a valid draft without mutating the official template', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waffer-candidate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const draftPath = path.join(dir, 'draft.json');
  const candidatePath = path.join(dir, 'candidate.json');
  fs.writeFileSync(draftPath, JSON.stringify(pendingDraft(), null, 2));

  const officialBefore = fs.readFileSync(officialPath, 'utf8');
  const result = run([draftPath, candidatePath]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(fs.existsSync(candidatePath));
  assert.equal(fs.readFileSync(officialPath, 'utf8'), officialBefore);

  const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  assert.equal(candidate.protocol, 'docs/FIELD_TEST.md');
  assert.equal(candidate.updatedAt, '2026-09-24T12:00:00.000Z');
  assert.equal(candidate.scenarios.length, 10);
  assert.equal(candidate.scenarios[0].status, 'PENDING');
  assert.notEqual(candidate.scenarios[0].title, 'Draft Scenario 1');
  assert.match(result.stdout, /not yet eligible for promotion/i);
});

test('candidate CLI defaults to a sibling .candidate.json output', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waffer-candidate-default-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const draftPath = path.join(dir, 'session.json');
  const expectedPath = path.join(dir, 'session.candidate.json');
  fs.writeFileSync(draftPath, JSON.stringify(pendingDraft()));

  const result = run([draftPath]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(fs.existsSync(expectedPath));
});

test('candidate CLI refuses to overwrite official results', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waffer-candidate-official-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const draftPath = path.join(dir, 'draft.json');
  fs.writeFileSync(draftPath, JSON.stringify(pendingDraft()));

  const officialBefore = fs.readFileSync(officialPath, 'utf8');
  const result = run([draftPath, officialPath]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /refusing to overwrite docs\/FIELD_TEST_RESULTS\.json/i);
  assert.equal(fs.readFileSync(officialPath, 'utf8'), officialBefore);
});

test('candidate CLI refuses to overwrite source draft or an existing candidate', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waffer-candidate-existing-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const draftPath = path.join(dir, 'draft.json');
  const outputPath = path.join(dir, 'candidate.json');
  fs.writeFileSync(draftPath, JSON.stringify(pendingDraft()));
  fs.writeFileSync(outputPath, 'do not replace');

  const sourceResult = run([draftPath, draftPath]);
  assert.equal(sourceResult.status, 2);
  assert.match(sourceResult.stderr, /source field-test draft/i);

  const outputResult = run([draftPath, outputPath]);
  assert.equal(outputResult.status, 2);
  assert.match(outputResult.stderr, /already exists/i);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), 'do not replace');
});

test('candidate CLI rejects invalid evidence and writes no candidate', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waffer-candidate-invalid-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const draft = pendingDraft();
  draft.scenarios[0] = {
    ...draft.scenarios[0],
    status: 'PASS',
    testedAt: '2026-09-24T12:00:00.000Z',
    evidence: null
  };

  const draftPath = path.join(dir, 'draft.json');
  const outputPath = path.join(dir, 'candidate.json');
  fs.writeFileSync(draftPath, JSON.stringify(draft));

  const result = run([draftPath, outputPath]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires captured runtime evidence/i);
  assert.equal(fs.existsSync(outputPath), false);
});
