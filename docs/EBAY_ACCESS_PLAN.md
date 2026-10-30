# eBay access plan for Waffer

Updated: 2026-10-30

## Goal

Use eBay as Waffer's first U.S. live-offer source while keeping all eBay data in shadow mode until fitment, identity, stock, price, shipping, and source evidence pass Waffer's provider pilot.

## Environments

### Sandbox

Waffer supports an isolated eBay Sandbox path using:

- `EBAY_SANDBOX_CLIENT_ID`
- `EBAY_SANDBOX_CLIENT_SECRET`
- `EBAY_SANDBOX_SHADOW_ENABLED=true`

Sandbox does **not** activate user-facing verified pricing.

Validated live on 2026-10-29:
- client-credentials OAuth: PASS (HTTP 200);
- eBay Motors Taxonomy compatibility properties: PASS (HTTP 200);
- Browse compatible-item search using eBay's documented Sandbox mock scenario: PASS (HTTP 200);
- compatibility result in mock search: PASS (`EXACT`);
- item-resource retrieval and `checkCompatibility` against the returned mock IDs: Sandbox limitation (HTTP 404 because those mock IDs are not retrievable item resources).

See `docs/EBAY_SANDBOX_LIVE_RESULT_2026-10-29.md`.

Sandbox remains test-only and does not activate verified pricing.

### Production

The standalone Production shadow adapter requires these four configuration inputs; their presence alone is not authorization or public-runtime readiness:

- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_BUY_PRODUCTION_APPROVED=true`
- `EBAY_SHADOW_ENABLED=true`

Configuration metadata confirms both Production credential variables are present, without inspecting their values. Presence does not authenticate a keyset or establish Buy API authorization. The owner reports Production key enablement and a marketplace account-deletion exemption; neither report is independently verified by this packet.

Even with all four inputs present, the public runtime additionally requires explicit provider mode and reviewed Production evidence under [runtime integration](EBAY_RUNTIME_INTEGRATION.md). `verifiedMarketPricing` remains disabled until the provider pilot, evidence review and release controls are satisfied.

## eBay approval path

According to eBay's current Buy API documentation, production access is restricted and requires an approved buying application. The practical sequence is:

1. eBay Developer account and Sandbox keyset. **Completed.**
2. Working Sandbox OAuth/Taxonomy/Browse integration. **Completed on 2026-10-29.**
3. EPN membership and campaign are confirmed; AI/use-case review remains pending. Membership is distinct from Buy API Production authorization.
4. Application Growth Check for restricted Production APIs: owner-reported not submitted; traffic inputs and supporting evidence remain incomplete.
5. eBay review/support process and any required agreements.
6. Verify Production keyset entitlement for the approved Buy API use case. Owner-reported key enablement is not independent confirmation of this entitlement.

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

Do not submit guessed traffic numbers. Prepare measured or explicitly approved, clearly labeled planning assumptions:
- peak hourly Browse calls;
- daily Browse calls;
- Taxonomy calls, noting category/vehicle caching;
- expected U.S. monthly users;
- expected click-through volume to eBay.

Use the [dossier evidence checklist](EBAY_APPLICATION_DOSSIER.md#technical-growth-check-preparation-status-2026-10-30) to separate confirmed metadata, owner reports, pending approvals and missing real-run evidence. A null committed release sample does not prove no data is stored: the pilot CLI can write JSON captures, so retention/deletion handling needs explicit review.

The application should also include screenshots or a testable Sandbox flow and explain that eBay Browse ordering is preserved within the eBay source.

## Waffer internal release rule

eBay Production approval is necessary but not sufficient.

After access is granted:
1. run 20–50 real shadow cases;
2. evaluate them with `npm run evaluate:price-provider-sample`;
3. manually verify fitment and offer totals;
4. keep `verifiedMarketPricing=false` until Waffer's own gate passes.
