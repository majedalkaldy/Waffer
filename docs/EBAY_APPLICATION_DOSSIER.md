# Waffer — eBay Buy API Application Dossier

Prepared: 2026-10-03 · Revised: 2026-10-04

**Draft preparation packet, not a completed application or proof of eBay approval.**
This document does not authorize accepting eBay contracts, policies, or legal terms on behalf of the account owner.

## Current implementation and evidence boundary

- **Implemented in code:** server-side eBay Sandbox/Production shadow adapter, OAuth client-credentials flow, Browse search/item/compatibility calls, Taxonomy resolver, readiness checks, input preflight, batch pilot runner, and regression tests.
- **Not wired to the public app:** `/api/price-compare` uses `lib/price-provider.js`, whose `MARKET_PRICE_PROVIDERS` registry is intentionally empty. It does not invoke the separate eBay shadow adapter. With a valid permitted pricing request, the normal app returns `WAITING_FOR_VERIFIED_PRICE_SOURCE`, null market prices/offer/saving, and `NOT_CALCULATED` savings.
- **Synthetic reviewer UI:** `/review-demo/` is an isolated static route using fictional vehicle, part, listing, and price fixtures. It illustrates success, empty, error, stale, and uncertain-fitment states without remote service calls, checkout, or listing link-out. See [reviewer instructions](SYNTHETIC_REVIEW_DEMO.md).
- **Unverified external prerequisites:** eBay Developer account/keyset status, successful Sandbox OAuth/API execution, and Production Buy API approval have not been established by this packet. Configuration flags are not evidence of provider approval.
- **Release remains gated:** `verifiedMarketPricing` remains disabled. Neither the synthetic UI nor a passing offline test is evidence of live inventory, real pricing, actual fitment, a completed provider pilot, or commercial readiness.

The synthetic route, credentialed Sandbox integration, and authorized Production shadow pilot are three separate evidence stages. Do not describe the synthetic route as an eBay Sandbox integration or present its screenshots as API-run evidence.

## Application identity

- Product: **Waffer**
- Intended primary eBay marketplace: **United States / EBAY_US**
- Product purpose: review automotive repair quotations, establish part identity/fitment, and eventually compare traceable offers
- Proposed purchase model: after approval and separate public integration, direct the user to the source listing on eBay to complete a purchase. Waffer does not perform checkout. The synthetic route has no listing link-out or checkout.
- APIs proposed: Browse API and Taxonomy API, using Identity API application tokens
- Current stage: field-test product with separately implemented CLI/shadow eBay tooling and an isolated synthetic reviewer demonstration

## Draft business-model answer

Waffer helps U.S. vehicle owners review repair quotations and identify compatible replacement parts. Its existing vehicle-identification and catalog components can help establish vehicle and part identity. The proposed eBay integration would resolve canonical eBay Motors compatibility values, search fixed-price listings through Browse, and require exact part number and manufacturer, explicit stock and exact canonical vehicle compatibility before producing a matched listing for review. Unknown shipping and checkout totals remain explicitly unverified.

The server-side shadow adapter implements this provider-side sequence, but the public comparison API is not connected to it. After eBay authorization, integration validation, a real Production shadow pilot, and separate release approval, the intended public experience would display traceable offers and direct users to eBay for purchase.

The adapter uses API calls rather than scraping, preserves eBay Browse source order while testing candidates, and returns the first qualifying offer. Those code properties do not establish that eBay has reviewed or approved Waffer's use case.

## Intended end-to-end flow and implemented boundaries

1. **Existing product components:** collect vehicle identity and requested part information; U.S. VIN enrichment and catalog matching are separate from the synthetic demo.
2. **Implemented shadow adapter:** search Browse with part number/description and the fixed-price filter.
3. Retrieve candidate listing details in source order; reject candidates lacking exact MPN or explicit in-stock evidence.
4. Resolve category-specific canonical Year / Make / Model / Trim / Engine using the Motors Taxonomy resolver; fail closed on ambiguity.
5. Call Browse `checkCompatibility`; only `COMPATIBLE` may qualify.
6. Keep item price and shipping estimate separate, with seller, HTTPS source URL and checked-at time. Never promote their sum to a final price or savings. Destination-specific shipping eligibility, tax/fees, and seller package quantities still require pilot/manual review; this is not a guaranteed checkout total.
7. **Not yet implemented as an integrated public eBay flow:** connect an approved provider to the public registry, validate user-facing results, and enable approved listing link-out after the required release gates.

The CLI runner accepts prepared case data. Running its commands does not demonstrate the full browser quotation/VIN/catalog/eBay path, and the synthetic route does not execute any of these external-service steps.

## APIs and methods implemented in the shadow adapter

### Identity API
- OAuth 2.0 client-credentials application token.

### Browse API
- `item_summary/search`
- `getItem`
- `checkCompatibility`

### Taxonomy API
- `getCompatibilityProperties`
- `getCompatibilityPropertyValues`

The adapter targets `EBAY_US`, Motors compatibility tree `100`, and category-specific values. It does not assume NHTSA display strings are valid eBay canonical compatibility values. These are implementation details to validate against a real authorized API run, not a record of one.

## Proposed data processing and display

The intended integration would process vehicle identity, requested part number/description, listing identifier, seller display name, item price, known shipping, stock evidence, compatibility status, source URL, and verification timestamp. Storage/retention and user-facing presentation must be reviewed before public integration; this packet does not establish a deployed eBay retention workflow.

Browse-only access does not require buyer passwords or checkout credentials. The synthetic route uses only fictional local fixtures; it is not a place to enter real VINs, customer quotations, credentials, or personal data.

## Security and activation controls

- Adapter credentials are supplied server-side, not embedded in browser JavaScript or the synthetic route.
- Separate Sandbox and Production environment-variable names/base URLs are implemented.
- Production shadow creation requires credentials plus explicit approval and enablement flags. The account owner must verify actual approval separately; setting a flag does not grant it.
- Readiness reports inspect local configuration presence/flags only. They do not authenticate with eBay or verify a keyset, entitlement, approval, or working API integration.
- The public pricing path has request controls and timeouts, but its provider registry remains empty. These controls are not evidence that the standalone pilot has been load-tested.
- Shadow readiness and successful offline tests do not activate user-facing verified pricing.

## Synthetic reviewer demonstration available without credentials

Open `/review-demo/` on the build under review and follow [SYNTHETIC_REVIEW_DEMO.md](SYNTHETIC_REVIEW_DEMO.md). The route deliberately labels all data synthetic and demonstrates failure states as well as the illustrative success state. It makes no eBay, OpenAI, catalog, VIN, or other remote service calls and provides no checkout or listing link-out.

Reviewer screenshots can support a discussion of the proposed UX only. They must retain the synthetic labels and must not be submitted as evidence of successful Sandbox calls, live quotations, inventory, fitment, Production access, or launch readiness. A route in a local checkout does not establish a deployed/reviewer-accessible URL; verify the exact reviewed build before sharing one.

## Credentialed Sandbox validation still required

The repository contains the adapter, Taxonomy resolver, readiness gate, batch runner, and tests. Sandbox credentials and successful Sandbox API results are unverified. After the owner confirms access and an authorized operator configures credentials securely, prepare real Sandbox inputs and run:

```bash
npm run ebay:validate-cases -- sandbox <completed-sandbox-cases.json>
npm run ebay:readiness
npm run ebay:pilot -- sandbox <completed-sandbox-cases.json> <sandbox-output.json>
```

`docs/EBAY_PILOT_CASES.json` is an incomplete placeholder, not a runnable approved case set. Keep the output explicitly labeled `environment: "sandbox"`; Sandbox evidence cannot pass the Production pricing gate. Record the exact build, run date, redacted inputs/output, and observed success/failure results without exposing secrets.

A support-case Sandbox walkthrough should be written only after a genuine authorized run. Identify the actual test entry point (currently the CLI), completed test cases, prerequisites, and reproducible results. Do not tell a reviewer that the normal public app runs eBay searches or offers link-out when it does not. A browser-connected Sandbox build remains additional work.

## Production shadow pilot still required

After the owner verifies Production Buy API approval and authorized configuration, complete the real identity evidence and validate 20–50 real cases:

```bash
npm run ebay:validate-cases -- production <20-50-real-cases.json>
npm run ebay:readiness
npm run ebay:pilot -- production <20-50-real-cases.json> <production-sample.json>
npm run evaluate:price-provider-sample -- <production-sample.json>
```

Inspect exact identity, canonical fitment, current inventory, seller package quantities, shipping, tax/fees, source URLs, and freshness manually. A passing internal sample is necessary evidence for further review, not permission to register a public provider, accept terms, enable verified pricing, or release commercially.

## Call-volume planning and Growth Check

### Hypothetical bounded pilot scenarios

`docs/EBAY_PILOT_VOLUME_PLAN.json` contains **hypothetical 20–50-case scenarios**, separate from the incomplete Growth Check input. Run the offline planning command:

```bash
npm run ebay:estimate-pilot-volume -- docs/EBAY_PILOT_VOLUME_PLAN.json
```

The current scenarios estimate **221 calls for 20 cases**, **1,402 calls for 35 cases**, and **7,200 calls for 50 cases**, including explicit OAuth budgets of 1, 2, and 100 requests respectively. The 20-case plan is one pass; the 35/50-case plans budget one initial pass plus one complete manual rerun per case. No automatic retry behavior is implied.

Category Taxonomy resolution is reused only within a single adapter lookup; the model assumes no cross-case or cross-run cache savings. A fully resolved category costs one properties request and four values requests in this plan. Early candidate rejection or the first accepted offer may reduce actual calls; token expiry, process restarts, or further reruns require revised assumptions. These totals are batch budgets, not rate-limit guarantees. If a batch is run entirely within one hour, hourly calls equal its batch total.

The output is a model driven by documented assumptions, not measured traffic, a live pilot result, an approved production forecast, or an approved Growth Check submission. Review its assumptions and limitations, then compare with measured calls only after an authorized API run. Do not treat a 20–50-case pilot as daily active user traffic or claim its estimates establish eBay quota approval.

### Incomplete application traffic input

`docs/EBAY_GROWTH_CHECK_INPUT.json` still contains zero placeholders and remains incomplete. Do not submit its output as an application forecast. Replace placeholders only with measured data or explicitly approved, clearly labeled planning assumptions before running:

```bash
npm run ebay:estimate-volume -- docs/EBAY_GROWTH_CHECK_INPUT.json
```

The existing estimator reports Browse search, item-detail, compatibility, and Taxonomy method estimates. Reconcile model scope, caching, retries, authentication overhead, peak concentration, and any limits against the actual implementation and intended use before owner review. Neither estimator submits an application or establishes approval.

## Application/support material still to assemble

Before any submission, the owner should verify the current eBay requirements and applicable EPN/Buy API approval path using the references below. The earlier proposed support-ticket subject, `Buy API Production Access (<EPN registered eBay user ID>)`, must be checked against the then-current instructions rather than treated as verified submission guidance.

Prepare only truthful, clearly labeled materials:
- owner-confirmed account/EPN identity and access/approval evidence, where applicable;
- reproducible authorized Sandbox API results and exact test instructions;
- synthetic screenshots labeled as mock UX, separately from API evidence;
- data-flow diagram distinguishing public product, isolated demo, and CLI/shadow adapter;
- reviewed traffic assumptions and measured results where available;
- remaining integration, data/terms, pilot, and release gates.

No login, key creation, legal acceptance, application submission, or Production activation is performed by this packet or demo.

## Current blockers

1. **External status unverified:** the owner must establish Developer account/keyset status, Sandbox access, and any required Buy API/EPN/Production approvals.
2. **Integration evidence missing:** execute and document authorized Sandbox calls; offline regression tests and fictional fixtures do not replace this.
3. **Runtime wired, activation pending:** the server registry, API and listing UI are wired under `docs/EBAY_RUNTIME_INTEGRATION.md`. Production remains disabled; no live integration has been verified.
4. **Pilot execution incomplete:** all 20 manufacturer candidates now have sourced required inputs. Exact eBay canonical identity, authorized real captures and listing checks remain required.
5. **Traffic/application packet incomplete:** hypothetical pilot planning is available, but Growth Check inputs and submission materials still need owner review.
6. **Commercial release not established:** Production evidence, manual review, relevant terms, and separate provider/release decisions remain mandatory.

References retained for owner verification before submission (not re-verified as part of the offline demo work):
- https://developer.ebay.com/api-docs/buy/buy-requirements.html
- https://developer.ebay.com/develop/get-started/get-started-on-a-buying-application
- https://developer.ebay.com/api-docs/static/gs_use-the-application-growth.html

## Offline input preflight

`npm run ebay:validate-cases -- <sandbox|production> <cases.json>` is free, offline, and needs no API keys.
The pilot runner uses the same preflight before checking credentials or making provider calls.
The placeholder template intentionally fails this check until replaced with researched inputs.

Production input preflight requires 20–50 unique case IDs and unique part/vehicle combinations,
positive integer quantities, real part names/numbers/manufacturers, and vehicle year/make/model/trim/engine.
Each Production case must carry `evidence.catalogVerified: true`, an HTTPS `evidence.sourceUrl`,
and `evidence.notes` describing the exact manufacturer catalog match and any constraints.
Only set the review flag after checking the cited source; the validator cannot verify the claim itself.

Missing trim is an input blocker, never invented: the current Taxonomy resolver requires it.
After all identity fields are supported by evidence, the eBay Taxonomy resolver must still resolve the exact canonical Trim/Engine and Browse must return COMPATIBLE. Offline input
validation does not prove current inventory, eBay availability, exact listing fitment, live pricing,
provider approval, or commercial release readiness.

## Manufacturer-sourced candidate set (2026-10-04)

`docs/EBAY_PILOT_RESEARCH_CASES.json` contains 20 distinct research cases across six Toyota/Ford models. All required manufacturer/vehicle fields are present and offline input preflight passes 20/20. This is **input completeness only**, not eBay approval, live compatibility, real price evidence or launch readiness.

The completion audit is recorded in `docs/EBAY_PILOT_SOURCE_AUDIT_2026-10-04.json` with source URLs, exact qualifications and source-file hashes.

- Two Corolla cases explicitly replace 2015 with **2014 Corolla LE / 2ZR-FE 1.8L four-cylinder**. The official 2014 vehicle description supports the trim/engine pairing. Toyota's oil chart covers 2014–2015 / 2ZRFE with `04152-YZZA6`; the cabin chart covers 2014–2019 and footnote 4 maps to warranty pollen filter `87139-07020`. The warranty qualification is preserved.
- Five 2018 F-150 cases use **Lariat**. Ford's US towing guide supports Lariat / 3.5L EcoBoost V6 and / 5.0L V8; a FordDirect factory window sticker independently supports a 2018 Lariat / 2.7L V6 EcoBoost configuration.
- Five 2018 Explorer cases use **Sport / 3.5L EcoBoost V6 / six cylinders**. Ford's US towing guide explicitly restricts this engine to Sport/Platinum and lists the applicable 4WD configuration.
- Eight earlier Camry/RAV4/Prius cases retain their existing evidence. Part numbers, quantities and left/right positions are unchanged.

```bash
npm run ebay:validate-cases -- production docs/EBAY_PILOT_RESEARCH_CASES.json
```

Expected result: **20/20 valid research inputs**. The exact canonical eBay Trim/Engine values are still unknown. The runtime resolver now refuses prefix-only trim matches and displacement/cylinder guesses; collect and independently verify exact canonical values before using them. Do not turn `Lariat`, `LE`, a catalog engine code or a unique approximate match into a verified vehicle claim.

Historical catalogs do not establish current supersessions, seller pack size, quantity availability, shipping destination eligibility or live offers. Review those in the authorized pilot. No provider calls, approval, account terms, live prices or commercial launch were implied by this source audit.
