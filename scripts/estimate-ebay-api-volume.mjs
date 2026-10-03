import fs from 'node:fs';
import path from 'node:path';

import { estimateEbayApiVolume } from '../lib/price-providers/ebay-volume-estimator.js';

const inputPath=process.argv[2];
if(!inputPath){
  console.error('Usage: npm run ebay:estimate-volume -- <assumptions.json>');
  process.exit(64);
}

const resolved=path.resolve(process.cwd(),inputPath);
let input;
try{
  input=JSON.parse(fs.readFileSync(resolved,'utf8'));
}catch(error){
  console.error(JSON.stringify({
    status:'INVALID_INPUT_FILE',
    file:resolved,
    error:String(error?.message||error)
  },null,2));
  process.exit(65);
}

const report=estimateEbayApiVolume(input);
console.log(JSON.stringify(report,null,2));
if(!report.valid) process.exit(2);
