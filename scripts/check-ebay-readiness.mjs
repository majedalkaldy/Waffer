import {
  getEbaySandboxReadiness,
  getEbayShadowReadiness
} from '../lib/price-providers/ebay-shadow-registry.js';

console.log(JSON.stringify({
  sandbox:getEbaySandboxReadiness(process.env),
  production:getEbayShadowReadiness(process.env)
},null,2));
