# Offline eBay request accounting

These estimators are hypothetical planning tools, not traffic measurements, runtime
ceilings, provider approval, or a Growth Check submission. They make no API calls.
The fixed Sandbox compatibility mock is not the Production lookup modeled here.

## Actual implementation accounted for

`ebay-us.js` inspects at most ten returned candidate items. Each distinct category
can need one Taxonomy properties request and four value requests. Category results
are reused **inside a lookup only**, not across users, cases, or process restarts.
A successful early match or rejection can reduce work. Non-OAuth HTTP requests can
retry once for qualifying transient responses; timeouts, cancellation, long
Retry-After and terminal failures do not necessarily retry. OAuth has no automatic
HTTP retry. Token reuse depends on instance lifetime, expiry and invalidation.

## Daily model

Existing `daily` and `peakHourly` output fields remain **baseline API counts**, for
backward compatibility. They exclude OAuth and automatic retries. Use
`dailyRequestBudget.total` for the scenario's all-request budget. The breakdown
contains initial API requests, per-endpoint automatic retries, and OAuth requests.

Additional explicit inputs:
- `taxonomyCategoriesPerSearch`: average distinct categories considered per search,
  positive and at most ten and no greater than candidates per search. Multiplied
  by `taxonomyCacheMissRate` to estimate full resolutions. Use miss rate 1 unless
  supplied canonical category inputs justify a lower value; no shared cache exists.
- `automaticRetryRate`: number in [0,1], fraction of initial non-OAuth requests
  budgeted to retry once. Each endpoint's retry count rounds up separately. Use 1
  for a conservative one-retry-per-request scenario, not as measured retry rate.
- `oauthTokenRequests`: nonnegative safe integer, an independent daily request
  budget. Do not infer a one-token-per-search ceiling; expiry, invalidation and
  process behavior require explicit planning. Zero means deliberately no OAuth
  requests budgeted, not guaranteed token reuse.

Omitting these new inputs preserves legacy category/retry/OAuth defaults 1/0/0,
with `planningInputsComplete:false`. Such output is not a complete forecast.
`planningInputsComplete:true` means inputs supplied, **not** owner approval or
conservative assumptions. Values still require review.

`peakHourlyRequestBudget` allocates baseline endpoint traffic using the provided
peak share, adds endpoint retries, and conservatively puts **all daily OAuth
requests** in that hour. The share is an assumption, not a maximum burst limit.
Neither daily nor peak scenarios constrain runtime; extra manual runs require
additional input volume. Overflow is rejected rather than returning unsafe totals.

## Pilot model

`calls` retains the baseline including OAuth, excluding automatic HTTP retries.
`requestBudget.total` includes automatic retries without multiplying OAuth.
`attemptsPerCase` represents complete manual reruns, not automatic HTTP retries.
The documented plans set `automaticRetryRate:1` explicitly:

| Cases | Baseline including OAuth | With automatic retry budget |
| --- | ---: | ---: |
| 20 | 221 | 441 |
| 35 | 1,402 | 2,802 |
| 50 | 7,200 | 14,300 |

The existing OAuth budgets 1/2/100 are hypothetical, not demonstrated sufficient
for a future run. There is no imposed one-token-per-attempt cap. More token
requests, more attempts or other endpoints require revising the plan. If all work
occurs in one hour, use the full batch request budget for that hour.

## Missing Growth Check inputs

Daily active users, searches per user, inspected candidates, eligible-candidate
fraction, category diversity/canonical-input rate, retry assumptions, OAuth
budget and peak concentration still need measured or explicitly approved planning
inputs. The Growth Check input file remains intentionally incomplete. No measured
traffic, provider entitlement, or approval is invented by these changes.
