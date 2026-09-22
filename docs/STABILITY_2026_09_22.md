# Tested client stability repair — 2026-09-22

Base commit: `03190bf0f721187c32ad5cd7e016bf7553c08b67`.

## Scope

This changes the browser application, catalog matcher, VIN resolver, translations, and service-worker shell policy. The server APIs, provider credentials, billing, payment integrations, security permissions, and production branch are not changed by preparing this repair branch.

The old page contained two `const axleGate` declarations in one `resetAnalysis` scope; that prevents the containing script from parsing. Its reset handler also referenced `matches` outside the matching event handler. The old matcher referenced an undefined `error` in the no-vehicle path. Its shortlist copied objects and then tested membership using the original object identities, allowing duplicates back into the list.

## Implemented changes

- Native, visible file input instead of nested programmatic click handlers.
- A parseable ES-module application with explicit per-run state and cancellation.
- VIN requests keyed by VIN; late results cannot overwrite a newer VIN. Multiple vehicle candidates require a deliberate user selection, not `vehicles[0]`.
- The analysis request reads make, model, and year after VIN resolution. Sharing uses the analysis snapshot, not later edits to the form.
- Reset cancels pending work, clears the file, vehicle identity, and results, and prevents late responses from repopulating the page.
- Catalog failures and deadlines are distinct from a genuine empty result. Per-run memoization and bounded workers reduce duplicate requests.
- Deduplication uses supplier plus part number (or article ID), not object identity. Three candidates remain a review shortlist, not a price ranking.
- Front/rear evidence is only taken from fitting-position criteria. An unverified position is not presented as a verified fit. Checking at most 10 candidates is explicitly described as a sample.
- Unsupported OEM/original claims based on an `oe` substring are removed.
- Category-name similarity is labeled as such; it is not a fitment probability. Repetitive self-reported "acceptance" boxes are replaced by technical diagnostics, not presented as proof of correctness.
- No verified price-source integration is added. Confirmed savings remain uncalculated.
- The client upload cap is 3 MiB before base64 encoding, leaving room for JSON below Vercel's documented 4.5 MB function payload limit. The existing server-side cap is unchanged in this repair.
- Request deadlines cover consumption of the response body, not just receipt of the headers.
- UI text uses a bilingual dictionary. Provider-returned document text is preserved, not falsely translated locally.
- Untrusted text is inserted using `textContent`, never `innerHTML`.
- The service worker only handles a same-origin shell allowlist. It does not cache API responses, external content, or unknown query strings; failed JavaScript requests never fall back to HTML. Only Waffer-owned obsolete caches are deleted.
- Changed modules have explicit versioned URLs to avoid reusing stale modules cached by a previous service worker.

## Tests executed

`npm test`: **45 passed, 0 failed**. No dependencies or paid provider requests are required. Coverage includes input validation, native-fetch stalled-body cancellation, catalog failures, front/rear filtering, deduplication, VIN request races, schema rejection, DOM IDs, JavaScript syntax, and service-worker allowlist/cache behavior.

`python tests/browser_test.py`: **19 passed, 0 failed**, using real Chromium DOM APIs, FileReader, native file inputs, and synthetic files. The app is loaded in memory and fetch is mocked. Scenarios include image/PDF transport, language switching, VIN variants, changing or clearing VIN, duplicate clicks, cancellation, reset during catalog lookup, invalid JSON/schema, rate limiting, storage denial, oversized files, and untrusted extracted text.

The browser harness flattens the app's acyclic module graph only for in-memory loading. Original module syntax and imports are also checked by the Node suite. This browser suite does **not** validate deployment routing, native browser ES-module loading, live external providers, or PWA installation.

An attempted local HTTP browser navigation was blocked by the execution environment (`ERR_BLOCKED_BY_ADMINISTRATOR`). The in-memory tests do not navigate to that URL, disable browser policies, or access external services. They are local UI tests, not a substitute for deployment testing.

## Remaining release gate

- Review the Vercel preview for native module loading, MIME types, and routing.
- Execute a real image and PDF through the existing analysis backend and compare every extracted line against the source documents.
- Verify the configured model exists and is accessible to this account; no model or billing setting is changed by this repair.
- Verify actual VIN/provider payload shapes, vehicle variants, and fitting-position responses.
- Validate backend schema enforcement before normalization, PDF cleanup on every exit path, and provider-request timeouts independently. Those server paths are not covered by this client repair's tests.
- Test actual PWA installation/update and offline reopening on target devices.
- Reauthorize the Vercel connection for the `waffer` scope before attempting protected deployment inspection. A current read returned `403 Forbidden`; do not bypass it or share tokens in chat.

This is a tested client repair candidate, not a claim that Waffer is ready for commercial launch.

## Run locally

Use Node 22 or newer for `npm test`. For browser tests, install Python Playwright and make Chromium available, then run `python tests/browser_test.py`. Set `CHROMIUM_PATH` to the browser executable and optionally `WAFFER_TEST_RESULTS` to the desired output folder. No API keys are required by either test suite.

Reference: https://vercel.com/docs/errors/function_payload_too_large
