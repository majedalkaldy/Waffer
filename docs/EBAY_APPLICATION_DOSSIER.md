# Waffer — eBay Buy API Application Dossier

Prepared: 2026-10-03

This document is a ready-to-use application packet. It does **not** authorize acceptance of eBay contracts, policies, or legal terms on behalf of the account owner.

## Application identity

- Product: **Waffer**
- Primary marketplace: **United States / EBAY_US**
- Product type: automotive parts discovery, fitment verification, and price comparison
- Checkout model: Waffer sends the user to eBay to complete the purchase; Waffer does not perform checkout in the current model.
- Primary APIs requested:
  - Browse API
  - Taxonomy API
- Current stage: field-test / Sandbox-ready architecture
- Production verified pricing: disabled until Waffer's own provider pilot passes.

## Business model answer

Waffer helps U.S. vehicle owners identify compatible replacement parts and compare traceable offers. The user identifies a vehicle by VIN or vehicle attributes. Waffer normalizes vehicle identity using NHTSA vPIC and the existing catalog layer, resolves eBay Motors compatibility values from the eBay Taxonomy API, searches eBay fixed-price listings through Browse API, verifies exact part identity, stock, and vehicle compatibility, and then links the user to eBay to complete purchase.

Waffer does not scrape eBay, does not impersonate eBay, and does not complete transactions outside eBay. eBay is presented as an identifiable source and the eBay source ordering is preserved within the eBay result set.

## End-to-end user flow

1. User identifies vehicle by VIN or Year / Make / Model / Trim / Engine.
2. NHTSA vPIC enriches U.S. vehicle identity.
3. Existing catalog data resolves part identity / OEM / cross-reference where available.
4. Waffer searches eBay Browse using the requested part number and description.
5. Candidate listing item details are retrieved.
6. Listings without exact MPN/part identity or explicit stock are rejected.
7. For the listing category, Waffer resolves canonical Year / Make / Model / Trim / Engine using eBay Motors Taxonomy tree 100.
8. Waffer calls Browse checkCompatibility.
9. Only a COMPATIBLE result can become a shadow verified offer.
10. Waffer normalizes item price + known mandatory shipping and preserves seller, source URL, and checked-at time.
11. User follows the eBay link to complete purchase on eBay.

## APIs and methods

### Identity API
- OAuth 2.0 client credentials application token.

### Browse API
- item_summary/search
- getItem
- checkCompatibility

### Taxonomy API
- getCompatibilityProperties
- getCompatibilityPropertyValues

## Marketplace and category behavior

- Marketplace header: EBAY_US.
- Motors compatibility tree: 100.
- Compatibility values are category-specific.
- Waffer fails closed when Trim or Engine is ambiguous.
- NHTSA display strings are never assumed to be valid eBay compatibility values.

## Data retained / displayed

Waffer needs to process:
- vehicle identity supplied by the user;
- requested part number / part description;
- eBay listing identifier;
- seller display name;
- item price;
- known shipping amount;
- stock/availability evidence;
- compatibility status;
- eBay source URL;
- timestamp of verification.

Waffer does not require eBay account passwords or buyer checkout credentials for the current Browse-only model.

## Security

- eBay client secret is stored server-side only.
- No API secret is included in browser JavaScript.
- Sandbox and Production credentials are isolated.
- Production use requires an explicit environment flag in addition to credentials and eBay approval.
- Shadow readiness does not enable user-facing verified pricing.
- Request rate controls and timeouts already exist in Waffer.
- Waffer keeps verified pricing disabled until internal pilot evidence passes.

## Sandbox demonstration

The project contains:
- eBay Sandbox OAuth/API mode;
- eBay Taxonomy resolver;
- Browse adapter;
- checkCompatibility integration;
- eBay Sandbox readiness gate;
- batch pilot runner;
- regression tests.

Commands after Sandbox credentials are configured:

```bash
npm run ebay:validate-cases -- sandbox docs/EBAY_PILOT_CASES.json
npm run ebay:readiness
npm run ebay:pilot -- sandbox docs/EBAY_PILOT_CASES.json ebay-sandbox-output.json
```

Sandbox evidence is explicitly prevented from passing Waffer's Production pricing gate.

## Production shadow pilot

After eBay approves Production Buy API access:

```bash
npm run ebay:validate-cases -- production <20-50-real-cases.json>
npm run ebay:readiness
npm run ebay:pilot -- production <20-50-real-cases.json> ebay-production-sample.json
npm run evaluate:price-provider-sample -- ebay-production-sample.json
```

Waffer will not enable verified user-facing pricing unless the Production sample passes the internal gate and manual review.

## Application Growth Check call-volume answer

Do not invent traffic numbers.

Populate:
`docs/EBAY_GROWTH_CHECK_INPUT.json`

Then run:

```bash
npm run ebay:estimate-volume -- docs/EBAY_GROWTH_CHECK_INPUT.json
```

The report produces estimated daily and peak-hour calls for:
- Browse search
- Browse getItem
- Browse checkCompatibility
- Taxonomy getCompatibilityProperties
- Taxonomy getCompatibilityPropertyValues

Use the measured/approved output in eBay's Growth Check form.

## Sandbox testing instructions for eBay Developer Support

1. Open the Waffer Sandbox build supplied in the support case.
2. Use a supported test vehicle and test part case supplied with the ticket.
3. Enter the vehicle identity.
4. Trigger the part comparison flow.
5. Observe that Waffer resolves eBay taxonomy fitment before compatibility checking.
6. Observe source attribution and link-out behavior.
7. Confirm no Production data or real checkout occurs in Sandbox.

A concrete Sandbox URL and test case must be inserted only after Sandbox credentials have been configured and the flow has passed.

## Production support-ticket subject

Use eBay's documented format:

**Buy API Production Access (<EPN registered eBay user ID>)**

Include:
- EPN registered eBay user ID;
- step-by-step Sandbox test instructions;
- Buy API / EPN approval email as attachment;
- Waffer end-to-end flow;
- screenshots or mocks;
- data-flow diagram;
- Growth Check traffic estimates.

## Current approval blocker

The software side is prepared. The remaining external steps require the account owner to:
1. sign in / create the eBay Developer account;
2. create Sandbox keyset;
3. join or confirm eBay Partner Network where required;
4. submit the Buy API application / Growth Check;
5. accept or sign any eBay policies/contracts personally.

Official references:
- https://developer.ebay.com/api-docs/buy/buy-requirements.html
- https://developer.ebay.com/develop/get-started/get-started-on-a-buying-application
- https://developer.ebay.com/api-docs/static/gs_use-the-application-growth.html

## Offline input preflight

`npm run ebay:validate-cases -- <sandbox|production> <cases.json>` is free, offline, and needs no API keys.
The pilot runner uses the same preflight before checking credentials or making provider calls.
The placeholder template intentionally fails this check until replaced with researched inputs.

Production input preflight requires 20–50 unique case IDs and unique part/vehicle combinations,
positive integer quantities, real part names/numbers, and vehicle year/make/model/trim/engine.
Each Production case must carry `evidence.catalogVerified: true`, an HTTPS `evidence.sourceUrl`,
and `evidence.notes` describing the exact manufacturer catalog match and any constraints.
Only set the review flag after checking the cited source; the validator cannot verify the claim itself.

Missing trim is an input blocker, never invented: the current Taxonomy resolver requires it.
After all identity fields are supported by evidence, the eBay Taxonomy resolver must still resolve the exact canonical Trim/Engine and Browse must return COMPATIBLE. Offline input
validation does not prove current inventory, eBay availability, exact listing fitment, live pricing,
provider approval, or commercial release readiness.

## Manufacturer-sourced candidate set (2026-10-03)

`docs/EBAY_PILOT_RESEARCH_CASES.json` contains 20 research candidates, 18 distinct part numbers,
across six Toyota/Ford models. Each cites its primary manufacturer application chart/manual.
Five Camry/RAV4 cases additionally cite Toyota's US vehicle specifications for LE trim and engine
dimensions. Fifteen cases deliberately retain unresolved trim or engine dimensions.

Run the offline gap report:

```bash
npm run ebay:validate-cases -- production docs/EBAY_PILOT_RESEARCH_CASES.json
```

Expected result: **invalid batch**, with 15 missing-trim cases. This is useful research preparation,
not a passed 20-case pilot. Complete the gaps using verifiable vehicle evidence before provider calls.
Five structurally complete candidates also still require live eBay Taxonomy and listing compatibility.
Historical source dates are retained; current part-number supersessions and seller package quantities
must be checked during the authorized pilot. No forecast values or live prices were invented.
