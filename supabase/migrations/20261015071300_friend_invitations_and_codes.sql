-- Two more ways to become friends (PS-USR-013–015): a friend request sent to
-- an e-mail address, which can also invite someone without an account, and a
-- short-lived friend code shown as a QR code.

-- PS-USR-013: a request sent to an e-mail address stays hidden from its
-- sender until it is accepted, so the sender never learns whether the
-- address has an account, or how the recipient answered. It only ever
-- becomes visible: when the sender asks the same person in the app, or the
-- recipient accepts.
alter table app.friendships
  add column hidden_from_requester boolean not null default false;

create function app.guard_friendship_hidden_from_requester()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.hidden_from_requester and not old.hidden_from_requester then
    raise exception 'a friend request can only be shown to its sender, never hidden again'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_friendship_hidden_from_requester() from public;

create trigger friendships_hidden_only_revealed
  before update on app.friendships
  for each row execute function app.guard_friendship_hidden_from_requester();

-- An invitation sent to an e-mail address (PS-USR-013). The address is the
-- sender's own input and is shown only to them. What happens behind it
-- (a request to an existing account, an invitation e-mail to a new
-- participant, or nothing) is never stored in a way the sender can read.
create table app.friend_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references app.users (id),
  address text not null
    check (address = lower(address) and char_length(address) between 3 and 320),
  -- «Spør også om å bli venner».
  befriend boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text check (end_reason in ('withdrawn', 'expired')),
  -- The friend request it became: at once for an existing account, or when
  -- the recipient completes registration.
  friendship_id uuid references app.friendships (id),
  -- The sign-in identity this invitation created at the auth provider for a
  -- new participant (PS-USR-015). Removed again if the invitation ends
  -- before it was used.
  identity_subject text check (identity_subject ~ '^[A-Za-z0-9_.:-]{1,255}$'),
  constraint friend_invitations_lifetime check (expires_at > created_at),
  constraint friend_invitations_end_shape check ((ended_at is null) = (end_reason is null)),
  constraint friend_invitations_friendship_befriends check (friendship_id is null or befriend)
);

comment on table app.friend_invitations is
  'Invitations and friend requests sent to an e-mail address (PS-USR-013, PS-USR-015). Deleted 30 days after they end.';

-- One open invitation per sender and address: sending again changes nothing.
create unique index friend_invitations_open_key
  on app.friend_invitations (inviter_id, address)
  where ended_at is null;

create index friend_invitations_open_address_idx
  on app.friend_invitations (address)
  where ended_at is null;

create index friend_invitations_open_expiry_idx
  on app.friend_invitations (expires_at)
  where ended_at is null;

create trigger friend_invitations_active_accounts
  before insert on app.friend_invitations
  for each row execute function app.require_active_accounts('inviter_id');

-- What an invitation is, and how it ended, never changes. It only ends once,
-- becomes one friend request at most, and gains or loses the identity it
-- created.
create function app.guard_friend_invitation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.inviter_id, new.address, new.befriend, new.created_at, new.expires_at)
      is distinct from
     (old.id, old.inviter_id, old.address, old.befriend, old.created_at, old.expires_at)
    or (old.ended_at is not null
      and (new.ended_at, new.end_reason) is distinct from (old.ended_at, old.end_reason))
    or (old.friendship_id is not null and new.friendship_id is distinct from old.friendship_id)
    or (old.identity_subject is not null and new.identity_subject is not null
      and new.identity_subject <> old.identity_subject)
  then
    raise exception 'a friend invitation can only end, become a request, or record its identity'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_friend_invitation_update() from public;

create trigger friend_invitations_guard_update
  before update on app.friend_invitations
  for each row execute function app.guard_friend_invitation_update();

-- A friend code (PS-USR-014): shown as a QR code for five minutes, so
-- someone nearby can send the user a friend request. Only a hash is kept,
-- one per user; a new code replaces the last.
create table app.friend_codes (
  user_id uuid primary key references app.users (id),
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  constraint friend_codes_lifetime check (expires_at > created_at)
);

comment on table app.friend_codes is
  'Short-lived friend codes shown as QR codes (PS-USR-014). Hashes only; deleted when they expire.';

create index friend_codes_expiry_idx on app.friend_codes (expires_at);

create trigger friend_codes_active_accounts
  before insert or update on app.friend_codes
  for each row execute function app.require_active_accounts('user_id');
