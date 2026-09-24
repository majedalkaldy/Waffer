import { createRequire } from 'node:module';

import { RUNTIME_CONFIG } from '../lib/runtime-config.js';
import { getMarketConfig } from '../lib/market-config.js';
import {
  evaluateFieldTestResults,
  evaluateLaunchGate
} from '../lib/launch-readiness.js';
import { hasConfiguredPriceProvider } from '../lib/price-provider.js';

const require = createRequire(import.meta.url);
const FIELD_TEST_RESULTS = require('../docs/FIELD_TEST_RESULTS.json');

function blockerCodes({
  fieldTest,
  pricingProviderConfigured,
  configured
}) {
  const blockers = [];

  if (!fieldTest.schemaValid) blockers.push('FIELD_TEST_SCHEMA_INVALID');
  if (!fieldTest.evidenceValid) blockers.push('FIELD_TEST_EVIDENCE_INVALID');
  if (!fieldTest.integrityValid) blockers.push('FIELD_TEST_INTEGRITY_INVALID');
  if (!fieldTest.allPassed) blockers.push('FIELD_TEST_INCOMPLETE');
  if (!pricingProviderConfigured) blockers.push('VERIFIED_PRICE_PROVIDER_MISSING');
  if (!configured.analysis) blockers.push('ANALYSIS_NOT_CONFIGURED');
  if (!configured.catalog) blockers.push('CATALOG_NOT_CONFIGURED');

  return [...new Set(blockers)];
}

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
  const currentPhaseGate = evaluateLaunchGate({
    launchPhase: RUNTIME_CONFIG.launchPhase,
    results: FIELD_TEST_RESULTS
  });
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

  const knownBlockers = blockerCodes({
    fieldTest,
    pricingProviderConfigured,
    configured
  });

  const runtimePromotionReady =
    publicBetaGate.allowed &&
    pricingProviderConfigured &&
    configured.analysis &&
    configured.catalog;

  return res.status(200).json({
    ok: true,
    service: 'waffer-readiness',
    engineVersion: RUNTIME_CONFIG.engineVersion,
    launchPhase: RUNTIME_CONFIG.launchPhase,
    status: runtimePromotionReady ? 'runtime_promotion_ready' : 'not_promotion_ready',
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
      evidenceValid: fieldTest.evidenceValid,
      integrityValid: fieldTest.integrityValid,
      allPassed: fieldTest.allPassed,
      updatedAt: FIELD_TEST_RESULTS.updatedAt || null
    },
    promotion: {
      currentPhaseAllowed: currentPhaseGate.allowed,
      publicBetaGatePassed: publicBetaGate.allowed,
      fieldTestPromotionReady: publicBetaGate.promotionReady,
      verifiedPricingReady: pricingProviderConfigured,
      runtimePromotionReady,
      blockerCount: knownBlockers.length
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
