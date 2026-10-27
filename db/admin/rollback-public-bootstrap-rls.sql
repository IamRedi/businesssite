-- Operational rollback for Task Group 3-B3A. Deploy compatibility/off code
-- first, then run as the configured migrator. Data, routines, tokens,
-- appointments and migration history are intentionally retained.
revoke execute on function resolve_public_site_by_slug(text) from bsrc_runtime;
revoke execute on function resolve_public_site_by_domain(text) from bsrc_runtime;
revoke execute on function resolve_private_preview(uuid) from bsrc_runtime;
revoke execute on function create_public_appointment_request(text,text,text,text,text,date,time,text) from bsrc_runtime;
