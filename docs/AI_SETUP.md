# AI assistant setup

The AI layer is optional, server-only and provider-neutral at its contract boundary. The included adapter uses the OpenAI Responses API with strict structured outputs. The deterministic website engine never imports the AI package.

The adapter uses the [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) with [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and sets provider-side response storage to false.

## Capabilities and permissions

- Platform owner: analyze lead facts, optionally read the existing public website, give creative direction, review a blueprint, then create a private demo.
- Business site admin: rewrite only hero text, about text and service descriptions. AI cannot change identity, contacts, images, theme, domain, subscription or credentials.
- Every request is recorded in `ai_runs`, including actor, operation, provider/model, status and token usage. API keys are never recorded.
- Client requests use a durable per-site daily limit. In pilot, quota
  reservation, concurrency acquisition and run creation complete through the
  exact runtime boundary before the provider call; failure records the run and
  releases the lease. Owner AI run/read/apply uses owner-only routines.

## Enable OpenAI

Set these values in the deployment environment or `.env.local` only:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your-server-side-key
AI_OWNER_ENABLED=true
AI_CLIENT_ENABLED=true
AI_OWNER_MODEL=gpt-5.6-sol
AI_CLIENT_MODEL=gpt-5.6-luna
AI_CLIENT_DAILY_LIMIT=10
AI_WEBSITE_FETCH_ENABLED=true
AI_MAX_WEBSITE_CHARACTERS=24000
AI_MAX_WEBSITE_PAGES=6
```

Run `npm run migrate` to apply `014_ai_assistant.sql`, then restart the app. Keep `OPENAI_API_KEY` out of Git and never prefix it with `NEXT_PUBLIC_`.

## Existing website analysis

Set `AI_WEBSITE_FETCH_ENABLED=true` to allow the owner-only analyzer to read public HTTP(S) pages. Starting from the supplied business URL, the reader follows a small ranked set of same-host pages such as About, Services, Contact and Opening Hours. It extracts visible copy, page titles/descriptions, selected public LocalBusiness JSON-LD, email/phone links, public social links and same-host raster-image candidates with their alt text. When the reader finds enough concrete evidence, the AI runs in **source-led mode**: it preserves every verified service family in 3–6 clear cards, rewrites the copy and hierarchy into a stronger website, and does not fall back to generic template wording. It can assign source-image candidates to matching service cards; unrelated images are rejected and approved template media remains the fallback. The resulting evidence lets the owner review which facts informed the new website; imported contacts and hours are persisted in the prepared profile and demo.

Opening hours, qualifications and similar claims are included only when explicit in the supplied business facts or website evidence. If a mixed business spans multiple service families, the AI must retain that scope instead of silently forcing it into an overly narrow template.

Source images are remote reference media from the business's own website, used only for that business's private/demo website and never added to the shared template-asset library. Before a public launch, the business owner must confirm that it owns or is licensed to use those images; otherwise replace them through the site-admin media panel.

The reader pins public DNS results, blocks IP URLs and private/link-local/reserved networks, revalidates redirects, accepts HTML only, and enforces time/size limits. Leave this setting false when a buyer does not need old-site analysis. `AI_MAX_WEBSITE_PAGES` caps the relevant pages read (default 6, maximum 10); `AI_MAX_WEBSITE_CHARACTERS` caps aggregate evidence sent to the model (default 24,000, maximum 50,000). Scripts, styles and raw HTML are not sent to the model.

### Visual source-media review

For old-site analysis, the first ten public HTTPS same-host image candidates are supplied to the configured OpenAI model as low-detail visual inputs. This means source-media selection is based on the actual pixels, not merely on a filename or `alt` attribute. The model may return a hero, service and gallery image only from this bounded candidate set and must reject imagery that visibly conflicts with the verified business. If no suitable source image exists, the applicable built-in template media remains the fallback.

## Provider customization

`@platform/ai-assistant` exposes an `AiProvider` interface. A buyer can add a different provider adapter without changing the website engine or UI contracts. `OPENAI_BASE_URL` is available for a buyer-controlled OpenAI-compatible gateway; validate gateway behavior before production use.

## Operational checks

1. Confirm `AI_PROVIDER`, enable flags and models with the environment validator.
2. Apply all migrations.
3. Test one owner blueprint and create its demo.
4. Apply the same run twice and confirm the same site/preview is returned.
5. Test a client rewrite and confirm it only fills the editor field; the user must still click Save.
6. Monitor `ai_runs.usage`, failures and client 429 responses before adjusting limits.
