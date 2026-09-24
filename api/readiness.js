import { createRequire } from 'node:module';
import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { getMarketConfig } from '../lib/market-config.js';
import { evaluateFieldTestResults, evaluateLaunchGate } from '../lib/launch-readiness.js';
import { hasConfiguredPriceProvider } from '../lib/price-provider.js';

const require = createRequire(import.meta.url);
const FIELD_TEST_RESULTS = require('../docs/FIELD_TEST_RESULTS.json');

export default async function handler(req, res) {
  res.setHeader('Allow', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const marketConfig = getMarketConfig(req.query || {});
  if (!marketConfig.supported) {
    return res.status(400).json({
      ok: false,
      status: 'unsupported_market',
      requestedMarket: marketConfig.requestedMarket
    });
  }

  const fieldTest = evaluateFieldTestResults(FIELD_TEST_RESULTS);
  const publicBetaGate = evaluateLaunchGate({
    launchPhase: 'public-beta',
    results: FIELD_TEST_RESULTS
  });
  const pricingProviderConfigured = hasConfiguredPriceProvider(marketConfig.market);

  const configured = {
    analysis: Boolean(process.env.OPENAI_API_KEY),
    catalog: Boolean(process.env.AUTOPARTS_API_KEY),
    pricing: pricingProviderConfigured
  };

  const knownBlockers = [];
  if (!fieldTest.schemaValid) knownBlockers.push('FIELD_TEST_SCHEMA_INVALID');
  if (!fieldTest.allPassed) knownBlockers.push('FIELD_TEST_INCOMPLETE');
  if (!pricingProviderConfigured) knownBlockers.push('VERIFIED_PRICE_PROVIDER_MISSING');
  if (!configured.analysis) knownBlockers.push('ANALYSIS_NOT_CONFIGURED');
  if (!configured.catalog) knownBlockers.push('CATALOG_NOT_CONFIGURED');

  return res.status(200).json({
    ok: true,
    service: 'waffer-readiness',
    engineVersion: RUNTIME_CONFIG.engineVersion,
    launchPhase: RUNTIME_CONFIG.launchPhase,
    deployment: {
      environment: process.env.VERCEL_ENV || null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA
        ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8)
        : null
    },
    market: {
      market: marketConfig.market,
      locale: marketConfig.locale,
      currency: marketConfig.currency
    },
    fieldTest: {
      expected: fieldTest.expected,
      passed: fieldTest.passed,
      failed: fieldTest.failed,
      pending: fieldTest.pending,
      schemaValid: fieldTest.schemaValid,
      allPassed: fieldTest.allPassed,
      updatedAt: FIELD_TEST_RESULTS.updatedAt || null
    },
    promotion: {
      publicBetaGatePassed: publicBetaGate.allowed,
      fieldTestPromotionReady: publicBetaGate.promotionReady,
      verifiedPricingReady: pricingProviderConfigured
    },
    configured,
    knownBlockers,
    manualChecks: {
      mainBranchProtection: 'NOT_EVALUATED_BY_RUNTIME',
      wafEnforcement: 'NOT_EVALUATED_BY_RUNTIME'
    },
    timestamp: new Date().toISOString()
  });
}
