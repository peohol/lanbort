-- Phase 1 identity (WP-10, PS-USR-001, PS-USR-002, ADR-0007).
--
-- The internal user is separate from the auth provider's identity: the
-- provider subject is only a link, there is no foreign key into the provider's
-- own schema, and nothing here is derived from user-editable auth metadata.

create table app.users (
  id uuid primary key default gen_random_uuid(),
  -- pending_registration: e-mail verified, name and 18+ not yet given.
  status text not null default 'pending_registration'
    check (status in ('pending_registration', 'active')),
  -- PS-USR-001 / UX-JRN-001: the user confirms being 18 or older. This is a
  -- system-critical account fact, deliberately not a profile field.
  adult_confirmed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint users_active_requires_adult_confirmation check (
    status = 'pending_registration' or adult_confirmed_at is not null
  )
);

comment on table app.users is
  'Internal Lånbort accounts. Independent of the auth provider.';

-- Link from an authenticated provider identity to the internal user.
create table app.auth_identities (
  provider text not null check (provider in ('supabase')),
  subject text not null check (subject ~ '^[A-Za-z0-9_.:-]{1,255}$'),
  user_id uuid not null references app.users (id),
  created_at timestamptz not null default clock_timestamp(),
  primary key (provider, subject),
  constraint auth_identities_one_per_provider unique (user_id, provider)
);

-- Verified contact channels (PS-USR-001). The pilot only uses e-mail.
create table app.verified_contacts (
  user_id uuid not null references app.users (id),
  kind text not null check (kind in ('email')),
  address text not null
    check (address = lower(address) and char_length(address) between 3 and 320),
  verified_at timestamptz not null,
  primary key (user_id, kind),
  constraint verified_contacts_address_key unique (kind, address)
);

-- Minimal profile (PS-USR-002). Visibility rules per field arrive with the
-- social model in Phase 2; until then only the owner can read the profile.
create table app.profiles (
  user_id uuid primary key references app.users (id),
  real_name text not null check (
    real_name = btrim(real_name)
    and char_length(real_name) between 1 and 100
    and real_name !~ '[[:cntrl:]]'
  ),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

-- Events by users now point at real internal users.
alter table app.audit_events
  add constraint audit_events_actor_user_fk
  foreign key (actor_user_id) references app.users (id);
