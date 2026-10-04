-- WP-43: private end-to-end encrypted chat (PS-COM-004–006, PS-COM-009,
-- PS-NFR-007; ADR-0003, ADR-0010).
--
-- The server is only the delivery service. Every column here is public key
-- material, a signature, MLS ciphertext or delivery metadata: nothing in
-- this schema can decrypt a private message, and no message content is
-- ever stored readable.
--
-- - An account has one current account key (Ed25519, public half only).
--   It certifies the account's devices. A reset replaces it and every
--   device under the old one goes with it.
-- - A device is one sign-in session's MLS member. It is bound to that
--   session, so signing in again is a new device that must be linked by an
--   existing one (ADR-0010 §5): a login alone gives no access.
-- - A conversation is one MLS group. Its devices are the group members the
--   server delivers to; exactly one commit wins each epoch.
-- - Ciphertext is kept until every receiving device has fetched it, and at
--   most a fixed time (`chatRetention`); no one is told when or whether a
--   message was read (PS-COM-004).

create table app.chat_account_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  public_key bytea not null check (octet_length(public_key) = 32),
  created_at timestamptz not null default clock_timestamp(),
  replaced_at timestamptz,
  constraint chat_account_keys_owner_key unique (id, user_id),
  constraint chat_account_keys_replaced_after check (replaced_at >= created_at)
);

comment on table app.chat_account_keys is
  'Public halves of account keys that certify an account''s chat devices (ADR-0010 §3).';

create unique index chat_account_keys_current
  on app.chat_account_keys (user_id) where replaced_at is null;

create table app.chat_devices (
  -- Chosen by the device, as it is named in its certificate.
  id uuid primary key,
  user_id uuid not null,
  account_key_id uuid not null,
  -- The sign-in session the device lives in (ADR-0010 §5).
  session_id text not null check (char_length(session_id) between 1 and 128),
  device_key bytea not null check (octet_length(device_key) = 32),
  certificate_signature bytea not null check (octet_length(certificate_signature) = 64),
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  -- A revocation signed by the account key; absent when the device went with
  -- a replaced account key, an account deletion or a restore.
  revocation_signature bytea check (octet_length(revocation_signature) = 64),
  constraint chat_devices_account_key
    foreign key (account_key_id, user_id)
    references app.chat_account_keys (id, user_id),
  constraint chat_devices_revocation_needs_revoked
    check (revocation_signature is null or revoked_at is not null)
);

comment on table app.chat_devices is
  'Chat devices: one per sign-in session, certified by the account key (ADR-0010 §3).';

create unique index chat_devices_live_session
  on app.chat_devices (session_id) where revoked_at is null;

create index chat_devices_user_idx on app.chat_devices (user_id, created_at);

-- Account keys and devices never change, except that a key is replaced and
-- a device revoked, each once.
create function app.guard_chat_key_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stamp text := case tg_table_name
    when 'chat_account_keys' then 'replaced_at'
    else 'revoked_at'
  end;
begin
  if to_jsonb(old) ->> stamp is not null
     or to_jsonb(new) ->> stamp is null
     or (to_jsonb(new) - stamp - 'revocation_signature')
        <> (to_jsonb(old) - stamp - 'revocation_signature')
  then
    raise exception '% rows are only ever retired once', tg_table_name
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_chat_key_update() from public;

create trigger chat_account_keys_retire_once
  before update on app.chat_account_keys
  for each row execute function app.guard_chat_key_update();

create trigger chat_devices_revoke_once
  before update on app.chat_devices
  for each row execute function app.guard_chat_key_update();

-- A new device is certified by its account's current key, and only an
-- account that takes new activity gets one (PS-ADM-001).
create function app.guard_new_chat_device()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.chat_account_keys
    where id = new.account_key_id and replaced_at is null
  ) then
    raise exception 'a chat device needs the account''s current key'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_chat_device() from public;

create trigger chat_devices_current_key
  before insert on app.chat_devices
  for each row execute function app.guard_new_chat_device();

create trigger chat_devices_active_accounts
  before insert on app.chat_devices
  for each row execute function app.require_active_accounts('user_id');

create trigger chat_account_keys_active_accounts
  before insert on app.chat_account_keys
  for each row execute function app.require_active_accounts('user_id');

-- One-time MLS key packages a device publishes so others can add it.
create table app.chat_key_packages (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references app.chat_devices (id) on delete cascade,
  key_package bytea not null check (octet_length(key_package) between 1 and 4096),
  -- Handed out when the others are used up, and never used up itself.
  last_resort boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check (expires_at > created_at)
);

comment on table app.chat_key_packages is
  'Published MLS key packages (public). Each is handed out once, except the last-resort one.';

create unique index chat_key_packages_last_resort
  on app.chat_key_packages (device_id) where last_resort;

create index chat_key_packages_device_idx
  on app.chat_key_packages (device_id, last_resort, created_at);

-- A new device's request to be linked (ADR-0010 §5). Short-lived and used
-- once; the package is sealed to the link key by the approving device.
create table app.chat_link_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  session_id text not null check (char_length(session_id) between 1 and 128),
  device_id uuid not null,
  device_key bytea not null check (octet_length(device_key) = 32),
  link_key bytea not null check (octet_length(link_key) = 32),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check (expires_at > created_at),
  approved_at timestamptz,
  package bytea check (octet_length(package) between 1 and 16384),
  constraint chat_link_requests_approval
    check ((approved_at is null) = (package is null)),
  constraint chat_link_requests_one_per_session unique (session_id)
);

comment on table app.chat_link_requests is
  'Requests to link a new chat device, with the sealed package once approved (ADR-0010 §5).';

create index chat_link_requests_user_idx
  on app.chat_link_requests (user_id, created_at);

create table app.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('private')),
  -- A private conversation's two participants, in uuid order: one
  -- conversation per pair.
  user_low_id uuid references app.users (id),
  user_high_id uuid references app.users (id),
  -- What made it legitimate to start (PS-COM-006).
  opened_via text not null
    check (opened_via in ('friendship', 'loan_request', 'object_question')),
  created_by_user_id uuid not null references app.users (id),
  created_at timestamptz not null default clock_timestamp(),
  -- The MLS group: a new generation is a new group (ADR-0010 §9), and the
  -- epoch counts the commits the server has accepted in it.
  generation integer not null default 1 check (generation >= 1),
  epoch bigint not null default 0 check (epoch >= 0),
  last_activity_at timestamptz not null default clock_timestamp(),
  constraint chat_conversations_private_pair check (
    kind <> 'private' or (user_low_id < user_high_id)
  )
);

comment on table app.chat_conversations is
  'Private conversations: one MLS group each, whose order of commits the server decides (ADR-0010 §9).';

create unique index chat_conversations_private_key
  on app.chat_conversations (user_low_id, user_high_id) where kind = 'private';

create trigger chat_conversations_active_accounts
  before insert on app.chat_conversations
  for each row execute function app.require_active_accounts(
    'user_low_id', 'user_high_id', 'created_by_user_id'
  );

create table app.chat_participants (
  conversation_id uuid not null references app.chat_conversations (id) on delete cascade,
  user_id uuid not null references app.users (id),
  joined_at timestamptz not null default clock_timestamp(),
  -- «Fjern fra mine samtaler» (PS-COM-009): only this participant's own list.
  hidden_at timestamptz,
  primary key (conversation_id, user_id)
);

comment on table app.chat_participants is
  'Who is in a conversation, and whether they removed it from their own list (PS-COM-009).';

create index chat_participants_user_idx on app.chat_participants (user_id);

-- The devices in a generation's group: whom the server delivers to.
create table app.chat_group_members (
  conversation_id uuid not null references app.chat_conversations (id) on delete cascade,
  generation integer not null,
  device_id uuid not null references app.chat_devices (id) on delete cascade,
  added_at timestamptz not null default clock_timestamp(),
  primary key (conversation_id, generation, device_id)
);

create index chat_group_members_device_idx on app.chat_group_members (device_id);

-- Ciphertext waiting for devices: application messages, commits and
-- welcomes, in one order. Who sent it is inside the ciphertext, not here.
create table app.chat_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references app.chat_conversations (id) on delete cascade,
  generation integer not null,
  epoch bigint not null,
  content_type text not null check (content_type in ('application', 'commit', 'welcome')),
  ciphertext bytea not null check (octet_length(ciphertext) between 1 and 262144),
  created_at timestamptz not null default clock_timestamp()
);

comment on table app.chat_messages is
  'MLS ciphertext until every receiving device has fetched it (ADR-0010 §8). Never readable here.';

create index chat_messages_created_idx on app.chat_messages (created_at);
create index chat_messages_conversation_idx on app.chat_messages (conversation_id);

create trigger chat_messages_immutable
  before update on app.chat_messages
  for each row execute function app.reject_append_only_mutation();

-- Which device still has to fetch which message. Deleted when fetched; this
-- is never a read receipt and is shown to no one (PS-COM-004).
create table app.chat_deliveries (
  device_id uuid not null references app.chat_devices (id) on delete cascade,
  message_id bigint not null references app.chat_messages (id) on delete cascade,
  primary key (device_id, message_id)
);

create index chat_deliveries_message_idx on app.chat_deliveries (message_id);

-- A revoked device's sign-in session ends too (ADR-0010 §7): the lost
-- device is signed out, not only shut out of chat. The sign-in provider
-- keeps sessions in its own schema; this is the one place the app reaches
-- into it, and only to end sessions.
create function app.end_auth_sessions(sessions text[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with ended as (
    delete from auth.sessions where id::text = any($1) returning 1
  )
  select count(*)::integer from ended;
$$;

revoke execute on function app.end_auth_sessions(text[]) from public;
