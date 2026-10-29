# eBay Sandbox live integration result

Captured: 2026-10-29T18:35:39Z  
Environment: Vercel Preview  
Marketplace: EBAY_US  
Credentials: Sandbox application keyset (values not recorded)

## Result

| Stage | Result | Notes |
| --- | --- | --- |
| OAuth client credentials | PASS | HTTP 200, application token issued, `expires_in=7200` |
| Motors Taxonomy compatibility properties | PASS | HTTP 200; returned Year, Make, Model, Trim, Engine |
| Browse compatible-item search | PASS | HTTP 200 using eBay's documented Sandbox mock scenario |
| Compatibility match from search | PASS | First returned mock item reported `EXACT` |
| Mock result count | PASS | 50 items returned in the response page; eBay reported total 12,000 mock matches |
| Browse getItem on mock result ID | SANDBOX LIMITATION | HTTP 404: mock result ID not retrievable as a normal Sandbox item |
| getItemByLegacyId fallback | SANDBOX LIMITATION | HTTP 404: mock legacy item ID not retrievable |
| checkCompatibility on mock result ID | SANDBOX LIMITATION | HTTP 404 because the mock search item is not a retrievable item resource |

## Conclusion

**PASS_FOR_SANDBOX_INTEGRATION**

The Waffer eBay Sandbox credentials are valid and the application can successfully:

1. authenticate with eBay using OAuth client credentials;
2. query eBay Motors Taxonomy for the U.S. vehicle compatibility fields;
3. call the Browse API in Sandbox;
4. submit the official Sandbox compatibility-search scenario; and
5. receive an `EXACT` compatibility match.

The remaining 404 responses are isolated to item-resource calls against the mock IDs returned by eBay's documented Sandbox search dataset. They are not treated as Production evidence or as a failure of Waffer's credentials.

eBay documents that compatible-item search in Sandbox uses mock data, and eBay recommends Production for realistic search/metadata behavior. Therefore, a real `getItem` + `checkCompatibility` chain remains a Production-shadow validation item after Buy API Production access is granted.

## Safety / release boundary

This capture does **not**:

- enable Production eBay credentials;
- enable verified market pricing;
- treat Sandbox prices as market evidence;
- prove a real eBay listing total;
- satisfy Waffer's Production provider pilot.

Production pricing remains gated behind eBay approval plus Waffer's real-provider evidence and release controls.

## Official references

- https://developer.ebay.com/api-docs/buy/api-browse.html
- https://developer.ebay.com/api-docs/buy/static/api-browse.html
- https://developer.ebay.com/api-docs/static/gs_understand-the-sandbox-and.html
