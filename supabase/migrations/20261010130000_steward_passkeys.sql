-- Passkeys for platform stewards (ADR-0011, OD-0023). The server verifies
-- WebAuthn itself and keeps only public keys; a confirmation is bound to the
-- sign-in session it was made in. Nothing here is ever deleted: removing a
-- passkey or voiding a code stamps the row, so the record of who could act
-- as a steward, and when, stays intact.

create table app.steward_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  -- The authenticator's credential id and COSE public key; no secret.
  credential_id bytea not null unique
    check (octet_length(credential_id) between 16 and 1023),
  public_key bytea not null check (octet_length(public_key) between 16 and 2048),
  sign_count bigint not null default 0 check (sign_count >= 0),
  transports text[] not null default '{}'
    check (cardinality(transports) <= 8),
  -- The steward's own name for it, e.g. «Nøkkel i skuffen».
  name text not null
    check (name = btrim(name) and char_length(name) between 1 and 60),
  -- Whether it was added with an enrollment code from the operational
  -- command or from a session already confirmed with another passkey.
  enrolled_with text not null check (enrolled_with in ('enrollment_code', 'passkey')),
  created_at timestamptz not null default clock_timestamp(),
  last_used_at timestamptz,
  removed_at timestamptz,
  removed_by_user_id uuid references app.users (id),
  removed_by_process text check (removed_by_process ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  constraint steward_passkeys_removal_shape check (
    (removed_at is null and num_nonnulls(removed_by_user_id, removed_by_process) = 0)
    or (removed_at is not null and num_nonnulls(removed_by_user_id, removed_by_process) = 1)
  )
);

comment on table app.steward_passkeys is
  'Platform stewards'' WebAuthn passkeys (ADR-0011, OD-0023): public keys only. Removed, never deleted.';

create index steward_passkeys_user_idx on app.steward_passkeys (user_id)
  where removed_at is null;

-- One-time codes from the operational command, handed over outside e-mail.
-- Only a hash is kept.
create table app.steward_enrollment_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  issued_at timestamptz not null default clock_timestamp(),
  issued_by_process text not null check (issued_by_process ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  -- Why it was issued (first enrollment, every passkey lost). Stored here
  -- only, never in events or logs.
  reason text not null
    check (reason = btrim(reason) and char_length(reason) between 1 and 500),
  expires_at timestamptz not null,
  used_at timestamptz,
  voided_at timestamptz,
  constraint steward_enrollment_codes_expiry check (expires_at > issued_at),
  constraint steward_enrollment_codes_once check (num_nonnulls(used_at, voided_at) <= 1)
);

comment on table app.steward_enrollment_codes is
  'One-time enrollment codes for a steward''s first passkey (OD-0023). Hashes only; each is used or voided at most once.';

create unique index steward_enrollment_codes_open_key
  on app.steward_enrollment_codes (user_id)
  where used_at is null and voided_at is null;

-- A WebAuthn ceremony: the challenge the server issued, for one user in one
-- sign-in session. A completed one names the passkey that answered it; that
-- is the session's confirmation.
create table app.steward_passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  session_id text not null check (char_length(session_id) between 1 and 200),
  purpose text not null check (purpose in ('registration', 'confirmation')),
  challenge bytea not null check (octet_length(challenge) = 32),
  enrollment_code_id uuid references app.steward_enrollment_codes (id),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  passkey_id uuid references app.steward_passkeys (id),
  constraint steward_passkey_challenges_code_registers check (
    enrollment_code_id is null or purpose = 'registration'
  ),
  constraint steward_passkey_challenges_completion check (
    (completed_at is null) = (passkey_id is null)
  )
);

comment on table app.steward_passkey_challenges is
  'WebAuthn challenges for platform stewards, bound to a sign-in session; a completed one is that session''s confirmation (ADR-0011).';

create index steward_passkey_challenges_session_idx
  on app.steward_passkey_challenges (user_id, session_id, completed_at desc)
  where completed_at is not null;

-- A passkey and a code only ever end once, and nothing else about them
-- changes except a passkey's counter and last use.
create function app.guard_steward_passkey_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.removed_at is not null
    or (new.id, new.user_id, new.credential_id, new.public_key, new.transports,
        new.name, new.enrolled_with, new.created_at)
      is distinct from
       (old.id, old.user_id, old.credential_id, old.public_key, old.transports,
        old.name, old.enrolled_with, old.created_at)
    or new.sign_count < old.sign_count
  then
    raise exception 'a passkey can only be used or removed'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_steward_passkey_update() from public;

create trigger steward_passkeys_guard_update
  before update on app.steward_passkeys
  for each row execute function app.guard_steward_passkey_update();

create function app.guard_steward_enrollment_code_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if num_nonnulls(old.used_at, old.voided_at) > 0
    or (new.id, new.user_id, new.code_hash, new.issued_at,
        new.issued_by_process, new.reason, new.expires_at)
      is distinct from
       (old.id, old.user_id, old.code_hash, old.issued_at,
        old.issued_by_process, old.reason, old.expires_at)
  then
    raise exception 'an enrollment code can only be used or voided, once'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_steward_enrollment_code_update() from public;

create trigger steward_enrollment_codes_guard_update
  before update on app.steward_enrollment_codes
  for each row execute function app.guard_steward_enrollment_code_update();

create trigger steward_passkeys_no_delete
  before delete on app.steward_passkeys
  for each row execute function app.reject_append_only_mutation();

create trigger steward_passkeys_no_truncate
  before truncate on app.steward_passkeys
  for each statement execute function app.reject_append_only_mutation();

create trigger steward_enrollment_codes_no_delete
  before delete on app.steward_enrollment_codes
  for each row execute function app.reject_append_only_mutation();

create trigger steward_enrollment_codes_no_truncate
  before truncate on app.steward_enrollment_codes
  for each statement execute function app.reject_append_only_mutation();
