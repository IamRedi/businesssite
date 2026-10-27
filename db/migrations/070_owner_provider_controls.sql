-- migrate-as-owner-of: public.owner_provider_usage_snapshot(text)
BEGIN;
DO $handoff$
BEGIN
  IF to_regrole('bsrc_owner_executor') IS NOT NULL THEN
    EXECUTE 'grant create on schema public to bsrc_owner_executor';
    EXECUTE 'set local role bsrc_owner_executor';
  END IF;
END
$handoff$;

CREATE OR REPLACE FUNCTION public.owner_provider_control(p_session text, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_settings jsonb;
  v_configured boolean;
  v_now timestamptz;
  v_month timestamptz;
  v_day timestamptz;
  v_month_key text;
  v_request uuid;
  v_actor uuid;
  v_input jsonb;
  v_allowance bigint;
  v_used bigint;
  v_committed bigint;
  v_pending integer;
  v_uncertain integer;
  v_google integer;
  v_geocoding integer;
  v_today integer;
  v_amount numeric;
  v_reservation public.audit_events;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('settings','snapshot','save','add_budget','reserve_ai','settle_ai','reserve_google')
    OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
    RAISE EXCEPTION 'provider_control_invalid' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.owner_auth_resolve_session(p_session, CASE
      WHEN p_action IN ('save','add_budget') THEN 'platform.configure'
      WHEN p_action IN ('reserve_ai','settle_ai') THEN 'ai.manage'
      WHEN p_action='reserve_google' THEN 'finder.write'
      WHEN p_action='settings' THEN 'finder.read'
      ELSE 'audit.read' END)
  ) THEN RAISE EXCEPTION 'Owner provider authorization required.' USING ERRCODE='42501'; END IF;
  SELECT owner_id INTO STRICT v_actor FROM public.owner_sessions WHERE token_hash=p_session;

  -- Shared by settings updates, Google reservations and AI admission. No lock
  -- survives this database transaction or spans the external provider request.
  PERFORM pg_advisory_xact_lock(hashtextextended('owner_provider_controls_v1',0));
  v_now:=clock_timestamp();
  v_month:=date_trunc('month',v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_day:=date_trunc('day',v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_key:=to_char(v_month AT TIME ZONE 'UTC','YYYY-MM');
  SELECT details INTO v_settings FROM public.audit_events
    WHERE entity_type='provider_controls' AND action='settings_saved'
    ORDER BY (details->>'revision')::bigint DESC LIMIT 1;
  v_configured:=v_settings IS NOT NULL;
  v_settings:=COALESCE(v_settings,jsonb_build_object(
    'revision',0,'aiEnabled',true,'aiModel','gpt-5.6-sol','aiBudgetEur',5,
    'aiExtraEur',0,'extraMonth',v_month_key,
    'usdPerEur',1.1592,'fxAsOf','2026-09-11',
    'googleEnabled',true,'googleDailyLimit',30,'googleMonthlyLimit',1000,'geocodingMonthlyLimit',10000));
  IF v_settings->>'extraMonth'<>v_month_key THEN
    v_settings:=v_settings||jsonb_build_object('aiExtraEur',0,'extraMonth',v_month_key);
  END IF;
  IF p_action='settings' THEN RETURN jsonb_build_object('settings',v_settings,'configured',v_configured); END IF;

  IF p_action IN ('save','add_budget','reserve_ai','settle_ai') THEN
    v_request:=(p_payload->>'requestId')::uuid;
    IF v_request IS NULL THEN RAISE EXCEPTION 'provider_request_id_required' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_action IN ('save','add_budget') THEN
    IF EXISTS(SELECT 1 FROM public.audit_events WHERE id=v_request AND entity_type='provider_controls' AND action='settings_saved') THEN
      RETURN public.owner_provider_control(p_session,'snapshot','{}');
    END IF;
    IF (p_payload->>'revision') IS NULL OR (p_payload->>'revision')::bigint<>(v_settings->>'revision')::bigint THEN
      RAISE EXCEPTION 'provider_settings_changed' USING ERRCODE='40001';
    END IF;
    IF p_action='save' THEN
      v_input:=p_payload->'settings';
      IF v_input IS NULL OR jsonb_typeof(v_input)<>'object' OR
        (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_input) AS key) IS DISTINCT FROM
        ARRAY['aiBudgetEur','aiEnabled','aiModel','geocodingMonthlyLimit','googleDailyLimit','googleEnabled','googleMonthlyLimit']::text[] OR
        jsonb_typeof(v_input->'aiEnabled') IS DISTINCT FROM 'boolean' OR
        jsonb_typeof(v_input->'googleEnabled') IS DISTINCT FROM 'boolean' OR
        jsonb_typeof(v_input->'aiModel') IS DISTINCT FROM 'string' OR
        jsonb_typeof(v_input->'aiBudgetEur') IS DISTINCT FROM 'number' OR
        jsonb_typeof(v_input->'googleDailyLimit') IS DISTINCT FROM 'number' OR
        jsonb_typeof(v_input->'googleMonthlyLimit') IS DISTINCT FROM 'number' OR
        jsonb_typeof(v_input->'geocodingMonthlyLimit') IS DISTINCT FROM 'number' OR
        v_input->>'aiModel' NOT IN ('gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna') OR
        (v_input->>'aiBudgetEur')::numeric NOT BETWEEN 0 AND 1000 OR
        (v_input->>'aiBudgetEur')::numeric<>round((v_input->>'aiBudgetEur')::numeric,2) OR
        (v_input->>'googleDailyLimit')::numeric NOT BETWEEN 0 AND 500 OR
        (v_input->>'googleDailyLimit')::numeric<>trunc((v_input->>'googleDailyLimit')::numeric) OR
        (v_input->>'googleMonthlyLimit')::numeric NOT BETWEEN 0 AND 100000 OR
        (v_input->>'googleMonthlyLimit')::numeric<>trunc((v_input->>'googleMonthlyLimit')::numeric) OR
        (v_input->>'geocodingMonthlyLimit')::numeric NOT BETWEEN 0 AND 100000 OR
        (v_input->>'geocodingMonthlyLimit')::numeric<>trunc((v_input->>'geocodingMonthlyLimit')::numeric) THEN
        RAISE EXCEPTION 'provider_settings_invalid' USING ERRCODE='22023';
      END IF;
      v_settings:=v_settings||v_input;
    ELSE
      IF jsonb_typeof(p_payload->'amountEur') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'provider_budget_invalid' USING ERRCODE='22023'; END IF;
      v_amount:=(p_payload->>'amountEur')::numeric;
      IF v_amount<=0 OR v_amount>1000 OR v_amount<>round(v_amount,2) OR v_amount+(v_settings->>'aiExtraEur')::numeric>1000 THEN
        RAISE EXCEPTION 'provider_budget_invalid' USING ERRCODE='22023';
      END IF;
      v_settings:=v_settings||jsonb_build_object('aiExtraEur',(v_settings->>'aiExtraEur')::numeric+v_amount);
    END IF;
    v_settings:=v_settings||jsonb_build_object('revision',(v_settings->>'revision')::bigint+1);
    INSERT INTO public.audit_events(id,entity_type,entity_id,action,details)
      VALUES(v_request,'provider_controls',v_actor::text,'settings_saved',v_settings);
    RETURN public.owner_provider_control(p_session,'snapshot','{}');
  END IF;

  SELECT COALESCE(sum((s.details->>'costUsdMicros')::bigint),0),
    COALESCE(sum(COALESCE((s.details->>'costUsdMicros')::bigint,(r.details->>'reservedUsdMicros')::bigint)),0),
    count(*) FILTER(WHERE s.id IS NULL AND r.created_at>v_now-interval '120 seconds'),
    count(*) FILTER(WHERE s.id IS NULL AND r.created_at<=v_now-interval '120 seconds')
  INTO v_used,v_committed,v_pending,v_uncertain
  FROM public.audit_events r
  LEFT JOIN public.audit_events s ON s.entity_type='provider_controls' AND s.action='ai_settled' AND s.entity_id=r.id::text
  WHERE r.entity_type='provider_controls' AND r.action='ai_reserved' AND r.created_at>=v_month;
  SELECT count(*) FILTER(WHERE details->>'service'='places_text_search'),
    count(*) FILTER(WHERE details->>'service'='geocoding'),
    count(*) FILTER(WHERE details->>'service'='places_text_search' AND created_at>=v_day)
  INTO v_google,v_geocoding,v_today FROM public.audit_events
  WHERE entity_type='provider_usage' AND action='provider_call_reserved' AND created_at>=v_month;

  IF p_action='reserve_google' THEN
    IF NOT (v_settings->>'googleEnabled')::boolean THEN RAISE EXCEPTION 'provider_paused' USING ERRCODE='P0001'; END IF;
    IF p_payload->>'service' IS NULL OR p_payload->>'service' NOT IN ('places_text_search','geocoding') THEN RAISE EXCEPTION 'provider_service_invalid' USING ERRCODE='22023'; END IF;
    IF (p_payload->>'service'='places_text_search' AND (v_google>=(v_settings->>'googleMonthlyLimit')::integer OR v_today>=(v_settings->>'googleDailyLimit')::integer)) OR
       (p_payload->>'service'='geocoding' AND v_geocoding>=(v_settings->>'geocodingMonthlyLimit')::integer) THEN
      RAISE EXCEPTION 'provider_google_limit' USING ERRCODE='P0001';
    END IF;
    -- The existing usage-record function inserts before this same transaction
    -- releases the advisory lock. A rejected record never reaches Google.
    RETURN jsonb_build_object('allowed',true);
  ELSIF p_action='reserve_ai' THEN
    IF NOT (v_settings->>'aiEnabled')::boolean THEN RAISE EXCEPTION 'provider_paused' USING ERRCODE='P0001'; END IF;
    IF p_payload->>'revision' IS NULL OR (p_payload->>'revision')::bigint<>(v_settings->>'revision')::bigint THEN RAISE EXCEPTION 'provider_settings_changed' USING ERRCODE='40001'; END IF;
    IF p_payload->>'model' IS NULL OR p_payload->>'model' NOT IN ('gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna') OR
      (v_configured AND p_payload->>'model'<>v_settings->>'aiModel') THEN RAISE EXCEPTION 'provider_model_invalid' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM public.audit_events WHERE id=v_request) THEN RAISE EXCEPTION 'provider_request_already_reserved' USING ERRCODE='22023'; END IF;
    IF v_pending>0 THEN RAISE EXCEPTION 'provider_ai_running' USING ERRCODE='P0001'; END IF;
    v_allowance:=floor(((v_settings->>'aiBudgetEur')::numeric+(v_settings->>'aiExtraEur')::numeric)*(v_settings->>'usdPerEur')::numeric*1000000);
    IF v_committed>=v_allowance THEN RAISE EXCEPTION 'provider_ai_budget' USING ERRCODE='P0001'; END IF;
    INSERT INTO public.audit_events(id,entity_type,entity_id,action,details) VALUES(v_request,'provider_controls',v_actor::text,'ai_reserved',jsonb_build_object(
      'model',p_payload->>'model','reservedUsdMicros',v_allowance-v_committed,'revision',(v_settings->>'revision')::bigint));
    RETURN jsonb_build_object('allowed',true,'requestId',v_request);
  ELSIF p_action='settle_ai' THEN
    SELECT * INTO v_reservation FROM public.audit_events WHERE id=v_request AND entity_type='provider_controls' AND action='ai_reserved' AND entity_id=v_actor::text;
    IF NOT FOUND THEN RAISE EXCEPTION 'provider_reservation_missing' USING ERRCODE='42501'; END IF;
    IF jsonb_typeof(p_payload->'estimatedCostUsdMicros') IS DISTINCT FROM 'number' OR
       (p_payload->>'estimatedCostUsdMicros')::numeric NOT BETWEEN 0 AND 1000000000000 OR
       (p_payload->>'estimatedCostUsdMicros')::numeric<>trunc((p_payload->>'estimatedCostUsdMicros')::numeric) THEN
      RAISE EXCEPTION 'provider_cost_invalid' USING ERRCODE='22023';
    END IF;
    SELECT details INTO v_input FROM public.audit_events WHERE entity_type='provider_controls' AND action='ai_settled' AND entity_id=v_request::text;
    IF FOUND THEN
      IF (v_input->>'costUsdMicros')::bigint<>(p_payload->>'estimatedCostUsdMicros')::bigint THEN RAISE EXCEPTION 'provider_settlement_conflict' USING ERRCODE='22023'; END IF;
      RETURN jsonb_build_object('settled',true);
    END IF;
    INSERT INTO public.audit_events(id,entity_type,entity_id,action,details) VALUES(gen_random_uuid(),'provider_controls',v_request::text,'ai_settled',jsonb_build_object('costUsdMicros',(p_payload->>'estimatedCostUsdMicros')::bigint));
    RETURN jsonb_build_object('settled',true);
  END IF;
  RETURN jsonb_build_object('configured',v_configured,'settings',v_settings,
    'monthStart',to_char(v_month AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'resetAt',to_char((v_month+interval '1 month') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'aiUsedUsdMicros',v_used,'aiCommittedUsdMicros',v_committed,'aiPending',v_pending,'aiUncertain',v_uncertain,
    'googleCalls',v_google,'geocodingCalls',v_geocoding,'googleToday',v_today);
END
$function$;

REVOKE ALL ON FUNCTION public.owner_provider_control(text,text,jsonb) FROM PUBLIC;
DO $grant$
BEGIN
  IF to_regrole('bsrc_owner_ops') IS NOT NULL THEN
    EXECUTE 'grant execute on function public.owner_provider_control(text,text,jsonb) to bsrc_owner_ops';
  END IF;
END
$grant$;

-- Preserve the immutable usage event/pricing contract; admission and the
-- metering event commit atomically, before the application performs fetch.
CREATE OR REPLACE FUNCTION public.owner_provider_usage_record(p_session text,p_service text,p_sku text,p_estimated_cost_usd_micros bigint,p_pricing_version text,p_pricing_as_of date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $record$
DECLARE v_event uuid:=gen_random_uuid();
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.owner_auth_resolve_session(p_session,'finder.write')) THEN RAISE EXCEPTION 'Owner Finder authorization required.' USING ERRCODE='42501'; END IF;
  IF p_service IS NULL OR p_sku IS NULL OR p_estimated_cost_usd_micros IS NULL OR p_pricing_version IS NULL OR p_pricing_as_of IS NULL OR
     (p_service,p_sku,p_estimated_cost_usd_micros) NOT IN (('places_text_search','places_text_search_enterprise',35000),('geocoding','geocoding',5000)) OR
     p_pricing_version<>'google-maps-global-2026-09-10' OR p_pricing_as_of<>DATE '2026-09-10' THEN
    RAISE EXCEPTION 'Unsupported provider usage contract.' USING ERRCODE='22023';
  END IF;
  PERFORM public.owner_provider_control(p_session,'reserve_google',jsonb_build_object('service',p_service));
  INSERT INTO public.audit_events(id,entity_type,entity_id,action,details) VALUES(v_event,'provider_usage',v_event::text,'provider_call_reserved',jsonb_build_object(
    'provider','google_maps','service',p_service,'sku',p_sku,'requestCount',1,
    'estimatedCostUsdMicros',p_estimated_cost_usd_micros,'pricingVersion',p_pricing_version,'pricingAsOf',p_pricing_as_of::text,
    'estimateBasis','gross_list_price_before_free_cap_discounts_credits_tax'));
  RETURN v_event;
END
$record$;
REVOKE ALL ON FUNCTION public.owner_provider_usage_record(text,text,text,bigint,text,date) FROM PUBLIC;
RESET ROLE;
DO $cleanup$
BEGIN
  IF to_regrole('bsrc_owner_executor') IS NOT NULL THEN EXECUTE 'revoke create on schema public from bsrc_owner_executor'; END IF;
END
$cleanup$;
COMMIT;
