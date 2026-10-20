# Gated eBay US runtime integration

Status: implemented with offline synthetic transport tests; **not a verified live integration**. No account approval, keys or terms were created or changed. `EBAY_PRICING_RELEASE.json` remains PENDING; default runtime mode is disabled. The independent `/review-demo/` remains synthetic and is not evidence for this path.

## Runtime path

`/api/price-compare` → server-only registry → eBay OAuth/Browse/Taxonomy adapter → validated matched listing → real app listing renderer. Health and readiness expose safe readiness booleans and blocker codes, never credentials, raw tokens, release sample, approval references or vehicle evidence.

The API accepts part manufacturer/number, vehicle year/make/model/trim/engine and quantity. Credentials, provider mode, approval and release evidence cannot be supplied in request bodies. No VIN is sent to eBay; only vehicle attributes are used for compatibility.

An accepted listing requires explicit MPN + manufacturer equality, fixed-price buying option, explicit in-stock status, exact canonical trim and engine (no prefix/displacement guessing), `COMPATIBLE`, USD amount, and an HTTPS eBay item URL. Server timestamps must be no more than five minutes old or 30 seconds ahead. Upstream requests reject redirects; timeouts abort work; transient HTTP failures get at most one short bounded retry, honoring both Retry-After formats. OAuth errors are not retried.

## Price honesty

The listing's item price and optional shipping estimate are separate. Destination eligibility, tax, package units and final checkout total are not established. Requested quantity and reported quantity availability are visible, but a listing's units/pack must still be checked by the buyer. `bestOffer`, final total, market range and confirmed savings remain null for this eBay path. A matched listing is not the cheapest offer or a guaranteed purchase quote. Source order is preserved; nothing is re-ranked by price.

Sandbox results use `sandboxPreview` and the `SANDBOX_TEST_DATA_ONLY` status, never live result fields, checkout links or savings. Browser tests use an isolated local harness and synthetic transport fixtures under `tests/`; they do not modify deployment settings or real release evidence.

## Deployment modes

- Absent or `WAFFER_PRICE_PROVIDER_MODE=disabled`: no provider construction, no eBay calls.
- `production`: requires `VERCEL_ENV=production`, existing `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`, `EBAY_BUY_PRODUCTION_APPROVED=true`, a valid reviewed release record and all official field scenarios passed. Preview never uses production credentials.
- `sandbox`: requires preview/development, separate `EBAY_SANDBOX_CLIENT_ID`/`EBAY_SANDBOX_CLIENT_SECRET`. Cannot run on production, cannot fall back to production credentials, cannot satisfy promotion readiness. eBay documents Sandbox compatibility testing as mock-data-only.
- Unknown mode: blocked; never defaults to production.

These are server-only settings. Do not use NEXT_PUBLIC/VITE/public prefixes, place keys in source, or send secrets through chat. Enabling modes or configuring persistent credentials needs the appropriate explicit approval and secure user handoff. This change does neither.

## Optional EPN attribution (production only)

`EBAY_AFFILIATE_CAMPAIGN_ID` is an optional server-only setting. Absent or empty means no affiliate header; an explicitly supplied nonempty value must be a string of exactly 10 ASCII digits, with no whitespace. Invalid values block production provider construction before any outbound call. EPN membership/account number `8008550` is not a campaign ID. Format validation does not verify campaign ownership, EPN status, Buy API approval or entitlement to commissions.

The production runtime and shadow pilot pass this setting to the adapter. It adds `X-EBAY-C-ENDUSERCTX: affiliateCampaignId=...` only to Browse requests, never OAuth or Taxonomy. The runtime provider cache includes the campaign so changes cannot reuse old attribution. Sandbox registries ignore the production campaign, including malformed values, and Sandbox transport never sends it. No request-body field can override server attribution. No reference ID, location or additional personal information is introduced.

The existing returned `itemAffiliateWebUrl` is preferred when supplied; otherwise the plain `itemWebUrl` remains the fallback. URLs still pass the existing HTTPS eBay item allowlist. No tracking URL is manufactured, and commission success is not inferred. Tracked links retain the existing English/Arabic disclosure and `rel="sponsored"`; Sandbox has no outbound listing link. Prices remain matched listings with unverified checkout totals and no confirmed savings.

This code does not configure a campaign, credentials or provider mode. Keep production disabled and the release record PENDING until the separate approval, authorized capture and review requirements are satisfied. EPN membership alone does not establish Developer/Buy API access. Confirm the keyset's account-deletion notification subscription or approved exemption before production use; persisted pilot/release samples contain seller/listing data, so do not assume a no-persistence exemption from short-lived UI state.

Offline fixtures cover validation, header routing, cache changes, Sandbox isolation, request-body injection, returned links and plain fallback. Synthetic fixtures must never become release evidence.

Official attribution reference: https://developer.ebay.com/api-docs/buy/static/api-browse.html (checked October 20, 2026).

## Evidence gate

`docs/EBAY_PRICING_RELEASE.json` is a sanitized review record, not a place for secrets, raw VINs or private approval attachments. A future reviewed PASS must include reviewer/time, expiring validity (maximum 30 days), non-secret approval reference, `REAL_PROVIDER_CAPTURE`, and the digest of a 20–50-case captured sample. Capture tooling records contract version, origin, requested manufacturer/part/vehicle, actual canonical fitment and compatibility, checked time and listing fields. The gate rejects explicit synthetic provenance, Sandbox, duplicate cases/inputs, missing brands, mismatched input/fitment, stale captures, tampering, and incomplete field evidence. At least 80% must yield fully identity-matched listings; every observation must be within 48 hours before review.

Digest calculation is SHA-256 of `JSON.stringify(sample)` using UTF-8; formatting of the enclosing review file does not affect it. This is an integrity/completeness check, not independent proof that eBay approved the account. A human review of genuine provider/account evidence remains mandatory. Never relabel synthetic fixtures as real captures.

## Authorization-dependent next steps

1. User verifies developer account/keysets, authorized Buy API access and any required agreements directly through official eBay account pages. Existing restricted sign-in routes remain restricted.
2. Obtain action-time approval to configure the specific existing Sandbox keypair in the Waffer Vercel Preview environment, via secure handoff, plus approved Sandbox use. Do not create credentials or OAuth grants as a workaround.
3. Run authorized Sandbox smoke checks and record them explicitly as test data. Separately authorize Production key configuration/calls only after eBay approval is verified, with scope/volume reviewed.
4. Resolve exact canonical fitment and run the 20–50 real-input Production pilot. Review fields, pack sizes, rejected cases and true availability; do not infer unknown values.
5. Review genuine sanitized evidence, keep the current field-test phase unless release approval independently permits promotion, and approve the production mode change. Verify deployment commit and readiness afterward.

## Rollback

Keep `WAFFER_PRICE_PROVIDER_MODE` absent/disabled. If previously enabled, an approved redeployment with disabled mode immediately stops new eBay calls. Remove no keys or evidence automatically. Revert this integration commit or promote the last verified deployment if code rollback is needed. A code rollback does not substitute for revoking credentials if a credential incident occurs.

Official references checked 2026-10-04:
- https://developer.ebay.com/api-docs/buy/static/api-browse.html
- https://developer.ebay.com/api-docs/buy/buy-requirements.html
- https://developer.ebay.com/develop/get-started/get-started-on-a-buying-application

## Isolated browser regression

`npm run test:browser` runs 6 fixture-server/resource-error contract checks and 14 Chromium full-app cases on loopback, at 1280×900 and 390×844. The actual upload, vehicle UI, pricing handler/adapter and listing renderer use fictional transport; all external browser requests are blocked. CI installs pinned Playwright and Chromium without provider credentials. Visible-home language switching, persisted Arabic reload and reset-to-home validate document width, localized service readiness and upload accessibility. Test fixtures and failure reports are excluded by `.vercelignore` and are never normal deployment assets. These tests complement, and do not replace, inspection of the protected deployed preview or genuine authorized provider evidence.
