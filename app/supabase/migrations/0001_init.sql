-- lifelongpep booking — initial schema
-- Apply via Supabase Studio SQL editor, or `supabase db push` if linked.
-- DO NOT run blindly against a production project — review first.

-- Enums --------------------------------------------------------------
create type neighborhood as enum (
  'Indiranagar', 'Koramangala', 'HSR', 'Whitefield', 'Jayanagar'
);
create type consult_mode as enum ('video', 'in_person');
create type availability_status as enum ('live', 'soon', 'off');
create type booking_kind as enum ('consult', 'recovery');
create type booking_status as enum ('pending_payment', 'confirmed', 'cancelled');
create type recovery_type as enum ('sauna', 'steam', 'cryotherapy', 'red_light', 'salt_bath');

-- Doctors ------------------------------------------------------------
create table doctors (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,            -- internal only, never rendered on public cards
  specialty text not null,
  neighborhood neighborhood not null,
  years_post_md int not null,
  modes consult_mode[] not null default array['video', 'in_person']::consult_mode[],
  availability availability_status not null default 'soon',
  bio_short text,
  created_at timestamptz default now()
);

-- Recovery providers + sessions -------------------------------------
create table recovery_providers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  neighborhood neighborhood not null,
  created_at timestamptz default now()
);

create table recovery_sessions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references recovery_providers(id) on delete cascade,
  type recovery_type not null,
  duration_min int not null,
  price_inr int not null,
  doctor_recommended boolean default false,
  created_at timestamptz default now()
);

-- Slots --------------------------------------------------------------
create table slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade,
  recovery_session_id uuid references recovery_sessions(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  booked boolean default false,
  created_at timestamptz default now(),
  constraint slots_one_owner check (
    (doctor_id is not null and recovery_session_id is null) or
    (doctor_id is null and recovery_session_id is not null)
  )
);

create index slots_doctor_starts_at_idx on slots (doctor_id, starts_at);
create index slots_recovery_starts_at_idx on slots (recovery_session_id, starts_at);
create index slots_unbooked_idx on slots (starts_at) where booked = false;

-- Customers ----------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  phone text,
  created_at timestamptz default now()
);

-- Bookings -----------------------------------------------------------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  kind booking_kind not null,
  doctor_id uuid references doctors(id),
  recovery_session_id uuid references recovery_sessions(id),
  slot_id uuid references slots(id),
  customer_id uuid not null references customers(id),
  consult_mode consult_mode,
  status booking_status not null default 'pending_payment',
  total_inr int not null,
  cut_inr int not null,
  razorpay_order_id text,
  razorpay_payment_id text,
  notes text,
  created_at timestamptz default now(),
  cancelled_at timestamptz
);

create index bookings_customer_idx on bookings (customer_id);
create index bookings_status_idx on bookings (status);
create index bookings_slot_idx on bookings (slot_id);

-- Payments -----------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  razorpay_order_id text not null,
  razorpay_payment_id text,
  amount_inr int not null,
  status text not null,                   -- 'created','authorized','captured','failed','refunded'
  raw_payload jsonb,
  created_at timestamptz default now()
);

create index payments_booking_idx on payments (booking_id);
create index payments_order_idx on payments (razorpay_order_id);

-- RLS ---------------------------------------------------------------
alter table doctors enable row level security;
alter table recovery_providers enable row level security;
alter table recovery_sessions enable row level security;
alter table slots enable row level security;
alter table customers enable row level security;
alter table bookings enable row level security;
alter table payments enable row level security;

-- Public read on catalog
create policy "doctors_public_select" on doctors for select using (true);
create policy "recovery_providers_public_select" on recovery_providers for select using (true);
create policy "recovery_sessions_public_select" on recovery_sessions for select using (true);
create policy "slots_public_select" on slots for select using (true);

-- Customers / bookings / payments — service role only.
-- A follow-up migration will add per-user policies once magic-link auth is wired up.
