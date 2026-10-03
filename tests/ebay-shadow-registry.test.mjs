import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEbayShadowReadiness,
  createConfiguredEbayShadowProvider
} from '../lib/price-providers/ebay-shadow-registry.js';

test('eBay shadow readiness requires credentials, production approval and explicit shadow enablement', () => {
  assert.deepEqual(getEbayShadowReadiness({}),{
    providerId:'ebay-us-browse-shadow',
    market:'US',
    currency:'USD',
    clientIdConfigured:false,
    clientSecretConfigured:false,
    productionAccessApproved:false,
    shadowEnabled:false,
    ready:false,
    verifiedPricingActivated:false
  });

  const ready=getEbayShadowReadiness({
    EBAY_CLIENT_ID:'client',
    EBAY_CLIENT_SECRET:'secret',
    EBAY_BUY_PRODUCTION_APPROVED:'true',
    EBAY_SHADOW_ENABLED:'TRUE'
  });
  assert.equal(ready.ready,true);
  assert.equal(ready.verifiedPricingActivated,false);
});

test('configured shadow registry never creates a provider until every shadow gate is satisfied', () => {
  assert.equal(createConfiguredEbayShadowProvider({
    EBAY_CLIENT_ID:'client',
    EBAY_CLIENT_SECRET:'secret',
    EBAY_BUY_PRODUCTION_APPROVED:'true',
    EBAY_SHADOW_ENABLED:'false'
  }),null);

  const provider=createConfiguredEbayShadowProvider({
    EBAY_CLIENT_ID:'client',
    EBAY_CLIENT_SECRET:'secret',
    EBAY_BUY_PRODUCTION_APPROVED:'true',
    EBAY_SHADOW_ENABLED:'true'
  },{
    fetchImpl:async()=>{ throw new Error('not called in this test'); }
  });

  assert.equal(provider.id,'ebay-us-browse-shadow');
});
