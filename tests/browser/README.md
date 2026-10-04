# Synthetic browser integration tests

**SYNTHETIC TEST ONLY.** These checks are code-regression evidence, never eBay Sandbox capture, production-provider approval, live fitment evidence, market evidence, or release-review evidence. No credential setup or third-party navigation is needed.

## Run

From the repository root, use the pinned lockfile and bundled Chromium:

```sh
npm ci --ignore-scripts
npx --no-install playwright install --with-deps chromium
node --test tests/browser/*.test.mjs
```

The CI workflow owns these steps. For an already approved local setup, `WAFFER_TEST_CHROMIUM_EXECUTABLE` can name an existing Chromium executable. Tests never navigate protected Vercel/eBay pages. Missing Chromium fails the run; it is not silently skipped.

For browser-independent fixture-server checks:

```sh
node --test tests/browser/fixture-server.test.mjs
```

## What is real and what is fictional

- The real application HTML, CSS, browser modules, upload flow, VIN UI, analysis lifecycle, pricing retry/clear logic, and `lib/pricing-view.js` renderer run in Chromium.
- The only HTML injection is a visible “SYNTHETIC TEST ONLY” banner. There are no production-app source changes or browser-side replacements of pricing globals.
- The server stubs health, analysis, VIN, vehicle/catalog metadata and field-test metadata. It receives a generated fictional PDF. It does not call OpenAI, NHTSA, a catalog provider or eBay.
- `/api/price-compare` invokes the actual `createPriceCompareHandler`, eBay adapter and `lookupVerifiedPricing`. The adapter receives `tests/fixtures/ebay-runtime-fixture.mjs` as an injected in-memory transport, fictional credentials, and a controlled clock for the stale case. No release gate or real credential is enabled.
- The service worker is deliberately a test-only no-op. Production offline caching is outside this suite and cannot hide network requests here.
- The HTTP server binds only `127.0.0.1` on an ephemeral port. A literal static-file allowlist excludes secrets, server modules and test files. Browser request interception blocks and reports any request beyond that exact origin. Listing links are inspected but never clicked. The server has no external HTTP transport.
- All authored harness files live here; `.vercelignore` excludes `tests/` and generated reports from deployments.

## Coverage

At **1280×900** and **390×844**, tests cover:

1. Synthetic PDF upload through the real app; manufacturer/part/vehicle identity arrives at the actual pricing endpoint and matching response; visible USD prices and unresolved shipping/tax/pack/checkout totals.
2. Unknown shipping remains unknown; Sandbox is visibly test-only with no purchase link or savings.
3. Stale, empty, provider-error, wrong-brand and incompatible responses fail closed.
4. Arabic/RTL rendering and seller markup rendered safely as text.
5. Repeated pricing retries, result/details navigation, a newer analysis while an old response is held, clearing an estimate, and real browser Back/Forward after clearing.
6. Repeated EN→AR→EN→AR switches while the home form remains visible, including document/body overflow, a completed unavailable/HTTP 503 health warning, VIN optional text/placeholder, and the upload accessible label. Persisted-Arabic reload and Arabic reset-to-home are also checked. This catches offscreen-input RTL overflow before result navigation hides the home form.
7. No browser runtime/console errors, secret-bearing client responses, unexpected routes, external requests or document-level horizontal overflow.

The unavailable-health case permits only Chromium’s exact HTTP 503 resource notice for the same observed `/api/health` response. JavaScript exceptions, other URLs/statuses and application console errors still fail. The narrow exception has independent positive/negative tests.

Failures save a screenshot and concise fictional diagnostics to `test-results/` for CI artifact upload. No raw credentials or upload bodies are written into diagnostics. Native device rendering, real provider authorization, production checkout and actual supplier accuracy remain outside this isolated suite.
