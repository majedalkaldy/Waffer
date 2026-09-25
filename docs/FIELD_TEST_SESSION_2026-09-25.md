# Waffer live field-test session — 2026-09-25

The ten prescribed field scenarios were executed through the deployed Chrome UI using the built-in, clearly labelled synthetic estimate fixtures. OpenAI extraction and AutoParts VIN/catalog calls were live production calls; their responses were not mocked. Official results are in `docs/FIELD_TEST_RESULTS.json`.

The final draft passed validation with 10 PASS, 0 FAIL, and 0 PENDING. It was reviewed under the user's explicit authorization to adopt complete valid evidence after CI success. This is not public-beta approval.

| ID | Scenario | Result | Analysis ID / evidence | Analysis deployment |
|---|---|---|---|---|
| 1 | صورة JPG واضحة بدون VIN | PASS | 84e14159-de39-48cb-b028-26c10789a73e | edee7e3b |
| 2 | صورة هاتف أكبر من 3MB | PASS | 05d8dbcb-d93b-4b1b-a5aa-5d0bc91590cb | edee7e3b |
| 3 | PDF أقل من 3MB | PASS | cfc84c89-5517-47bb-8a93-3aafd2030398 | edee7e3b |
| 4 | PDF أكبر من 3MB | PASS | Client-side rejection | edee7e3b (UI) |
| 5 | VIN صحيح مع عرض قطع | PASS | a8aab5d5-dc5a-44a5-8aaa-97d78489f02a | edee7e3b |
| 6 | VIN غير صحيح | PASS | Client-side rejection | edee7e3b (UI) |
| 7 | عرض قطع مع أجور وخدمات | PASS | 793dbdb1-23f9-4860-a20e-c1775439e5e5 | b2c7f9f1 |
| 8 | فحمات أو أقراص أمامية وخلفية | PASS | 7c04e25a-e832-4b2c-8de3-058a023e4458 | b2c7f9f1 |
| 9 | عرض بلا أرقام قطع | PASS | aeae3532-09df-4e25-afa4-2b7c1fc86923 | edee7e3b |
| 10 | إجمالي مطبوع لا يطابق مجموع البنود | PASS | 67416e20-4145-4bdd-a853-5023b531174b | edee7e3b |

## Observed results

- Clear JPEG: air filter 180 + labor 80 = SAR 260; no VIN/catalog identity was applied.
- Oversized JPEG: 3,407,872 bytes became 71,790 bytes through real browser Canvas optimization; the extracted total was SAR 370.
- Small PDF: 799 bytes, no image optimization; total SAR 350.
- Oversized PDF and invalid VIN: immediate client rejection, with no paid analysis initiated for either rejection case.
- Live VIN: TOYOTA CAMRY Saloon (_V5_), 2.5 (ASV50_, ASV50R), Vehicle ID 9445. Oil-filter matching completed.
- Mixed estimate: one brake-pad part matched, with labor and alignment service skipped (2 non-part items).
- Front brakes after cache refresh: product 82 (disc) had 4 front-position-verified articles; product 402 (pads) had 5. Both requested part types matched and labor was skipped.
- No part numbers: 0 identified parts; no part numbers or market prices were invented.
- Mismatched total: printed SAR 300, calculated SAR 150, displayed difference SAR 150.00.

## Defects found and addressed

- PR #71 moved the diagnostic panel outside the hidden results screen, enabling preflight, fixture preparation, and rejection evidence before any analysis.
- PR #72 added the Arabic brake-pad names returned by the live model. Scenarios 7 and 8 were rerun; scenario 8 was rerun after the new service-worker cache activated and confirmed both disc and pad matches.
- Client startup previously announced readiness only inside the language-change handler. Initial metadata and saved drafts therefore appeared missing until language was changed. The readiness event now runs on initial module load; locale is set before rendering diagnostics, and the next unresolved selection is preserved.

## Evidence handling and limits

- The complete source draft is retained privately. Public VIN values are replaced with SHA-256 digests; request IDs, Vehicle ID, deployment commits, counters and review notes remain public. A digest links to the private original; it is not independent proof of provider correctness.
- Scenario 2 used a padded synthetic JPEG to exercise the size/compression boundary. A physical phone camera, iOS Safari, and a rear-axle case were not tested in this session.
- This session validates the prescribed scenarios for one supported vehicle and a small fixture set. It does not establish broad vehicle coverage, OCR accuracy on arbitrary customer quotes, or a reliable market-price comparison.
- `launchPhase` stays `field-test`. Trusted pricing, main-branch protection, WAF enforcement review, and Deployment Protection review remain separate gates.
- Production alias opened in Chrome without Vercel sign-in. The PR #71 preview redirected to Vercel SSO; no protection setting was changed.
