import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateOfficialFieldTestResults } from '../lib/field-test-evidence-validator.js';

export function redactFieldTestCandidate(candidate) {
  const validation = validateOfficialFieldTestResults(candidate);
  if (!validation.promotionCandidate) throw new Error('Redaction requires a reviewed 10/10 evidence candidate');
  const result = structuredClone(candidate);
  for (const entry of result.scenarios) {
    const vehicle = entry.evidence?.vehicle;
    if (!vehicle?.vin) continue;
    const vin = String(vehicle.vin).trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new Error('Cannot redact an invalid VIN');
    vehicle.vinSha256 = createHash('sha256').update(vin).digest('hex');
    vehicle.vinRedacted = true;
    vehicle.vin = null;
  }
  if (!validateOfficialFieldTestResults(result).promotionCandidate) throw new Error('Redacted evidence failed validation');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/redact-field-test-candidate.mjs <candidate.json> <public-candidate.json>');
  const officialPath = fileURLToPath(new URL('../docs/FIELD_TEST_RESULTS.json', import.meta.url));
  if (path.resolve(output) === path.resolve(input) || path.resolve(output) === officialPath) {
    throw new Error('Refusing to overwrite source or official results');
  }
  const result = redactFieldTestCandidate(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log('Public candidate created with VIN hashes; retain the original evidence privately for review.');
}
