# Google Finder setup

The local B3C3 boundary validates and bounds search input and Google response
fields, returns at most 20 prioritized results from a bounded pool of up to
three provider pages, derives scoring server-side, stores no raw provider
payload and persists through `DATABASE_OWNER_URL` routines. Automated tests use
a deterministic fake and make no Google request; this does not certify real
provider behavior, quota, cost, terms or retention.

Use `PLATFORM_PROFILE=finder` or `full-production`.

1. Create a Google Cloud project and enable **Places API (New)** and **Geocoding API**.
2. Create a server-only API key and put it in `GOOGLE_MAPS_API_KEY`.
3. Restrict the key to those APIs and the production server egress/IP controls available to your hosting setup.
4. Set `FINDER_PROVIDER_CALL_LIMIT`; the default is 30 real Google requests per owner IP per day. Each Text Search page reserves one unit before it is requested, so one uncached Finder search consumes one to three units. Cache hits consume zero units.
5. Run `npm run setup:check`, sign in as owner and perform one permitted test search.

Every Text Search page and Geocoding request is also recorded before provider fetch with a fixed, sanitized SKU/cost contract. No query, address or raw Google response is included. The owner view uses global list prices dated 2026-09-10: Places Text Search Enterprise at USD 35 per 1,000 requests and Geocoding at USD 5 per 1,000 requests. These are gross estimates before free caps, volume discounts, credits, tax or negotiated pricing, not the Google invoice.

Monitor authoritative quota, billing and Google terms in the buyer's own Google account.

With migration 070, the owner can pause Google requests and lower app daily
and monthly limits in **Usage & providers > Controls**. The server
`FINDER_PROVIDER_CALL_LIMIT` ceiling still applies. The DB serializes the
limit check with the existing usage-event insertion, so parallel requests
cannot overbook a page allowance. Cache reads consume no quota. Reference
monthly free allowances are 1,000 Text Search Enterprise and 10,000 Geocoding
calls, shared across the billing account; the app cannot reset or verify the
provider-wide balance. Changing an app limit does not purchase credits.
