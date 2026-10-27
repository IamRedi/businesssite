# Troubleshooting

| Symptom | Check |
| --- | --- |
| Database connection fails | Run `npm run setup:check`; in pilot verify the actor-specific runtime/owner/system URL (and migration URL only for tooling), network access and TLS. `DATABASE_URL` is off-mode only. |
| Migrations pending | Run `npm run migrate`, then `npm run migrate:status`. |
| Google 403/quota | Enable Places API (New) and Geocoding, inspect key restrictions and quota. |
| Checkout unavailable | Verify profile, `STRIPE_SECRET_KEY` and the matching Price ID. |
| Site not activated | Inspect the selected provider's verified webhook delivery/signature, `payment_webhook_events` and `site_subscriptions`; success redirects never activate access. |
| Resend mail missing | Check `EMAIL_FROM`, domain DNS and Resend logs; the UI shows provider state. |
| Business upload fallback/Blob error | Check `BLOB_READ_WRITE_TOKEN` or the Vercel OIDC store connection; without it media is stored in PostgreSQL. |
| Information media returns 503 | Configure `INFORMATION_BLOB_READ_WRITE_TOKEN` for the separate private Blob store; local/core environments may upload again to use PostgreSQL fallback. |
| Domain verification fails | Check Vercel project/token and exact DNS instructions in business admin. |
| Preview link fails | It may have expired or been revoked. Owner creates a replacement private link. |
