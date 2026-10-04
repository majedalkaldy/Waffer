import {getEbayRuntimeReadiness} from '../lib/price-providers/ebay-runtime-registry.js';
import {
  getEbaySandboxReadiness,
  getEbayShadowReadiness
} from '../lib/price-providers/ebay-shadow-registry.js';

console.log(JSON.stringify({
  runtime:getEbayRuntimeReadiness(process.env),
  sandbox:getEbaySandboxReadiness(process.env),
  production:getEbayShadowReadiness(process.env)
},null,2));
