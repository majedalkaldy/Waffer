# Waffer stability repair — 2026-09-22

## Baseline

Reviewed repository head: `ae14dfd3ac3c1925d0d6c6ae284d5bbc3a27c2eb`.
Four old defects were reproduced using the exact relevant logic excerpts, not a full baseline deployment:

1. `resetAnalysis` declared `const axleGate` twice in the same scope, a parse-time SyntaxError that prevents the main inline script from executing.
2. The matcher's no-vehicle branch referenced an undeclared `error` variable.
3. Shortlisting compared original objects against cloned objects with `includes`, allowing duplicate articles.
4. An `oe` substring test mislabeled `Toe link` as a potential OE part.

## Repair scope

The active browser path is now `index.html` → `ui/app.js` → `lib/client-http.js`, `lib/client-core.js`, and `lib/client-matcher.js`. The old inline controller and old global VIN/matching scripts are no longer loaded. Legacy source files remain in the repository for review and rollback; this report does not claim their old implementations were repaired.

- A native, labeled file input avoids recursive click forwarding. Canceling the chooser preserves the selected file.
- Uploads are limited to 3 MiB before base64 encoding; the serialized request also has a byte guard. The existing server remains unchanged.
- VIN lookup is scoped to the current VIN. Old responses cannot overwrite a new vehicle. Multiple catalog candidates require user selection; none is selected automatically.
- Analysis uses a snapshot taken after VIN resolution. Clearing VIN or resetting analysis clears the associated identity.
- Cancel/reset invalidates the run and aborts client requests. Server/provider work may already have started; cancellation is not a guarantee of zero cost or server cancellation.
- Timeouts cover response-body consumption. Failed requests remain distinct from empty results.
- Match results retain source indexes. Labor, service, fee and unclassified lines are not sent as physical parts.
- Criteria lookups use at most three concurrent requests and inspect at most twelve distinct candidate articles per line. This sample is not the entire catalog.
- Front/rear ambiguity (including Arabic conjunctions) and missing fitting-position evidence do not count as verification. Deselecting a VIN variant clears its identity before matching.
- Up to three unique supplier/part candidates are shown. No original/OEM or price-ranked claims are inferred.
- Scores remain labeled as model estimates, not calibrated probabilities or test pass rates. Source totals are not claimed to be arithmetically verified.
- Diagnostic details are collapsed instead of repeatedly displaying unvalidated readiness counters.
- The service worker restricts caching to named, same-origin static shell files; API calls, query-bearing URLs and other origins are excluded.

## Executed checks

| Check | Result | Scope |
|---|---|---|
| Node.js tests (`npm test`, Node 22.16.0) | 52 passed; 0 failed | Pure contracts, matching, cancellation, deadlines, concurrency, cache exclusions |
| Browser DOM scenarios (`python tests/browser_smoke.py --memory`) | 23 passed; 0 failed | Chromium, own HTML/JS loaded in memory, mocked fetch; no external calls |
| JavaScript syntax checks | Passed | All changed JavaScript modules and service worker |
| Full HTTP browser scenarios | BLOCKED; not executed | Navigation returned `ERR_BLOCKED_BY_ADMINISTRATOR`; browser policy was not changed |
| Authenticated Vercel deployment inspection | BLOCKED | Vercel returned 403 for team `waffer`, explicitly requiring reauthentication |
| Real OpenAI extraction and live VIN/catalog accuracy | NOT TESTED in this batch | No real estimates or paid provider requests were used |
| Physical iPhone/Android or Safari/WebKit | NOT TESTED | Chromium viewport tests are not device certification |

The in-memory browser runner removes import/export syntax only to load the local modules together in an isolated page. This checks DOM behavior but does not verify production module delivery, routing, TLS, CORS, service-worker installation, or platform request limits.

## Reproduction

```sh
npm test
# Requires Python, playwright, and Chromium; set CHROMIUM_PATH when needed.
python tests/browser_smoke.py --memory
# In an environment that permits local HTTP navigation:
python tests/browser_smoke.py
```

All fixtures are synthetic. Neither test command requires API keys or calls paid providers. No new database, payment gateway, account service, or paid plan has been added. Existing server-side analysis, pricing, credentials and market configuration have not been changed by this repair.

## Release condition

This is a tested repair candidate, not approval for commercial launch. Confirm production delivery and real image/PDF → analysis → optional VIN → catalog scenarios after authorized Vercel access is restored. Review extracted source data and actual fitment evidence manually before any pricing or purchase recommendation.
