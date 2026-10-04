# Waffer — Synthetic Review Demo

Prepared: 2026-10-04

## Purpose and evidence boundary

`/review-demo/` is an isolated, static, interactive reviewer demonstration. All vehicles, parts, sellers, prices, and evidence shown there are fictional fixtures. Prominent **synthetic** labels must remain visible when demonstrating or capturing the page.

The route illustrates five result states: success, empty results, provider error, stale evidence, and uncertain fitment. Its success state is an illustrative fixture outcome, not a verified quotation, real price, available inventory, actual vehicle compatibility, or a recommendation to buy.

It is **not eBay Sandbox API evidence**. It does not authenticate, call eBay, run a live VIN/catalog/analysis lookup, establish Production approval, or pass a launch gate. No checkout or listing link-out is offered. Do not use it to enter customer information, a real VIN, a repair quotation, passwords, API keys, or other personal data.

## Opening the reviewed build

Use the `/review-demo/` path on the exact build supplied for review. No provider credentials or provider environment flags are required. An approved deployed URL, if supplied separately, must be checked against that build; this document does not assert that the route has been deployed.

For a local static inspection from the repository root:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/review-demo/`. Stop the local server after the review. This serves static assets only; it does not run Waffer's serverless `/api/` handlers. Do not interpret failed API requests on this static server as deployed-app failures.

Normal same-origin HTML/CSS/JavaScript asset loading is expected. The demo's scenario interactions must not make remote service calls, invoke `/api/` endpoints, or transmit fixture/input data. Its runtime is separate from normal app bootstrapping and the real provider registry.

## Bounded reviewer walkthrough

Allow about ten minutes. Record the reviewed revision/build, browser, viewport, each observed result, and any failure. These are test instructions and acceptance criteria, not a claim that a browser test has already passed.

1. **Initial state and disclosure.** Open `/review-demo/` directly. Confirm the controls are labeled **Fictional vehicle**, **Fictional part**, **Quantity** (1–4), and **Scenario**, with **Run synthetic comparison** and **Reset** buttons. Confirm the synthetic-data notice is prominent before starting a run. Confirm vehicle/part data is marked fictional and the page does not request a login, upload, API key, or payment. There must be no eBay purchase/link-out control.
2. **Success fixture.** Select **Simulated match** (`match`) and click **Run synthetic comparison**. Inspect the fictional vehicle/part context and illustrative offer. For the default fictional oil filter and quantity 1, expect an invented $18 item amount plus $4 fictional shipping, a $22 USD subtotal. Change quantity to 2 and rerun: expect $40 USD, with fictional shipping still $4. The page must explain that tax is not modeled, stock/real fitment are unverified, and no savings claim or purchase is available. Confirm every amount remains labeled illustrative.
3. **Empty fixture.** Select **No results** (`empty`) and run it. Expect a clear no-results state with no surviving success offer or positive saving from the prior run.
4. **Error fixture.** Select **Provider error** (`error`) and run it. Expect a recoverable error explanation rather than a fabricated offer or indefinite loading state. Immediately run success again; the previous error must not leave the interface stuck.
5. **Stale fixture.** Select **Stale data** (`stale`) and run it. Expect the illustrative offer to be withheld: the scenario describes evidence 72 simulated hours old against a demo 48-hour window, and shows no price. This is a scripted UX scenario, not a live timestamp observation or a production freshness calculation.
6. **Uncertain-fitment fixture.** Select **Fitment uncertain** (`uncertain`) and run it. Expect a clear compatibility blocker; uncertain fitment must not be upgraded to verified or shown as safe to buy.
7. **Repeated runs and interruption.** Run success twice, then switch between error, empty, and success. If a run has a visible pending stage, try a second activation and a scenario change while pending. Expect at most one current result, no duplicated cards, no stale result overriding the latest selection, and no permanently disabled controls. Disabled controls that prevent duplicate activation are acceptable.
8. **Reset and revisit.** Reset after success, after a blocked/error state, and during the short pending stage. Expect cleared results and initial controls restored: the fictional 2020 Example Sedan, fictional oil filter, quantity 1, and Simulated match. Synthetic notices must remain intact. Run another scenario after reset. Reload the route and use browser Back/Forward once; confirm labels and usable controls persist and no previous result leaks into the normal app.
9. **Mobile and keyboard.** Repeat success, uncertain fitment, and reset at a narrow mobile viewport (approximately 375 CSS pixels wide). Confirm notices, controls, warning text, and amounts are readable without horizontal overflow. Use Tab and Enter/Space to operate the controls; confirm visible focus and accessible labels. Record whether testing used browser emulation or a real device; do not report emulation as real-device evidence.
10. **Network and isolation.** With the Network panel open, clear the log after static assets load and run all five scenarios plus reset once. Expect no `/api/`, eBay, OpenAI, NHTSA, catalog, analytics, or other remote service requests from the demo. Inspect the route for checkout/listing links. Any such call/link is a failure requiring investigation, not permission to log in or enable credentials.

## Normal app fail-closed regression

The demo must not wire a provider into the normal app or change pricing activation. In the source, `api/price-compare.js` continues to call the generic provider layer; `lib/price-provider.js` keeps `MARKET_PRICE_PROVIDERS` empty. The CLI eBay adapter and its readiness flags are separate. Fictional review fixtures must not be imported by the normal app or normal API handlers.

Run the offline regression suite for the reviewed revision:

```bash
npm run check
npm test
npm run gate
```

Record each command's actual result. A failing or unrun release gate must stay a failure or an unverified stage; a synthetic UI pass cannot turn it into a launch pass. No provider credentials are needed for offline regression tests.

For normal-app behavior, use an authorized API-capable local/preview deployment or the existing offline API-handler tests. A valid same-origin normal pricing request must still return:

- `status: "WAITING_FOR_VERIFIED_PRICE_SOURCE"`
- `pricingProvider.status: "NOT_CONFIGURED"`
- null `marketPrice` values and `bestOffer`
- `saving.amount: null` and `saving.status: "NOT_CALCULATED"`

Requests rejected earlier for method, provenance, rate limits, or missing identity must retain those protections. Do not bypass them to obtain a success response. Do not upload a real quotation or run paid analysis/catalog calls merely to check this regression. The static server above cannot execute this API check.

If a normal-app entry point to the demo is supplied, confirm it navigates to the isolated route. Returning to `/` must restore the ordinary app, without fixture results or synthetic pricing mixed into real analysis.

## Relationship to Sandbox, Production, and application materials

- **Synthetic route:** deterministic fictional UI scenarios; no provider access or external integration evidence.
- **Credentialed Sandbox run:** future authorized OAuth/API integration checks using genuine Sandbox inputs/output. Sandbox keyset and successful API-run status are unverified here. Sandbox results still cannot establish Production market prices.
- **Production shadow pilot:** separate owner-verified approval and authorized 20–50-case real-data process, followed by internal evaluation and manual review. Public provider integration and release approval remain additional gates.

Keep screenshots/captures clearly labeled “synthetic review demo.” Do not remove warnings, present fixture amounts as current market prices, substitute screenshots for Sandbox logs, or describe the demo as the full live quotation-to-eBay flow. See [the application dossier](EBAY_APPLICATION_DOSSIER.md) for implemented versus planned components and outstanding blockers.

## Offline call-volume planning

The independent planning artifact `docs/EBAY_PILOT_VOLUME_PLAN.json` models hypothetical 20–50-case pilot scenarios:

```bash
npm run ebay:estimate-pilot-volume -- docs/EBAY_PILOT_VOLUME_PLAN.json
```

This command is offline. Its assumptions/output are not measured traffic, a live pilot, a validated production forecast, or an approved Growth Check submission. Running the synthetic page generates no eBay API traffic to measure.

Current illustrative batch totals, including explicit OAuth budgets:
- 20 cases, one pass: **221 calls** (3 candidate items, 2 eligible checks, 1 category per attempt; 1 OAuth request).
- 35 cases, one pass plus one full manual rerun each: **1,402 calls** (5 candidates, 4 eligible checks, 2 categories per attempt; 2 OAuth requests).
- 50 cases, cold-category stress budget with one full manual rerun each: **7,200 calls** (10 candidates/checks/categories per attempt; 100 OAuth requests).

The current adapter reuses category Taxonomy resolution only within a single lookup. No cross-case or cross-run cache reuse is assumed. Each fully resolved category is budgeted as one properties request plus four values requests. Reruns are a planning allowance for a complete **manual** rerun, not implemented automatic retries. Rejections or the first accepted offer may stop candidate processing early. Token expiry, process restarts, or additional reruns require revisiting the plan; these totals are not rate-limit guarantees. If the whole batch runs within one hour, its hourly call total equals the batch total.

`docs/EBAY_GROWTH_CHECK_INPUT.json` remains an incomplete zero-placeholder application input. It must not be treated as a completed forecast or silently populated from the demo fixtures. Real account approval, real case evidence, reviewed planning assumptions, and submission authorization remain separate.

## Reviewer report checklist

Record the five scenario outcomes, repeat/reset results, desktop/mobile evidence, keyboard findings, network/isolation findings, normal pricing regression, exact build/revision, and the actual automated checks run. Note any test that was blocked or not run. A concise report with retained synthetic labels is sufficient; do not include credentials or personal data.
