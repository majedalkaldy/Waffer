import fs from 'node:fs';
import {validateEbayPilotInput} from '../lib/price-providers/ebay-pilot-input.js';

const [environment, inputPath] = process.argv.slice(2);
if (!['sandbox', 'production'].includes(environment) || !inputPath) {
  console.error('Usage: npm run ebay:validate-cases -- <sandbox|production> <cases.json>');
  process.exit(64);
}
let payload;
try { payload = JSON.parse(fs.readFileSync(inputPath, 'utf8')); }
catch { console.error(JSON.stringify({status: 'INVALID_INPUT_FILE'})); process.exit(65); }
const report = validateEbayPilotInput(payload, {environment});
console.log(JSON.stringify(report, null, 2));
if (!report.valid) process.exit(2);
