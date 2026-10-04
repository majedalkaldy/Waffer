import fs from 'node:fs';
import { estimatePilotVolume } from '../lib/price-providers/ebay-pilot-volume-plan.js';
if (!process.argv[2]) { console.error('Usage: npm run ebay:estimate-pilot-volume -- <plan.json>'); process.exit(64); }
let input;
try { input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); }
catch { console.error('INVALID_PLAN_FILE'); process.exit(65); }
if (input?.evidenceType !== 'HYPOTHETICAL_PLAN_NOT_ACTUAL_TRAFFIC' || !Array.isArray(input.scenarios) || !input.scenarios.length) {
  console.error('LABELED_SCENARIOS_REQUIRED'); process.exit(65);
}
const reports = input.scenarios.map(estimatePilotVolume);
console.log(JSON.stringify({evidenceType: input.evidenceType, reports}, null, 2));
if (reports.some(report => !report.valid)) process.exit(2);
