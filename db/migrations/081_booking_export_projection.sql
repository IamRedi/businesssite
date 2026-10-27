-- BOOKING V1 LOCAL: export the additional appointment fields under the existing privacy policy.
-- migrate-as-owner-of: public.privacy_system_export_snapshot(uuid,text)
do $$ declare v_definition text; v_marker text:='''version'',appointment_version,''preferredDate'',preferred_date'; begin
  select pg_get_functiondef('public.privacy_system_export_snapshot(uuid,text)'::regprocedure) into v_definition;
  if position(v_marker in v_definition)=0 then raise exception 'booking_export_projection_drift'; end if;
  execute replace(v_definition,v_marker,
    '''version'',appointment_version,''bookingStart'',booking_start,''bookingEnd'',booking_end,''holdExpiresAt'',booking_hold_expires_at,''proposedStart'',booking_proposed_start,''preferredDate'',preferred_date');
end $$;
