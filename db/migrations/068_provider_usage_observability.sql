-- migrate-as-owner-of: public.owner_finder_append_audit(text,text,text,text,jsonb,text)
BEGIN;

DO $role_handoff$
BEGIN
  IF to_regrole('bsrc_owner_executor') IS NOT NULL THEN
    EXECUTE 'grant create on schema public to bsrc_owner_executor';
    EXECUTE 'set local role bsrc_owner_executor';
  END IF;
END
$role_handoff$;

CREATE OR REPLACE FUNCTION public.owner_provider_usage_record(
  p_session text,
  p_service text,
  p_sku text,
  p_estimated_cost_usd_micros bigint,
  p_pricing_version text,
  p_pricing_as_of date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_event_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.owner_auth_resolve_session(p_session, 'finder.write')) THEN
    RAISE EXCEPTION 'Owner Finder authorization required.' USING ERRCODE = '42501';
  END IF;

  IF (p_service, p_sku, p_estimated_cost_usd_micros) NOT IN (
    ('places_text_search', 'places_text_search_enterprise', 35000),
    ('geocoding', 'geocoding', 5000)
  ) OR p_pricing_version <> 'google-maps-global-2026-09-10'
    OR p_pricing_as_of <> DATE '2026-09-10'
  THEN
    RAISE EXCEPTION 'Unsupported provider usage contract.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_events (id, entity_type, entity_id, action, details) VALUES (
    v_event_id, 'provider_usage', v_event_id::text, 'provider_call_reserved',
    jsonb_build_object(
      'provider', 'google_maps',
      'service', p_service,
      'sku', p_sku,
      'requestCount', 1,
      'estimatedCostUsdMicros', p_estimated_cost_usd_micros,
      'pricingVersion', p_pricing_version,
      'pricingAsOf', p_pricing_as_of::text,
      'estimateBasis', 'gross_list_price_before_free_cap_discounts_credits_tax'
    )
  );
  RETURN v_event_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.owner_provider_usage_snapshot(p_session text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_day_start timestamptz := date_trunc('day', v_now);
  v_month_start timestamptz := date_trunc('month', v_now);
  v_snapshot jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.owner_auth_resolve_session(p_session, 'audit.read')) THEN
    RAISE EXCEPTION 'Owner audit authorization required.' USING ERRCODE = '42501';
  END IF;

  WITH provider_rows AS (
    SELECT
      'openai'::text AS provider,
      COALESCE(model, 'unknown')::text AS service,
      COALESCE((usage ->> 'estimatedCostUsdMicros')::bigint, 0) AS estimated_cost_usd_micros,
      COALESCE((usage ->> 'inputTokens')::bigint, 0) AS input_tokens,
      COALESCE((usage ->> 'cachedInputTokens')::bigint, 0) AS cached_input_tokens,
      COALESCE((usage ->> 'outputTokens')::bigint, 0) AS output_tokens,
      COALESCE((usage ->> 'reasoningTokens')::bigint, 0) AS reasoning_tokens,
      COALESCE((usage ->> 'totalTokens')::bigint, 0) AS total_tokens,
      CASE WHEN usage ->> 'pricingKnown' = 'true' THEN false ELSE true END AS unknown_price,
      COALESCE(usage ->> 'pricingVersion', 'unknown') AS pricing_version,
      created_at
    FROM public.ai_runs
    WHERE status = 'completed' AND created_at >= v_month_start
    UNION ALL
    SELECT
      'google_maps'::text,
      COALESCE(details ->> 'service', 'unknown'),
      COALESCE((details ->> 'estimatedCostUsdMicros')::bigint, 0),
      0, 0, 0, 0, 0,
      false,
      COALESCE(details ->> 'pricingVersion', 'unknown'),
      created_at
    FROM public.audit_events
    WHERE entity_type = 'provider_usage'
      AND action = 'provider_call_reserved'
      AND created_at >= v_month_start
  ), provider_totals AS (
    SELECT provider, service, count(*)::bigint AS calls,
      sum(estimated_cost_usd_micros)::bigint AS estimated_cost_usd_micros,
      sum(input_tokens)::bigint AS input_tokens,
      sum(cached_input_tokens)::bigint AS cached_input_tokens,
      sum(output_tokens)::bigint AS output_tokens,
      sum(reasoning_tokens)::bigint AS reasoning_tokens,
      sum(total_tokens)::bigint AS total_tokens,
      count(*) FILTER (WHERE unknown_price)::bigint AS unknown_price_calls,
      min(pricing_version) AS pricing_version
    FROM provider_rows GROUP BY provider, service
  ), recent_rows AS (
    SELECT provider, service, estimated_cost_usd_micros, input_tokens,
      cached_input_tokens, output_tokens, reasoning_tokens, total_tokens,
      unknown_price, pricing_version, created_at
    FROM provider_rows ORDER BY created_at DESC LIMIT 50
  )
  SELECT jsonb_build_object(
    'generatedAt', v_now,
    'today', jsonb_build_object(
      'calls', count(*) FILTER (WHERE created_at >= v_day_start),
      'estimatedCostUsdMicros', COALESCE(sum(estimated_cost_usd_micros) FILTER (WHERE created_at >= v_day_start), 0),
      'unknownPriceCalls', count(*) FILTER (WHERE created_at >= v_day_start AND unknown_price)
    ),
    'month', jsonb_build_object(
      'calls', count(*),
      'estimatedCostUsdMicros', COALESCE(sum(estimated_cost_usd_micros), 0),
      'unknownPriceCalls', count(*) FILTER (WHERE unknown_price)
    ),
    'providers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'provider', provider, 'service', service, 'calls', calls,
      'estimatedCostUsdMicros', estimated_cost_usd_micros,
      'inputTokens', input_tokens, 'cachedInputTokens', cached_input_tokens,
      'outputTokens', output_tokens, 'reasoningTokens', reasoning_tokens,
      'totalTokens', total_tokens, 'unknownPriceCalls', unknown_price_calls,
      'pricingVersion', pricing_version
    ) ORDER BY provider, service) FROM provider_totals), '[]'::jsonb),
    'recent', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'provider', provider, 'service', service,
      'estimatedCostUsdMicros', estimated_cost_usd_micros,
      'inputTokens', input_tokens, 'cachedInputTokens', cached_input_tokens,
      'outputTokens', output_tokens, 'reasoningTokens', reasoning_tokens,
      'totalTokens', total_tokens, 'unknownPrice', unknown_price,
      'pricingVersion', pricing_version, 'createdAt', created_at
    ) ORDER BY created_at DESC) FROM recent_rows), '[]'::jsonb)
  ) INTO v_snapshot FROM provider_rows;

  RETURN v_snapshot;
END
$function$;

RESET ROLE;

REVOKE ALL ON FUNCTION public.owner_provider_usage_record(text,text,text,bigint,text,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_provider_usage_snapshot(text) FROM PUBLIC;

DO $role_cleanup$
BEGIN
  IF to_regrole('bsrc_owner_executor') IS NOT NULL THEN
    EXECUTE 'revoke create on schema public from bsrc_owner_executor';
  END IF;
END
$role_cleanup$;

COMMIT;
