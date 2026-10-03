import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEbayShadowReadiness,
  createConfiguredEbayShadowProvider,
  getEbaySandboxReadiness,
  createConfiguredEbaySandboxProvider
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


test('eBay Sandbox readiness requires sandbox credentials and explicit enablement but not production approval', () => {
  const notReady=getEbaySandboxReadiness({
    EBAY_SANDBOX_CLIENT_ID:'sandbox-client',
    EBAY_SANDBOX_CLIENT_SECRET:'sandbox-secret',
    EBAY_SANDBOX_SHADOW_ENABLED:'false'
  });
  assert.equal(notReady.ready,false);

  const ready=getEbaySandboxReadiness({
    EBAY_SANDBOX_CLIENT_ID:'sandbox-client',
    EBAY_SANDBOX_CLIENT_SECRET:'sandbox-secret',
    EBAY_SANDBOX_SHADOW_ENABLED:'true'
  });
  assert.equal(ready.ready,true);
  assert.equal(ready.environment,'sandbox');
  assert.equal(ready.verifiedPricingActivated,false);

  const provider=createConfiguredEbaySandboxProvider({
    EBAY_SANDBOX_CLIENT_ID:'sandbox-client',
    EBAY_SANDBOX_CLIENT_SECRET:'sandbox-secret',
    EBAY_SANDBOX_SHADOW_ENABLED:'true'
  },{
    fetchImpl:async()=>{ throw new Error('not called in this test'); }
  });
  assert.equal(provider.id,'ebay-us-browse-shadow-sandbox');
  assert.equal(provider.environment,'sandbox');
});
