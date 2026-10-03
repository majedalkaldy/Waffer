# eBay access plan for Waffer

Updated: 2026-10-03

## Goal

Use eBay as Waffer's first U.S. live-offer source while keeping all eBay data in shadow mode until fitment, identity, stock, price, shipping, and source evidence pass Waffer's provider pilot.

## Environments

### Sandbox

Waffer supports an isolated eBay Sandbox path using:

- `EBAY_SANDBOX_CLIENT_ID`
- `EBAY_SANDBOX_CLIENT_SECRET`
- `EBAY_SANDBOX_SHADOW_ENABLED=true`

Sandbox does **not** activate user-facing verified pricing.

Use it to validate:
- client-credentials OAuth;
- Browse search;
- item detail retrieval;
- eBay Motors Taxonomy property resolution;
- `check_compatibility`;
- Waffer normalization and failure handling.

### Production

Production shadow mode requires all four gates:

- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_BUY_PRODUCTION_APPROVED=true`
- `EBAY_SHADOW_ENABLED=true`

Even with all four present, `verifiedMarketPricing` remains false until Waffer's provider Pilot and live review are separately passed.

## eBay approval path

According to eBay's current Buy API documentation, production access is restricted and requires an approved buying application. The practical sequence is:

1. eBay Developer account and application keysets.
2. eBay Partner Network / Buy API application where applicable.
3. Working Sandbox integration.
4. Application Growth Check for restricted Production APIs.
5. eBay review/support process and any required agreements.
6. Production keyset enabled for the approved Buy API use case.

## Waffer use case to present

Waffer is a U.S.-first automotive parts comparison product.

The intended eBay flow is:
- identify the user's vehicle;
- resolve canonical eBay Motors compatibility values;
- search eBay fixed-price parts listings;
- verify exact MPN/part identity;
- verify in-stock status;
- call eBay `check_compatibility`;
- display a traceable offer and send the user to eBay to complete purchase.

Waffer does not perform checkout itself in the current model.

## APIs currently prepared in code

- Identity API OAuth client-credentials token.
- Browse API:
  - item summary search;
  - get item;
  - check compatibility.
- Taxonomy API:
  - get compatibility properties;
  - get compatibility property values.

## Before requesting Production activation

Do not submit guessed traffic numbers. Prepare measured or explicitly estimated:
- peak hourly Browse calls;
- daily Browse calls;
- Taxonomy calls, noting category/vehicle caching;
- expected U.S. monthly users;
- expected click-through volume to eBay.

The application should also include screenshots or a testable Sandbox flow and explain that eBay Browse ordering is preserved within the eBay source.

## Waffer internal release rule

eBay Production approval is necessary but not sufficient.

After access is granted:
1. run 20–50 real shadow cases;
2. evaluate them with `npm run evaluate:price-provider-sample`;
3. manually verify fitment and offer totals;
4. keep `verifiedMarketPricing=false` until Waffer's own gate passes.
