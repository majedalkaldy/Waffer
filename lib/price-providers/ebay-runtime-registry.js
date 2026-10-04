// Server only: never import this module from browser assets.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createEbayUsShadowProvider } from './ebay-us.js';
import { normalizeMatchedListing } from '../matched-listing.js';
import { evaluateFieldTestResults } from '../launch-readiness.js';

const require = createRequire(import.meta.url);
const RELEASE = require('../../docs/EBAY_PRICING_RELEASE.json');
const FIELD_TESTS = require('../../docs/FIELD_TEST_RESULTS.json');
const enabled = value => value === 'true';
const present = value => Boolean(String(value || '').trim());
const ageLimit = 30 * 24 * 60 * 60 * 1000;

export function evaluateEbayPricingRelease(release = {}, { fieldTestResults = FIELD_TESTS, now = Date.now() } = {}) {
  release = release && typeof release === 'object' ? release : {};
  const blockers = [];
  if (release.schemaVersion !== 1 || release.status !== 'PASS' || release.environment !== 'production' || release.market !== 'US') blockers.push('RELEASE_REVIEW_REQUIRED');
  const reviewed = Date.parse(release.reviewedAt);
  const expires = Date.parse(release.expiresAt);
  if (!Number.isFinite(reviewed) || reviewed > now || now - reviewed > ageLimit || !Number.isFinite(expires) || expires <= now || expires - reviewed > ageLimit) blockers.push('RELEASE_REVIEW_EXPIRED_OR_MISSING');
  if (!present(release.reviewedBy) || !present(release.productionApprovalReference)) blockers.push('PRODUCTION_APPROVAL_EVIDENCE_REQUIRED');
  if (release.evidenceKind !== 'REAL_PROVIDER_CAPTURE') blockers.push('REAL_PROVIDER_EVIDENCE_REQUIRED');
  const sample = release.sample;
  if (!sample || createHash('sha256').update(JSON.stringify(sample)).digest('hex') !== release.sampleSha256) blockers.push('PILOT_EVIDENCE_DIGEST_MISMATCH');
  const cases = Array.isArray(sample?.cases) ? sample.cases : [];
  const ids = new Set(cases.map(entry => entry?.caseId));
  const requestIds = new Set();
  const key = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  let accepted = 0;
  let fresh = 0;
  for (const entry of cases) {
    if (!entry || typeof entry !== 'object') continue;
    const requestedVehicle = entry.requestedVehicle || {};
    const fitment = entry.matchedListing?.fitmentEvidence || {};
    const fields = ['year','make','model','trim','engine'];
    const inputComplete = fields.every(name => key(requestedVehicle[name]));
    const fitmentBound = inputComplete && fields.every(name => key(requestedVehicle[name]) === key(fitment[name])) && fitment.source === 'EBAY_TAXONOMY' && fitment.compatibilityStatus === 'COMPATIBLE';
    const brandBound = key(entry.requestedManufacturer) && key(entry.requestedManufacturer) === key(entry.matchedListing?.manufacturer);
    if (inputComplete) requestIds.add(JSON.stringify([key(entry.requestedPartNumber),key(entry.requestedManufacturer),...fields.map(name => key(requestedVehicle[name]))]));
    const checked = Date.parse(entry.checkedAt);
    if (Number.isFinite(checked) && checked <= reviewed && reviewed - checked <= 48 * 60 * 60 * 1000) fresh++;
    const listingAccepted = Boolean(brandBound && fitmentBound && entry.matchedListing?.identityBasis === 'EXACT_MPN_AND_BRAND' && normalizeMatchedListing(entry.matchedListing, {requestedPartNumber: entry.requestedPartNumber}));
    if (entry.synthetic === true || (entry.evidenceKind && entry.evidenceKind !== 'REAL_PROVIDER_CAPTURE') || (entry.environment && entry.environment !== 'production') || (entry.runnerStatus === 'DATA_RETURNED' && !listingAccepted) || (entry.runnerStatus !== 'DATA_RETURNED' && entry.matchedListing)) blockers.push('PILOT_CASE_EVIDENCE_INVALID');
    if (entry.runnerStatus === 'DATA_RETURNED' && listingAccepted) accepted++;
  }
  if (sample?.synthetic !== false || sample?.evidenceKind !== 'REAL_PROVIDER_CAPTURE' || sample?.captureContract !== 'ebay-us-matched-listing-v1' || cases.some(entry => /^(synthetic|fixture|test)[-_]/i.test(String(entry?.caseId || '')))) blockers.push('SYNTHETIC_OR_UNVERIFIED_CAPTURE');
  if (sample?.providerId !== 'ebay-us-browse-shadow' || sample?.environment !== 'production' || sample?.market !== 'US' || sample?.currency !== 'USD' || cases.length < 20 || cases.length > 50 || ids.size !== cases.length || requestIds.size !== cases.length || ids.has(undefined) || ids.has('') || accepted / cases.length < 0.8 || fresh !== cases.length) blockers.push('PRODUCTION_PILOT_INCOMPLETE');
  if (!evaluateFieldTestResults(fieldTestResults).allPassed) blockers.push('FIELD_TEST_INCOMPLETE');
  return { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function getEbayRuntimeReadiness(env = {}, options = {}) {
  const mode = env.WAFFER_PRICE_PROVIDER_MODE || 'disabled';
  const deployment = env.VERCEL_ENV || 'development';
  const review = evaluateEbayPricingRelease(options.releaseEvidence || RELEASE, options);
  const blockers = [];
  if (!['disabled', 'production', 'sandbox'].includes(mode)) blockers.push('PROVIDER_MODE_INVALID');
  if (mode === 'disabled') blockers.push('PROVIDER_DISABLED');
  if (mode === 'production') {
    if (deployment !== 'production') blockers.push('PRODUCTION_PROVIDER_REQUIRES_PRODUCTION_DEPLOYMENT');
    if (!enabled(env.EBAY_BUY_PRODUCTION_APPROVED)) blockers.push('PRODUCTION_ACCESS_NOT_APPROVED');
    if (!present(env.EBAY_CLIENT_ID) || !present(env.EBAY_CLIENT_SECRET)) blockers.push('PRODUCTION_CREDENTIALS_MISSING');
    blockers.push(...review.blockers);
  }
  if (mode === 'sandbox') {
    if (!['preview', 'development'].includes(deployment)) blockers.push('SANDBOX_FORBIDDEN_IN_PRODUCTION');
    if (!present(env.EBAY_SANDBOX_CLIENT_ID) || !present(env.EBAY_SANDBOX_CLIENT_SECRET)) blockers.push('SANDBOX_CREDENTIALS_MISSING');
  }
  return {
    providerId: 'ebay-us-browse', mode, environment: mode === 'sandbox' ? 'sandbox' : 'production',
    ready: blockers.length === 0, productionReady: mode === 'production' && blockers.length === 0,
    sandboxReady: mode === 'sandbox' && blockers.length === 0,
    finalTotalVerification: false, blockers: [...new Set(blockers)]
  };
}

let cachedProvider = null;
let cachedConfiguration = null;
export function createConfiguredEbayRuntimeProvider(env = {}, options = {}) {
  const readiness = getEbayRuntimeReadiness(env, options);
  if (!readiness.ready) { cachedProvider = null; cachedConfiguration = null; return null; }
  const sandbox = readiness.sandboxReady;
  const configuration = [readiness.mode, sandbox ? env.EBAY_SANDBOX_CLIENT_ID : env.EBAY_CLIENT_ID, sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_CLIENT_SECRET];
  const cacheable = Object.keys(options).length === 0;
  if (cacheable && cachedConfiguration?.every((value, i) => value === configuration[i])) return cachedProvider;
  const provider = createEbayUsShadowProvider({
    clientId: sandbox ? env.EBAY_SANDBOX_CLIENT_ID : env.EBAY_CLIENT_ID,
    clientSecret: sandbox ? env.EBAY_SANDBOX_CLIENT_SECRET : env.EBAY_CLIENT_SECRET,
    environment: sandbox ? 'sandbox' : 'production', productionAccessApproved: !sandbox, requireBrand: true,
    fetchImpl: options.fetchImpl, now: options.clock
  });
  if (cacheable) { cachedConfiguration = configuration; cachedProvider = provider; }
  return provider;
}
