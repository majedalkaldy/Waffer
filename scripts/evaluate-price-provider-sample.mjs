import fs from 'node:fs';
import path from 'node:path';
import { evaluatePriceProviderSample } from '../lib/price-provider-sample-validator.js';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npm run evaluate:price-provider-sample -- <sample.json>');
  process.exit(64);
}

const resolved = path.resolve(process.cwd(), inputPath);
let sample;
try {
  sample = JSON.parse(fs.readFileSync(resolved, 'utf8'));
} catch (error) {
  console.error(JSON.stringify({
    status: 'INVALID_INPUT_FILE',
    file: resolved,
    error: String(error?.message || error)
  }, null, 2));
  process.exit(65);
}

const report = evaluatePriceProviderSample(sample);
console.log(JSON.stringify(report, null, 2));

if (report.status === 'NOT_READY_FOR_SHADOW') process.exit(2);
