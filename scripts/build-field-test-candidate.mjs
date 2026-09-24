import fs from 'node:fs';
import path from 'node:path';

import {
  validateFieldTestDraft,
  buildOfficialFieldTestResultsFromDraft
} from '../lib/field-test-evidence-validator.js';

const inputArg = process.argv[2];
const outputArg = process.argv[3];

if (!inputArg) {
  console.error('Usage: npm run build:field-test-candidate -- <draft.json> [candidate.json]');
  process.exit(2);
}

const inputPath = path.resolve(inputArg);
const officialPath = path.resolve(
  new URL('../docs/FIELD_TEST_RESULTS.json', import.meta.url).pathname
);
const outputPath = outputArg
  ? path.resolve(outputArg)
  : path.resolve(
      path.dirname(inputPath),
      path.basename(inputPath, path.extname(inputPath)) + '.candidate.json'
    );

if (outputPath === officialPath) {
  console.error(
    'Refusing to overwrite docs/FIELD_TEST_RESULTS.json. ' +
    'Generate a candidate file, review it, then update the official results through a reviewed change.'
  );
  process.exit(2);
}

if (outputPath === inputPath) {
  console.error('Refusing to overwrite the source field-test draft.');
  process.exit(2);
}

let draft;
let officialTemplate;

try {
  draft = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (error) {
  console.error('Could not read field-test draft:', error.message);
  process.exit(2);
}

try {
  officialTemplate = JSON.parse(fs.readFileSync(officialPath, 'utf8'));
} catch (error) {
  console.error('Could not read official field-test template:', error.message);
  process.exit(2);
}

const validation = validateFieldTestDraft(draft);

console.log(
  'Waffer field-test candidate validation:',
  JSON.stringify({
    valid: validation.valid,
    promotionCandidate: validation.promotionCandidate,
    ...validation.counts
  })
);

if (validation.warnings.length) {
  console.log('Warnings:');
  for (const warning of validation.warnings) console.log('- ' + warning);
}

if (!validation.valid) {
  console.error('Validation errors:');
  for (const error of validation.errors) console.error('- ' + error);
  process.exit(1);
}

const candidate = buildOfficialFieldTestResultsFromDraft(draft, officialTemplate);

try {
  fs.writeFileSync(
    outputPath,
    JSON.stringify(candidate, null, 2) + '\n',
    { encoding: 'utf8', flag: 'wx' }
  );
} catch (error) {
  if (error?.code === 'EEXIST') {
    console.error('Candidate output already exists; refusing to overwrite:', outputPath);
    process.exit(2);
  }
  console.error('Could not write candidate file:', error.message);
  process.exit(2);
}

console.log('Candidate written:', outputPath);
console.log(
  validation.promotionCandidate
    ? 'Candidate contains 10/10 PASS with valid evidence and is eligible for review.'
    : 'Candidate is valid evidence, but is not yet eligible for promotion.'
);
