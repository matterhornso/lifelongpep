-- lifelongpep booking — webhook idempotency + concurrent-slot guard
-- Apply via Supabase Studio SQL editor after 0001_init.sql.
--
-- Two correctness fixes, see TODO.md → C.1:
--
-- 1) Razorpay can retry a webhook (network blip, app 5xx). The current handler
--    is idempotent for DB updates but NOT for the confirmation email — a retry
--    would send a duplicate. The processed_webhook_events table is a tombstone:
--    we insert (event_id) first; on unique violation we know we've seen this
--    delivery before and return 200 without doing the work again.
--
-- 2) The slots-booked flag is only set inside the webhook (post-capture). Two
--    customers can therefore both reach the Razorpay checkout for the same
--    slot, both pay, both webhooks fire. Defense in depth:
--      a. Optimistic reservation: order-create RPC sets slots.reserved_until
--         (10-min TTL). Second customer's order-create returns 409.
--      b. Partial unique index on bookings(slot_id) where status='confirmed'
--         — backstop. If both reservations somehow win (clock skew, expired
--         reservation re-claimed), the second webhook's UPDATE fails and we
--         can refund.

create table processed_webhook_events (
  event_id text primary key,             -- value of x-razorpay-event-id header
  event_type text not null,
  order_id text,
  payment_id text,
  processed_at timestamptz not null default now()
);
alter table processed_webhook_events enable row level security;
-- Service role only; no anon access.

alter table slots
  add column reserved_until timestamptz;
create index slots_reserved_until_idx
  on slots (reserved_until)
  where reserved_until is not null;

-- Backstop: at most one confirmed booking per slot.
create unique index bookings_one_confirmed_per_slot
  on bookings (slot_id)
  where status = 'confirmed' and slot_id is not null;

-- Optimistic reservation. Caller passes slot_id; we return the slot row only
-- if it is unbooked AND not currently reserved by someone else. The single
-- UPDATE is atomic so two concurrent callers cannot both succeed.
create or replace function reserve_slot(p_slot_id uuid, p_minutes int default 10)
returns table(slot_id uuid)
language plpgsql
security definer
as $$
begin
  return query
  update slots
  set reserved_until = now() + make_interval(mins => p_minutes)
  where id = p_slot_id
    and booked = false
    and (reserved_until is null or reserved_until < now())
  returning slots.id;
end;
$$;

-- Called from webhook on payment.failed so the slot becomes immediately
-- available again instead of waiting out the 10-min reservation TTL.
create or replace function clear_slot_reservation(p_slot_id uuid)
returns void
language sql
security definer
as $$
  update slots
  set reserved_until = null
  where id = p_slot_id
    and booked = false;
$$;

grant execute on function reserve_slot(uuid, int) to service_role;
grant execute on function clear_slot_reservation(uuid) to service_role;
