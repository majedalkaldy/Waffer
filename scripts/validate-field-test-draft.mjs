import fs from 'node:fs';
import path from 'node:path';
import { validateFieldTestDraft } from '../lib/field-test-evidence-validator.js';

const input = process.argv[2];

if (!input) {
  console.error('Usage: npm run validate:field-test-draft -- <draft.json>');
  process.exit(2);
}

const resolved = path.resolve(input);
let draft;

try {
  draft = JSON.parse(fs.readFileSync(resolved, 'utf8'));
} catch (error) {
  console.error('Could not read field-test draft:', error.message);
  process.exit(2);
}

const result = validateFieldTestDraft(draft);

console.log(
  'Waffer field-test draft:',
  JSON.stringify({
    valid: result.valid,
    promotionCandidate: result.promotionCandidate,
    ...result.counts
  })
);

if (result.warnings.length) {
  console.log('Warnings:');
  for (const warning of result.warnings) console.log('- ' + warning);
}

if (result.errors.length) {
  console.error('Validation errors:');
  for (const error of result.errors) console.error('- ' + error);
}

process.exit(result.valid ? 0 : 1);
