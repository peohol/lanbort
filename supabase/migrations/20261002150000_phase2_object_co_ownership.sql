-- Phase 2 co-ownership (WP-26, PS-OBJ-007–013).
--
-- Co-owners are ordinary rows in app.object_owners (WP-24): every registered
-- owner has the same rights to the object. This migration adds how someone
-- becomes a co-owner (invitation and explicit acceptance), the co-owners'
-- veto on new commitments, the freeze a block between co-owners causes,
-- consent to permanent deletion and a traceable content history.
--
-- Invitations, restrictions and freezes keep their history: they are stamped
-- when they end, never rewritten. Like every table in `app`, nothing here is
-- reachable from the browser.

-- The object's content per version (PS-OBJ-012, PS-OBJ-013). Every change to
-- an object moves it to a new version, and every version has exactly one row
-- here: who made it, when, and the content it led to. Restoring older content
-- is a new version that copies it; nothing here is ever rewritten.
create table app.object_revisions (
  object_id uuid not null references app.objects (id),
  version integer not null check (version > 0),
  change text not null check (change in (
    'baseline', 'created', 'updated', 'archived', 'restored',
    'image_added', 'image_removed', 'reverted'
  )),
  -- The version whose content a revert brought back.
  reverted_to_version integer,
  -- Objects that existed before this history started have no known author.
  actor_user_id uuid references app.users (id),
  recorded_at timestamptz not null default clock_timestamp(),
  title text not null,
  category_id text not null references app.object_categories (id),
  description text not null,
  loan_terms text,
  status text not null check (status in ('active', 'archived')),
  -- General availability as stored intervals: [{"from": date, "until": date | null}].
  availability jsonb not null check (jsonb_typeof(availability) = 'array'),
  -- The images the object had, in order.
  image_ids uuid[] not null,
  primary key (object_id, version),
  constraint object_revisions_actor_shape
    check ((change = 'baseline') = (actor_user_id is null)),
  constraint object_revisions_revert_shape check (
    (change = 'reverted') = (reverted_to_version is not null)
    and (reverted_to_version is null or reverted_to_version < version)
  )
);

comment on table app.object_revisions is
  'Object content per version with actor and time (PS-OBJ-013). Never rewritten.';

create trigger object_revisions_immutable
  before update on app.object_revisions
  for each row execute function app.reject_append_only_mutation();

-- Objects created before this migration start their history here.
insert into app.object_revisions (
  object_id, version, change, actor_user_id, recorded_at, title, category_id,
  description, loan_terms, status, availability, image_ids
)
select
  object.id, object.version, 'baseline', null, object.updated_at, object.title,
  object.category_id, object.description, object.loan_terms, object.status,
  coalesce((
    select jsonb_agg(
      jsonb_build_object('from', lower(period)::text, 'until', upper(period)::text)
      order by lower(period)
    )
    from app.object_availability_intervals
    where object_id = object.id
  ), '[]'::jsonb),
  array(
    select id from app.object_images where object_id = object.id order by position
  )
from app.objects as object;

-- Every committed version of an object has its revision.
create function app.ensure_object_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from app.objects where id = new.id and version = new.version
  ) and not exists (
    select 1 from app.object_revisions
    where object_id = new.id and version = new.version
  ) then
    raise exception 'object % version % has no revision', new.id, new.version
      using errcode = 'integrity_constraint_violation';
  end if;

  return null;
end;
$$;

revoke execute on function app.ensure_object_revision() from public;

create constraint trigger objects_have_revision
  after insert or update of version on app.objects
  deferrable initially deferred
  for each row execute function app.ensure_object_revision();

-- Invitations to become a co-owner (PS-OBJ-007). Only an explicit acceptance
-- by the invited user makes them an owner. An invitation belongs to the
-- object and stays valid if the owner who sent it leaves. `closed` means a
-- block between the invited user and an owner ended it; the reason is never
-- shown to anyone.
create table app.object_co_owner_invitations (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references app.objects (id),
  invited_user_id uuid not null references app.users (id),
  invited_by_user_id uuid not null references app.users (id),
  created_at timestamptz not null default clock_timestamp(),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'closed')),
  ended_at timestamptz,
  ended_by_user_id uuid references app.users (id),
  constraint object_co_owner_invitations_two_users
    check (invited_user_id <> invited_by_user_id),
  constraint object_co_owner_invitations_end_shape check (
    (status = 'pending' and ended_at is null and ended_by_user_id is null)
    or (status in ('accepted', 'declined')
      and ended_at is not null and ended_by_user_id = invited_user_id)
    or (status = 'withdrawn'
      and ended_at is not null and ended_by_user_id <> invited_user_id)
    or (status = 'closed' and ended_at is not null and ended_by_user_id is null)
  )
);

comment on table app.object_co_owner_invitations is
  'Co-ownership invitations (PS-OBJ-007). Ended rows are history.';

create unique index object_co_owner_invitations_pending_key
  on app.object_co_owner_invitations (object_id, invited_user_id)
  where status = 'pending';

create index object_co_owner_invitations_invited_idx
  on app.object_co_owner_invitations (invited_user_id)
  where status = 'pending';

create trigger object_co_owner_invitations_history
  before update on app.object_co_owner_invitations
  for each row execute function app.guard_history_update(
    'ended_at', 'status', 'ended_by_user_id'
  );

-- A co-owner's explicit restriction on new commitments (PS-OBJ-008). While it
-- is in force, no new loan can be made in its period (all dates when the
-- period is null), whatever the general availability says. Only the co-owner
-- who set it can withdraw it; it also ends when that co-owner leaves.
create table app.object_restrictions (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references app.objects (id),
  set_by_user_id uuid not null references app.users (id),
  -- Calendar dates, stored like availability as [start, end + 1).
  period daterange check (
    period is null or (not isempty(period) and not lower_inf(period))
  ),
  created_at timestamptz not null default clock_timestamp(),
  lifted_at timestamptz,
  lift_reason text check (lift_reason in ('withdrawn', 'owner_left')),
  constraint object_restrictions_lift_shape
    check ((lifted_at is null) = (lift_reason is null))
);

comment on table app.object_restrictions is
  'Co-owner vetoes on new commitments (PS-OBJ-008). Lifted, never deleted.';

create index object_restrictions_active_idx
  on app.object_restrictions (object_id)
  where lifted_at is null;

create trigger object_restrictions_history
  before update on app.object_restrictions
  for each row execute function app.guard_history_update('lifted_at', 'lift_reason');

-- A block between two co-owners freezes the object for new loans and hides it
-- from ordinary discovery (PS-OBJ-009). Lifting the block does not end the
-- freeze; only clarifying the ownership to one registered owner does.
create table app.object_freezes (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references app.objects (id),
  -- Internal: which block caused it. Never shown to anyone.
  user_block_id uuid not null references app.user_blocks (id),
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz
);

comment on table app.object_freezes is
  'Freezes caused by a block between co-owners (PS-OBJ-009). Ended, never deleted.';

create unique index object_freezes_open_key
  on app.object_freezes (object_id)
  where ended_at is null;

create trigger object_freezes_history
  before update on app.object_freezes
  for each row execute function app.guard_history_update('ended_at');

-- Consent to permanently deleting the object (PS-OBJ-011). Only current owners
-- can consent, and a consent goes away with the owner who gave it.
create table app.object_deletion_consents (
  object_id uuid not null,
  user_id uuid not null,
  consented_at timestamptz not null default clock_timestamp(),
  primary key (object_id, user_id),
  foreign key (object_id, user_id)
    references app.object_owners (object_id, user_id) on delete cascade
);

comment on table app.object_deletion_consents is
  'Owners consenting to permanent deletion (PS-OBJ-011). Deletion needs all owners.';

-- Two users with an active block in either direction.
create function app.users_blocked(a uuid, b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from app.user_blocks
    where lifted_at is null
      and (blocker_id, blocked_id) in ((a, b), (b, a))
  );
$$;

revoke execute on function app.users_blocked(uuid, uuid) from public;

-- A new owner never shares an object with someone they block or are blocked
-- by (PS-USR-006), and an invitation never stays open across such a block.
-- The domain checks this first and answers neutrally; this is the backstop.
create function app.guard_new_co_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from app.object_owners
    where object_id = new.object_id
      and user_id <> new.user_id
      and app.users_blocked(user_id, new.user_id)
  ) then
    raise exception 'co-owners cannot block each other when one joins'
      using errcode = 'restrict_violation';
  end if;

  update app.object_co_owner_invitations
  set status = 'closed', ended_at = new.added_at
  where object_id = new.object_id
    and status = 'pending'
    and app.users_blocked(invited_user_id, new.user_id);

  return new;
end;
$$;

revoke execute on function app.guard_new_co_owner() from public;

create trigger object_owners_not_blocked
  before insert on app.object_owners
  for each row execute function app.guard_new_co_owner();

create function app.guard_co_owner_invitation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from app.object_owners
    where object_id = new.object_id
      and app.users_blocked(user_id, new.invited_user_id)
  ) then
    raise exception 'no invitation can be open across a block'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_co_owner_invitation() from public;

create trigger object_co_owner_invitations_not_blocked
  before insert on app.object_co_owner_invitations
  for each row execute function app.guard_co_owner_invitation();

-- What a new block means for co-ownership, in the blocking transaction:
-- every object both users own is frozen, and pending invitations between the
-- invited user and an owner are closed. The social commands hold the pair's
-- lock, and co-ownership commands take the same lock before an invitation or
-- a new owner is written, so neither can slip past a concurrent block.
create function app.apply_block_to_co_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  shared uuid;
begin
  for shared in
    select mine.object_id
    from app.object_owners as mine
    join app.object_owners as theirs using (object_id)
    where mine.user_id = new.blocker_id and theirs.user_id = new.blocked_id
    order by mine.object_id
  loop
    -- Serializes with leaving and deleting, then re-checks: a co-owner who
    -- left meanwhile leaves nothing to freeze.
    perform 1 from app.objects where id = shared for update;

    if (
      select count(*) from app.object_owners
      where object_id = shared and user_id in (new.blocker_id, new.blocked_id)
    ) = 2 and not exists (
      select 1 from app.object_freezes where object_id = shared and ended_at is null
    ) then
      insert into app.object_freezes (object_id, user_block_id, started_at)
      values (shared, new.id, new.created_at);
    end if;
  end loop;

  update app.object_co_owner_invitations as invitation
  set status = 'closed', ended_at = new.created_at
  where invitation.status = 'pending'
    and invitation.invited_user_id in (new.blocker_id, new.blocked_id)
    and exists (
      select 1 from app.object_owners
      where object_id = invitation.object_id
        and user_id in (new.blocker_id, new.blocked_id)
        and user_id <> invitation.invited_user_id
    );

  return null;
end;
$$;

revoke execute on function app.apply_block_to_co_ownership() from public;

create trigger user_blocks_apply_to_co_ownership
  after insert on app.user_blocks
  for each row execute function app.apply_block_to_co_ownership();

-- When an owner leaves, their restrictions end with them, and a freeze ends
-- only once the object is down to one owner. Checked at commit, unless the
-- object itself is gone.
create function app.ensure_co_ownership_consistent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from app.objects where id = old.object_id) then
    return null;
  end if;

  if exists (
    select 1 from app.object_owners
    where object_id = old.object_id and user_id = old.user_id
  ) then
    return null;
  end if;

  if exists (
    select 1 from app.object_restrictions
    where object_id = old.object_id
      and set_by_user_id = old.user_id
      and lifted_at is null
  ) then
    raise exception 'a former owner''s restriction is still in force on object %', old.object_id
      using errcode = 'integrity_constraint_violation';
  end if;

  if (select count(*) from app.object_owners where object_id = old.object_id) = 1
    and exists (
      select 1 from app.object_freezes
      where object_id = old.object_id and ended_at is null
    )
  then
    raise exception 'object % has one owner but is still frozen', old.object_id
      using errcode = 'integrity_constraint_violation';
  end if;

  return null;
end;
$$;

revoke execute on function app.ensure_co_ownership_consistent() from public;

create constraint trigger object_owners_leave_consistently
  after delete on app.object_owners
  deferrable initially deferred
  for each row execute function app.ensure_co_ownership_consistent();
