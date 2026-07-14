create table if not exists public.hotmart_accesses (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  buyer_name text,
  status text not null check (status in ('active', 'revoked')),
  product_id text,
  transaction_id text,
  last_event_id text,
  last_event text,
  purchased_at timestamptz,
  revoked_at timestamptz,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hotmart_webhook_events (
  id text primary key,
  event text not null,
  buyer_email text not null,
  product_id text,
  transaction_id text,
  payload jsonb,
  received_at timestamptz not null default now()
);

alter table public.hotmart_accesses enable row level security;
alter table public.hotmart_webhook_events enable row level security;

create policy "Admins can read Hotmart accesses"
on public.hotmart_accesses for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.user_id = auth.uid() and profiles.role = 'admin'
  ) or lower(coalesce(auth.jwt() ->> 'email', '')) = 'sabrinasebben@sevbenoficial.com'
);

create policy "Admins can read Hotmart webhook events"
on public.hotmart_webhook_events for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.user_id = auth.uid() and profiles.role = 'admin'
  ) or lower(coalesce(auth.jwt() ->> 'email', '')) = 'sabrinasebben@sevbenoficial.com'
);
