# Appointment readiness and phased plan

Snapshot: 2026-09-13T10:26:42.190Z. Base: 969fed43bc295fa2c23be9307897872adcb500b0.

## Current contract

Appointment requests express a preferred time. They do not reserve availability
or confirm a booking. The active product feature is appointment_requests;
booking_calendar is not implemented. Payment is not required to design a
no-payment appointment flow. No legal version or provider gate is changed.

## Phase 1A: BSRC-PILOT-007 (local implementation)

Reject invalid request shapes and malformed calendar dates/times; restrict the
selected service to the resolved site; preserve server-derived tenant authority.
Return 429/Retry-After for replay throttling, never a fabricated saved-request
acknowledgement. Preserve form fields after failed transport, bound stalled
requests to 15 seconds and make result announcements accessible. Recipient
lookup/delivery errors after persistence must not invalidate the saved request.

This is not durable idempotency. A request may have saved before a client timeout.
No automatic client retry is performed. The existing replay key/reservation and
10-minute window are unchanged; a failed first attempt can still need to wait.
Past-date and opening-hours validation require a business-timezone contract;
this phase does not invent one or claim real availability.

## Phase 1B: durable request and delivery contract (proposed, not started)

Define a tenant-bound client request ID, payload fingerprint, transactional
persistence/result replay, expiry and recovery of failed reservations. Decide
how different customer intentions sharing a phone/time remain distinguishable.
Prove concurrent retries produce one record and retries cannot leak other tenants.
Add minimal role-bound recipient resolution and a durable notification outbox
with retry, deduplication and visible failed-delivery state. Verify RLS without
broad grants. Any additive migration requires disposable clean/upgrade evidence
and separate hosted authority; no hosted mutation is implied by this document.

## Phase 2: customer business inbox (proposed, not started)

New / confirmed / closed filters, pagination, contact details and visible status.
Confirm, suggest another time, decline and cancel through authorized audited
transitions. Specify customer consent to a proposed time rather than silently
converting a request into a confirmed appointment. Correct the unconditional
empty-state copy as part of the inbox correction.

## Phase 3: actual scheduling (proposed, not started)

Per-business off / approval-request / automatic-booking modes. Stable service
IDs, duration, staff/resource capacity, opening hours, holidays, buffers, minimum
notice, business timezone and daylight-saving transitions. Enforce no-overlap
atomically in storage, not only in the displayed slot picker. Define cancellation
and rescheduling policies plus scoped expiring management links. Start with one
calendar/resource; external calendar OAuth is a separately assessed integration.

## Phase 4: UX and acceptance (proposed, not started)

Visitor flow: service -> day/time -> contact and summary, without mandatory
account creation. Show requested versus confirmed accurately. No invented slots.
Minimize contact data; do not solicit medical details. Test active locales,
keyboard/screen-reader behavior, mobile, actual Safari/iPhone, timezone/DST,
concurrent booking, cancellation, network failure and notification recovery.
Real email/provider acceptance remains subject to existing legal/provider gates.

## Current-platform reference patterns

- [Wix approval requests](https://support.wix.com/en/article/wix-bookings-requiring-approval-for-appointment-bookings): distinguish requests from confirmation and support alternate times.
- [Acuity overlap protection](https://help.acuityscheduling.com/hc/en-us/articles/16676952402957-Using-overlapping-appointments-and-double-booking-in-Acuity-Scheduling): deny double booking by default; capacity must be deliberate.
- [Cal.com minimum notice](https://cal.com/help/event-types/min-notice): protect businesses from last-minute scheduling.

These references inform a proposal, not purchased services, new subscriptions,
or a claim of feature parity or superiority.

## Detailed execution programme

The appointment programme refines this
conceptual proposal into bounded coding tasks, dependencies and release gates.
Use that document for assignments and the private task ledger for owner authority.
No future appointment phase was implemented by writing the plan.

## Contract proposal checkpoint

The APPT-001 contract specifies
future R1/R2 behavior and a single owner decision bundle. The phase-007
request-only correction is owner-accepted; the new contract and its future
features are not implemented or accepted merely by this documentation.
