# Waffer US-first implementation plan

Decision date: 2026-10-03

## Product direction

Waffer is a global auto-parts comparison engine with the United States as the primary launch market and Saudi Arabia retained as a secondary market.

Primary U.S. flow:

1. Identify vehicle by VIN or Year / Make / Model / Trim / Engine.
2. Resolve exact part identity and normalized part numbers.
3. Verify fitment against the vehicle context.
4. Query trusted retailer/provider integrations.
5. Normalize offer economics: item price, mandatory shipping/fees, availability, seller, delivery evidence where provided.
6. Rank only comparable verified offers.
7. Send the user to the retailer for purchase.

The current repair-estimate analyzer remains a useful acquisition and verification surface during the transition.

## Data-source roles

- **NHTSA vPIC:** U.S. VIN enrichment. Not a price source.
- **AutoPartsAPI / TecDoc:** catalog identity, OEM/cross-reference and existing vehicle-to-part matching. Not a verified retail price source.
- **eBay Browse API / eBay Motors:** first official U.S. live-offer integration candidate.
- **Additional retailers/affiliate feeds:** added only through documented APIs, feeds, or explicit partnerships.

## Trust rules

Waffer must not:
- scrape a retailer and label the result trusted without authorization;
- infer exact fitment from insufficient vehicle attributes;
- rank by sticker price when mandatory shipping/fees make offers non-comparable;
- call a calculated saving “verified” unless the offer contract passes;
- present a single retailer as the full U.S. market.

## Delivery phases

### Phase 1 — US market foundation
- US / en-US / USD is the primary client context.
- Saudi market configuration remains supported.
- Existing catalog, VIN, pricing-contract, rate-limit and abuse protections remain intact.
- Pilot validator defaults move to US / USD.

### Phase 2 — eBay shadow adapter
- Obtain official eBay application credentials.
- Implement server-side OAuth token handling.
- Search eBay Motors with U.S. marketplace context.
- Normalize part identity, compatibility evidence, item price, shipping, seller, source URL and checked-at time.
- Do not expose “verified savings” during shadow mode.

### Phase 3 — stronger vehicle identity
- Enrich VIN with U.S. Year/Make/Model/Trim/Engine fields.
- Map enriched identity to the catalog identity layer.
- Require enough vehicle attributes for exact compatibility checks.

### Phase 4 — multi-retailer comparison
- Add at least one additional authorized U.S. retailer/feed.
- Calculate comparable total delivered cost.
- Add delivery-time and seller-reliability signals.
- Introduce “Waffer Best Deal” only after the scoring inputs are reliable.

## Release gate

Production promotion requires:
- regression CI passing;
- preview deployment healthy;
- no degradation to the Saudi market path;
- provider pilot thresholds passing before verified pricing is enabled;
- no secret keys exposed to browser code.
