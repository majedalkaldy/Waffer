import fs from 'node:fs';
import path from 'node:path';

import {
  createConfiguredEbaySandboxProvider,
  createConfiguredEbayShadowProvider,
  getEbaySandboxReadiness,
  getEbayShadowReadiness
} from '../lib/price-providers/ebay-shadow-registry.js';
import { buildEbayPilotSample } from '../lib/price-providers/ebay-pilot.js';
import { validateEbayPilotInput } from '../lib/price-providers/ebay-pilot-input.js';

const environment = String(process.argv[2] || '').trim().toLowerCase();
const inputPath = process.argv[3];
const outputPath = process.argv[4] || '';

if (!['sandbox','production'].includes(environment) || !inputPath) {
  console.error('Usage: npm run ebay:pilot -- <sandbox|production> <cases.json> [output.json]');
  process.exit(64);
}

const resolvedInput = path.resolve(process.cwd(), inputPath);
let payload;
try {
  payload = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
} catch (error) {
  console.error(JSON.stringify({
    status:'INVALID_INPUT_FILE',
    file:resolvedInput,
    error:String(error?.message || error)
  }, null, 2));
  process.exit(65);
}

const inputReport = validateEbayPilotInput(payload, {environment});
if (!inputReport.valid) {
  console.error(JSON.stringify({status: 'INVALID_PILOT_CASES', ...inputReport}, null, 2));
  process.exit(66);
}

const readiness = environment === 'sandbox'
  ? getEbaySandboxReadiness(process.env)
  : getEbayShadowReadiness(process.env);

if (!readiness.ready) {
  console.error(JSON.stringify({
    status:'EBAY_ENVIRONMENT_NOT_READY',
    environment,
    readiness
  }, null, 2));
  process.exit(2);
}

const provider = environment === 'sandbox'
  ? createConfiguredEbaySandboxProvider(process.env)
  : createConfiguredEbayShadowProvider(process.env);

const cases = Array.isArray(payload) ? payload : payload?.cases;
if (!Array.isArray(cases)) {
  console.error(JSON.stringify({
    status:'CASES_ARRAY_REQUIRED',
    environment
  }, null, 2));
  process.exit(66);
}

const sample = await buildEbayPilotSample({ provider, environment, cases });
const text = JSON.stringify(sample, null, 2) + '\n';

if (outputPath) {
  const resolvedOutput = path.resolve(process.cwd(), outputPath);
  fs.writeFileSync(resolvedOutput, text, 'utf8');
  console.log(JSON.stringify({
    status:'SAMPLE_WRITTEN',
    environment,
    output:resolvedOutput,
    caseCount:sample.cases.length
  }, null, 2));
} else {
  process.stdout.write(text);
}
