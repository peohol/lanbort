-- Phase 2 social relations (WP-20, PS-USR-003–007).
--
-- Friendships and blocks between two internal users. Both tables keep their
-- history: a relation that ends or a block that is lifted is stamped, never
-- deleted by product operations, and nothing ever comes back to life
-- automatically. Every change goes through the domain commands, which
-- serialize all changes for the same pair of users.

-- One row per friendship attempt: pending → active → ended, or pending → ended
-- (declined, withdrawn, or closed by a block). A new request after an ended
-- relation is a new row.
create table app.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references app.users (id),
  addressee_id uuid not null references app.users (id),
  -- The unordered pair, so a request in either direction is the same relation.
  user_low_id uuid not null generated always as (least(requester_id, addressee_id)) stored,
  user_high_id uuid not null generated always as (greatest(requester_id, addressee_id)) stored,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'ended')),
  requested_at timestamptz not null default clock_timestamp(),
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_by_user_id uuid references app.users (id),
  -- Why the relation ended. Internal: `blocked` is never shown to the other
  -- party (PS-USR-006).
  end_reason text check (end_reason in ('declined', 'withdrawn', 'removed', 'blocked')),
  constraint friendships_two_users check (requester_id <> addressee_id),
  constraint friendships_state_shape check (
    (status = 'pending'
      and accepted_at is null
      and num_nonnulls(ended_at, ended_by_user_id, end_reason) = 0)
    or (status = 'active'
      and accepted_at is not null
      and num_nonnulls(ended_at, ended_by_user_id, end_reason) = 0)
    or (status = 'ended'
      and num_nonnulls(ended_at, ended_by_user_id, end_reason) = 3
      and ended_by_user_id in (requester_id, addressee_id)
      -- Declining and withdrawing only apply to requests; removing only to
      -- friendships. A block can close either.
      and (end_reason = 'blocked'
        or (end_reason in ('declined', 'withdrawn')) = (accepted_at is null)))
  )
);

comment on table app.friendships is
  'Mutually accepted friendships and pending requests (PS-USR-003). Ended rows are history.';

-- At most one pending request or friendship per pair, whoever asked first.
-- Crossing requests therefore cannot create two relations.
create unique index friendships_open_pair_key
  on app.friendships (user_low_id, user_high_id)
  where status <> 'ended';

create index friendships_open_requester_idx
  on app.friendships (requester_id)
  where status <> 'ended';

create index friendships_open_addressee_idx
  on app.friendships (addressee_id)
  where status <> 'ended';

-- One-sided blocks (PS-USR-006). Lifting stamps the row; a later block is a
-- new row.
create table app.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references app.users (id),
  blocked_id uuid not null references app.users (id),
  created_at timestamptz not null default clock_timestamp(),
  lifted_at timestamptz,
  constraint user_blocks_two_users check (blocker_id <> blocked_id)
);

comment on table app.user_blocks is
  'One-sided contact and visibility blocks (PS-USR-006, PS-USR-007). Lifted, never deleted.';

create unique index user_blocks_active_key
  on app.user_blocks (blocker_id, blocked_id)
  where lifted_at is null;

create index user_blocks_active_blocked_idx
  on app.user_blocks (blocked_id)
  where lifted_at is null;

-- A relation only moves forward: pending → active → ended or pending → ended.
-- Who it is between, and an ended relation, are fixed history. No pending or
-- active relation can exist while either user blocks the other.
create function app.guard_friendship_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    old.status = 'ended'
    or (old.status = 'active' and new.status <> 'ended')
    or (new.id, new.requester_id, new.addressee_id, new.requested_at)
      is distinct from (old.id, old.requester_id, old.addressee_id, old.requested_at)
    or (old.status = 'active' and new.accepted_at is distinct from old.accepted_at)
  ) then
    raise exception 'friendships can only move from pending to active to ended'
      using errcode = 'restrict_violation';
  end if;

  if new.status <> 'ended' and exists (
    select 1
    from app.user_blocks as block
    where block.lifted_at is null
      and (block.blocker_id, block.blocked_id) in (
        (new.requester_id, new.addressee_id),
        (new.addressee_id, new.requester_id)
      )
  ) then
    raise exception 'no friendship can be open while a block exists'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_friendship_change() from public;

create trigger friendships_forward_only
  before insert or update on app.friendships
  for each row execute function app.guard_friendship_change();

-- A block can only change once: from active to lifted.
create function app.guard_user_block_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.lifted_at is not null
    or new.lifted_at is null
    or (new.id, new.blocker_id, new.blocked_id, new.created_at)
      is distinct from (old.id, old.blocker_id, old.blocked_id, old.created_at)
  then
    raise exception 'blocks can only be lifted'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_user_block_update() from public;

create trigger user_blocks_update_only_lifts
  before update on app.user_blocks
  for each row execute function app.guard_user_block_update();
