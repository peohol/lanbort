-- Phase 2 environment publication and approval (WP-25, PS-OBJ-006,
-- PS-ENV-011, PS-OBJ-017).
--
-- An object keeps one global identity and truth (PS-OBJ-001). Publishing it in
-- an environment is a separate relation with its own status, so the same
-- object can be published, pending, rejected or blocked in several
-- environments independently, and nothing an environment decides changes the
-- object itself. "Not published" is the absence of a current row.

-- PS-ENV-011: the environment requires an administrator's approval before an
-- object becomes visible there.
alter table app.environments
  add column requires_object_approval boolean not null default false;

-- One row per publication period of an object in an environment. A current
-- row is pending, active, rejected or blocked; withdrawing it, losing the
-- access behind it or the environment winding down makes it `unpublished`,
-- which is final, and publishing again is a new row.
--
-- - pending: waits for an administrator's approval. Hidden from new
--   discovery; future loan requests through it wait (an administrative pause).
-- - active: visible to the environment's active members.
-- - rejected: an administrator's explicit local decision (a rejection, or the
--   removal of an active publication). It stands until an administrator
--   changes it, so turning the approval requirement off, or the owner
--   publishing again, does not undo it.
-- - blocked: a separate local safety or moderation measure. It stands until an
--   administrator lifts it.
-- Rejections and blocks are local: they never touch the object or its
-- publications elsewhere (PS-OBJ-017).
create table app.environment_publications (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references app.objects (id),
  environment_id uuid not null references app.environments (id),
  published_by_user_id uuid not null references app.users (id),
  created_at timestamptz not null default clock_timestamp(),
  status text not null
    check (status in ('pending', 'active', 'rejected', 'blocked', 'unpublished')),
  status_changed_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  -- withdrawn: an owner took it down. access_lost: no owner has active access
  -- to the environment any more (PS-OBJ-006). environment_wound_down:
  -- PS-ENV-012.
  end_reason text check (end_reason in ('withdrawn', 'access_lost', 'environment_wound_down')),
  ended_by_user_id uuid references app.users (id),
  constraint environment_publications_end_shape check (
    (status = 'unpublished') = (ended_at is not null)
    and (ended_at is null) = (end_reason is null)
    and (ended_by_user_id is not null) = (end_reason is not distinct from 'withdrawn')
  )
);

comment on table app.environment_publications is
  'Publication of an object in an environment (PS-OBJ-006, PS-ENV-011). Separate from the object.';

create unique index environment_publications_current_key
  on app.environment_publications (object_id, environment_id)
  where status <> 'unpublished';

create index environment_publications_environment_idx
  on app.environment_publications (environment_id, status)
  where status <> 'unpublished';

create index environment_publications_object_idx
  on app.environment_publications (object_id, created_at);

-- An unpublished row is history and never changes again.
create trigger environment_publications_history
  before update on app.environment_publications
  for each row execute function app.guard_history_update(
    'ended_at', 'status', 'status_changed_at', 'end_reason', 'ended_by_user_id'
  );

-- PS-OBJ-006: at least one current owner of the object has an active
-- membership in the environment. A transition period that has run out counts
-- as passive at once in the domain; the database follows when the scheduled
-- job records it.
create function app.object_has_environment_access(object uuid, environment uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from app.object_owners as owner
    join app.environment_memberships as membership
      on membership.user_id = owner.user_id
    where owner.object_id = object
      and membership.environment_id = environment
      and membership.state = 'active'
  );
$$;

revoke execute on function app.object_has_environment_access(uuid, uuid) from public;

-- A publication only becomes pending or active while an owner has active
-- access and the environment takes new activity (PS-ENV-012). The domain
-- checks this first and answers with a reason; this is the backstop.
create function app.guard_live_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('pending', 'active')
    and (tg_op = 'INSERT' or old.status not in ('pending', 'active'))
    and (
      not app.object_has_environment_access(new.object_id, new.environment_id)
      or not exists (
        select 1 from app.environments
        where id = new.environment_id and state = 'active'
      )
    )
  then
    raise exception 'publication of object % in environment % has no access behind it',
      new.object_id, new.environment_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_live_publication() from public;

create trigger environment_publications_live_guard
  before insert or update of status on app.environment_publications
  for each row execute function app.guard_live_publication();

-- PS-OBJ-006: when the last owner with active access loses it, the
-- publication ends there, in the same transaction as the change that caused
-- it, whatever caused it (leaving, becoming passive for any reason, ending,
-- leaving the object). The object itself and its other publications are not
-- touched. Rejected and blocked publications are standing decisions and stay.
--
-- The live publications are locked first, and only then is access checked in
-- a new statement: under read committed that statement sees every change
-- committed meanwhile, so two owners losing access at the same time cannot
-- each count on the other.
create function app.end_publications_without_access(
  scope_environment uuid,
  scope_object uuid,
  scope_user uuid,
  at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1
  from app.environment_publications as publication
  where publication.status in ('pending', 'active')
    and (scope_environment is null or publication.environment_id = scope_environment)
    and (scope_object is null or publication.object_id = scope_object)
    and (scope_user is null or exists (
      select 1 from app.object_owners
      where object_id = publication.object_id and user_id = scope_user
    ))
  order by publication.id
  for update;

  update app.environment_publications as publication
  set status = 'unpublished',
    status_changed_at = at,
    ended_at = at,
    end_reason = 'access_lost'
  where publication.status in ('pending', 'active')
    and (scope_environment is null or publication.environment_id = scope_environment)
    and (scope_object is null or publication.object_id = scope_object)
    and (scope_user is null or exists (
      select 1 from app.object_owners
      where object_id = publication.object_id and user_id = scope_user
    ))
    and not app.object_has_environment_access(publication.object_id, publication.environment_id);
end;
$$;

revoke execute on function app.end_publications_without_access(uuid, uuid, uuid, timestamptz)
  from public;

create function app.end_publications_after_membership_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_publications_without_access(
    new.environment_id, null, new.user_id, new.updated_at
  );

  return null;
end;
$$;

revoke execute on function app.end_publications_after_membership_change() from public;

create trigger environment_memberships_end_publications
  after update of state on app.environment_memberships
  for each row
  when (old.state = 'active' and new.state <> 'active')
  execute function app.end_publications_after_membership_change();

create function app.end_publications_after_owner_left()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_publications_without_access(
    null, old.object_id, null, clock_timestamp()
  );

  return null;
end;
$$;

revoke execute on function app.end_publications_after_owner_left() from public;

create trigger object_owners_end_publications
  after delete on app.object_owners
  for each row execute function app.end_publications_after_owner_left();
