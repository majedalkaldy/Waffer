# Data processing boundaries

Revised 2026-10-06. This records implemented controls and unresolved verification, not a privacy, security or legal compliance certification.

## Estimate analysis

- Waffer sends the uploaded estimate and entered vehicle context to OpenAI. Images are inline inputs; PDFs use the Files API with a generic filename. The bilingual notice asks people to redact unnecessary contact/payment information and to upload only estimates they may share, not retailer API datasets. Content origin is **not automatically verified**.
- The single foreground Responses request explicitly sets `store: false`. This disables stored response application state, **not all provider retention**. OpenAI account/project data controls, abuse monitoring and any separate retention agreement have not been verified. No account settings were changed.
- PDFs request the documented minimum file expiry of one hour, then Waffer attempts deletion before replying. Cleanup makes at most three attempts inside the existing five-second total budget, retries transient failures and validates the deletion response. A timeout, unknown upload ID or failed deletion is reported as `UNCONFIRMED` in response metadata and to the user. A provider expiry request is not proof that deletion occurred. No durable retry queue is added; process termination, an unreadable upload response or provider failure can leave deletion unconfirmed.
- Server logs do not include file IDs, upload filenames, raw provider errors or request contents. There is no paid model retry on invalid output.
- Document/vehicle content is untrusted user input, separate from the system instructions. The model has no tools. A strict JSON schema and local type/length/key validation reject malformed, incomplete, refused and extra-field outputs. These controls do not prove factual accuracy or perfect resistance to prompt injection; tests use mocked outputs and injected text as contract fixtures only.

## Provider separation and browser lifetime

- eBay data does not enter the automatic OpenAI request path. The application does not reanalyze retailer responses with the model.
- Expired provider responses are removed from browser application state after five minutes measured from provider check time; the summary is recomputed, and reset removes the data immediately. Rendering, export and tab-resume events also prune data. Frozen/background tabs cannot execute JavaScript until resumed. Expiry never starts an automatic paid refetch; the person can explicitly retry.
- Empty/error results retain only transient allowlisted status metadata, not echoed VIN or provider payloads.
- API responses remain `no-store`; the service worker does not cache API calls. This does not delete copies users or external infrastructure already retained.
- Ordinary eBay links make no affiliate-earnings claim. A URL containing tracking/affiliate parameters gets an adjacent conditional compensation disclosure and `sponsored` link relation. This does not establish eBay Partner Network membership or production approval.

## Diagnostic and field-test capture

- Default diagnostic exports are allowlisted summaries: no VIN, vehicle description, user notes, OCR strings, raw amounts, full analysis or seller/listing responses. Correlation IDs, counts, booleans and allowlisted statuses remain useful for investigation.
- New local field drafts use separate minimized storage keys. Text notes are not retained; numeric totals are retained only for scenario 10's arithmetic-mismatch evidence. Raw VIN is never retained. Browser preflight exports also use an allowlist.
- Minimized drafts cannot satisfy the promotion gate. Scenarios needing original VIN or note evidence require a separately reviewed evidence process; the code does not weaken the existing reviewed-evidence validator. Historical checked-in evidence/fixtures were not scrubbed or rewritten.
- Legacy v1 local-storage drafts are neither read into new reports nor silently deleted/overwritten. They remain on the original device until the person explicitly removes them (for example by clearing this site's browser data). Changing code does not scrub prior downloads or public Git history.

## Release and rollback

All production-provider activation gates stay unchanged and disabled unless the existing explicit approval, configuration and real-pilot requirements pass. No live OpenAI, eBay, catalog, checkout or credentialed sandbox calls are used by these regression tests. Reverting this change restores the previous code; it does not restore expired in-memory data or alter provider retention settings.

## Official references checked

- [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)
- [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5.6 Luna structured-output support](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [File expiry parameters](https://developers.openai.com/api/reference/resources/files/methods/create)
- [File deletion result](https://developers.openai.com/api/reference/resources/files/methods/delete)
