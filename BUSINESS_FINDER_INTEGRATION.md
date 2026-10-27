# Business Finder integration

Finder access is platform-owner only. Customer-facing routes must not import `@platform/business-finder` or expose provider search APIs.

```text
Google Places -> normalize -> deduplicate -> score -> persist lead
                                                    |
                                                    v
                                  PreparedBusinessProfile (versioned)
                                                    |
                                                    v
                                      idempotent demo creation
```

The web adapter supports category suggestions, device location, fixed-address geocoding and radius filtering. A normalized search key backs the 30-day database cache so an identical unexpired search does not make an unnecessary provider call.

The `createPreparedBusinessProfile` adapter maps a qualified lead to the shared website-engine contract. Provider-specific payloads and scoring history remain on the finder side of that boundary.

## Operational requirements

- Enable Google Places API (New) and Geocoding API for the configured key.
- Restrict the key by API and deployment environment in Google Cloud.
- Treat quota errors and empty results differently from authentication failures.
- Retain score reasons and pipeline/audit events with every operator action.
- Do not send Google credentials or raw provider payloads into `SiteDocument`.
