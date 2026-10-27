-- BOOKING V1 LOCAL: preserve the existing appointment privacy class.
-- migrate-as-owner-of: public.appointment_receipt_privacy_guard()
create or replace function public.appointment_receipt_privacy_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if (to_jsonb(new)-'appointment_version'-'updated_at') is distinct from (to_jsonb(old)-'appointment_version'-'updated_at') then
    new.appointment_version := old.appointment_version + 1;
  end if;
  if new.phone='deleted' and new.customer_name='Deleted requester '||left(replace(new.id::text,'-',''),12)
     and new.email is null and new.customer_message is null and new.service_title is null
     and new.preferred_date is null and new.preferred_time is null and new.note is null then
    new.receipt_key_digest:=null; new.request_fingerprint:=null;
    new.fingerprint_key_version:=null; new.receipt_expires_at:=null; new.request_service_id:=null;
    new.booking_start:=null; new.booking_end:=null; new.booking_hold_expires_at:=null; new.booking_proposed_start:=null;
  end if;
  return new;
end $$;
revoke all on function public.appointment_receipt_privacy_guard() from public;

