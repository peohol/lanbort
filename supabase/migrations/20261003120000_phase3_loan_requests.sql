-- Phase 3 loan requests (WP-30, PS-LOAN-001–005).
--
-- A loan request is a proposal before any binding approval (PS-DOM-004). A
-- request through an environment and a direct request between friends are
-- the same row; where it came from is its origin, kept as context
-- (PS-LOAN-001). Approval, the agreement snapshot, the responsible lender and
-- the reservation are WP-31's: nothing here reserves anything or blocks the
-- object's availability.
--
-- A request is open while it is `requested` or `awaiting_terms_confirmation`.
-- It ends neutrally, in the same transaction, as soon as the access it builds
-- on is gone (PS-LOAN-002): the triggers below end it whatever caused the
-- loss, like the publication triggers of WP-25. An ended request is history
-- and never changes again.

-- A publication is named together with its object and environment, so a
-- request can only build on a publication of the object it asks for, in the
-- environment it names.
alter table app.environment_publications
  add constraint environment_publications_scope_key
  unique (id, object_id, environment_id);

-- Two users with an active friendship (PS-USR-003).
create function app.users_are_friends(a uuid, b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from app.friendships
    where status = 'active'
      and user_low_id = least(a, b)
      and user_high_id = greatest(a, b)
  );
$$;

revoke execute on function app.users_are_friends(uuid, uuid) from public;

-- PS-LOAN-001 / PS-USR-004: a direct request needs an active friendship with
-- at least one current owner of the object.
create function app.has_friend_among_owners(borrower uuid, object uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from app.object_owners
    where object_id = object
      and user_id <> borrower
      and app.users_are_friends(user_id, borrower)
  );
$$;

revoke execute on function app.has_friend_among_owners(uuid, uuid) from public;

-- A block in either direction between the user and any owner of the object
-- (PS-USR-006): no new loan with this user, whoever else owns it.
create function app.blocked_with_an_owner(borrower uuid, object uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from app.object_owners
    where object_id = object and app.users_blocked(user_id, borrower)
  );
$$;

revoke execute on function app.blocked_with_an_owner(uuid, uuid) from public;

-- PS-LOAN-005: whether the object's terms at version `current` differ from
-- the ones the borrower confirmed at version `seen`. This is the one place
-- the rule is decided, for the triggers below and the domain alike. The terms
-- are free text, so every change to them counts: the system cannot tell an
-- editorial change from a material one (OD-0014).
create function app.loan_terms_differ(object uuid, seen integer, current integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (
    select loan_terms from app.object_revisions
    where object_id = object and version = seen
  ) is distinct from (
    select loan_terms from app.object_revisions
    where object_id = object and version = current
  );
$$;

revoke execute on function app.loan_terms_differ(uuid, integer, integer) from public;

create table app.loan_requests (
  id uuid primary key default gen_random_uuid(),
  -- Null once the object is deleted: the request stays as the parties'
  -- history, ended, without the object's content (vision «Inaktive objekter
  -- og sletting»). Its owners at that time stay in `former_owner_ids`.
  object_id uuid references app.objects (id),
  borrower_user_id uuid not null references app.users (id),
  -- PS-LOAN-001: how the request came about. Only the origin differs; the
  -- request is the same either way.
  origin text not null check (origin in ('environment', 'direct')),
  environment_id uuid references app.environments (id),
  -- The publication the request builds on. Withdrawing it, rejecting it or
  -- losing the access behind it ends the request, also if the object is
  -- published there again later (a new publication).
  publication_id uuid,
  -- Where the request was made in the environment's history (PS-ENV-009),
  -- given by the database like publications' positions.
  position bigint,
  -- PS-LOAN-004: the desired start (null: as soon as possible), and either
  -- the last desired day (inclusive) or a duration in days.
  desired_start date,
  desired_end date,
  desired_days integer check (desired_days between 1 and 3650),
  -- To the owners. Never copied into events or logs.
  message text not null check (
    message = btrim(message)
    and char_length(message) between 1 and 2000
    and message !~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  ),
  -- PS-LOAN-005: the object version whose terms the borrower saw and
  -- confirmed. The revision history is the record of what they said.
  terms_version integer,
  former_owner_ids uuid[],
  status text not null default 'requested'
    check (status in ('requested', 'awaiting_terms_confirmation', 'ended')),
  created_at timestamptz not null default clock_timestamp(),
  status_changed_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  -- withdrawn: by the borrower. declined: by an owner. The others are
  -- neutral and never say who did what (PS-LOAN-002, PS-USR-006):
  -- access_lost (membership, friendship or a block between the parties),
  -- publication_ended, object_unavailable (archived, frozen, or the borrower
  -- became an owner).
  end_reason text check (end_reason in (
    'withdrawn', 'declined', 'access_lost', 'publication_ended', 'object_unavailable'
  )),
  ended_by_user_id uuid references app.users (id),
  constraint loan_requests_origin_key unique (id, origin),
  constraint loan_requests_publication_fkey
    foreign key (publication_id, object_id, environment_id)
    references app.environment_publications (id, object_id, environment_id),
  constraint loan_requests_terms_fkey
    foreign key (object_id, terms_version)
    references app.object_revisions (object_id, version),
  constraint loan_requests_origin_shape check (
    (origin = 'environment') = (environment_id is not null)
    and (publication_id is not null) = (environment_id is not null and object_id is not null)
    and (environment_id is null) = (position is null)
  ),
  constraint loan_requests_object_shape check (
    (object_id is null) = (terms_version is null)
    and (object_id is null) = (former_owner_ids is not null)
    and (object_id is not null or status = 'ended')
  ),
  constraint loan_requests_period_shape check (
    num_nonnulls(desired_end, desired_days) = 1
    and (desired_start is null or desired_end is null or desired_end >= desired_start)
  ),
  constraint loan_requests_end_shape check (
    (status = 'ended') = (ended_at is not null)
    and (ended_at is null) = (end_reason is null)
    and (ended_by_user_id is not null)
      = coalesce(end_reason in ('withdrawn', 'declined'), false)
    and (end_reason is distinct from 'withdrawn' or ended_by_user_id = borrower_user_id)
    and (end_reason is distinct from 'declined' or ended_by_user_id <> borrower_user_id)
  )
);

comment on table app.loan_requests is
  'Loan requests before approval (PS-LOAN-001–005), one model for every origin.';

create index loan_requests_borrower_idx
  on app.loan_requests (borrower_user_id, created_at, id);

create index loan_requests_object_idx
  on app.loan_requests (object_id, created_at, id);

create index loan_requests_open_publication_idx
  on app.loan_requests (publication_id)
  where status in ('requested', 'awaiting_terms_confirmation');

create index loan_requests_open_environment_idx
  on app.loan_requests (environment_id, borrower_user_id)
  where status in ('requested', 'awaiting_terms_confirmation');

-- Positions are the database's to give, and only an environment request has
-- one (PS-ENV-009).
create function app.position_loan_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.position := case
    when new.origin = 'environment' then nextval('app.history_positions')
  end;

  return new;
end;
$$;

revoke execute on function app.position_loan_request() from public;

create trigger loan_requests_position
  before insert on app.loan_requests
  for each row execute function app.position_loan_request();

-- A request is only made with the access it needs, for an object that takes
-- new loans, and never by one of its owners. The domain checks this first and
-- answers neutrally; this is the backstop.
create function app.guard_new_loan_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'requested'
    or not exists (
      select 1 from app.objects where id = new.object_id and status = 'active'
    )
    or exists (
      select 1 from app.object_freezes
      where object_id = new.object_id and ended_at is null
    )
    or exists (
      select 1 from app.object_owners
      where object_id = new.object_id and user_id = new.borrower_user_id
    )
    or app.blocked_with_an_owner(new.borrower_user_id, new.object_id)
    or (new.origin = 'direct'
      and not app.has_friend_among_owners(new.borrower_user_id, new.object_id))
    or (new.origin = 'environment' and not (
      exists (
        select 1 from app.environment_publications
        where id = new.publication_id and status = 'active'
      )
      and exists (
        select 1 from app.environment_memberships
        where environment_id = new.environment_id
          and user_id = new.borrower_user_id
          and state = 'active'
      )
    ))
  then
    raise exception 'loan request for object % has no access behind it', new.object_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_loan_request() from public;

create trigger loan_requests_access_guard
  before insert on app.loan_requests
  for each row execute function app.guard_new_loan_request();

-- An ended request is history and never changes again, with one exception:
-- when its object is deleted, it lets go of the object's rows (object,
-- publication and revision) and keeps the owners of that time instead.
create function app.guard_loan_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  detached text[] := array['object_id', 'publication_id', 'terms_version', 'former_owner_ids'];
  mutable text[] := array[
    'ended_at', 'status', 'status_changed_at', 'end_reason', 'ended_by_user_id',
    'terms_version'
  ];
begin
  if old.object_id is not null and new.object_id is null then
    if old.ended_at is null
      or (to_jsonb(old) - detached) is distinct from (to_jsonb(new) - detached)
    then
      raise exception 'only an ended loan request (%) lets go of its object', old.id
        using errcode = 'restrict_violation';
    end if;
  elsif old.ended_at is not null
    or (to_jsonb(old) - mutable) is distinct from (to_jsonb(new) - mutable)
  then
    raise exception 'only % may change on app.loan_requests', array_to_string(mutable, ', ')
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_loan_request_update() from public;

create trigger loan_requests_history
  before update on app.loan_requests
  for each row execute function app.guard_loan_request_update();

-- PS-LOAN-003: each party's explicit acceptance of the responsibility
-- declaration for this concrete direct request, and the version of the
-- declaration it was given for. Only direct requests have one. A lender's
-- acceptance is any owner's; WP-31 checks that the owner who approves has
-- accepted. Acceptances are never rewritten.
create table app.loan_request_responsibility_acceptances (
  request_id uuid not null,
  origin text not null default 'direct' check (origin = 'direct'),
  user_id uuid not null references app.users (id),
  role text not null check (role in ('borrower', 'lender')),
  declaration_version integer not null check (declaration_version > 0),
  accepted_at timestamptz not null default clock_timestamp(),
  primary key (request_id, user_id, declaration_version),
  constraint loan_request_responsibility_acceptances_request_fkey
    foreign key (request_id, origin) references app.loan_requests (id, origin)
);

comment on table app.loan_request_responsibility_acceptances is
  'Acceptances of the responsibility declaration for direct requests (PS-LOAN-003).';

create trigger loan_request_responsibility_acceptances_immutable
  before update on app.loan_request_responsibility_acceptances
  for each row execute function app.reject_append_only_mutation();

-- The borrower accepts as borrower, an owner as lender, and only while the
-- request is open. The domain checks this first; this is the backstop.
create function app.guard_responsibility_acceptance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.loan_requests as request
    where request.id = new.request_id
      and request.status in ('requested', 'awaiting_terms_confirmation')
      and case new.role
        when 'borrower' then request.borrower_user_id = new.user_id
        else exists (
          select 1 from app.object_owners
          where object_id = request.object_id and user_id = new.user_id
        )
      end
  ) then
    raise exception 'user % cannot accept for loan request % as %',
      new.user_id, new.request_id, new.role
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_responsibility_acceptance() from public;

create trigger loan_request_responsibility_acceptances_guard
  before insert on app.loan_request_responsibility_acceptances
  for each row execute function app.guard_responsibility_acceptance();

-- Ends the open requests among `request_ids` neutrally (PS-LOAN-002).
-- Requests that already ended, and anything WP-31 approves later, stay as
-- they are.
create function app.end_loan_requests(request_ids uuid[], reason text, at timestamptz)
returns void
language sql
set search_path = ''
as $$
  update app.loan_requests
  set status = 'ended', status_changed_at = at, ended_at = at, end_reason = reason
  where id = any(request_ids)
    and status in ('requested', 'awaiting_terms_confirmation');
$$;

revoke execute on function app.end_loan_requests(uuid[], text, timestamptz) from public;

-- The object is deleted (PS-OBJ-011): its open requests end neutrally, and
-- every request lets go of the object's rows before they are deleted, so
-- both parties keep their history (vision «Inaktive objekter og sletting»).
-- Called by the deletion command before it deletes anything.
create function app.release_loan_requests(object uuid, at timestamptz)
returns void
language sql
set search_path = ''
as $$
  select app.end_loan_requests(
    array(select id from app.loan_requests where object_id = object),
    'object_unavailable',
    at
  );

  update app.loan_requests
  set object_id = null,
    publication_id = null,
    terms_version = null,
    former_owner_ids = array(
      select user_id from app.object_owners
      where object_id = object
      order by added_at, user_id
    )
  where object_id = object;
$$;

revoke execute on function app.release_loan_requests(uuid, timestamptz) from public;

-- The borrower's membership in the origin environment stops being active,
-- for any reason (leaving, requirements not met, a type change not accepted).
create function app.end_loan_requests_after_membership_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_loan_requests(
    array(
      select id from app.loan_requests
      where environment_id = new.environment_id and borrower_user_id = new.user_id
    ),
    'access_lost',
    new.updated_at
  );

  return null;
end;
$$;

revoke execute on function app.end_loan_requests_after_membership_change() from public;

create trigger environment_memberships_end_loan_requests
  after update of state on app.environment_memberships
  for each row
  when (old.state = 'active' and new.state <> 'active')
  execute function app.end_loan_requests_after_membership_change();

-- The publication stops being live: withdrawn, rejected, blocked, its access
-- lost or the environment wound down (vision «Publisering i miljøer»). A
-- publication waiting for approval only holds its requests.
create function app.end_loan_requests_after_publication_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_loan_requests(
    array(select id from app.loan_requests where publication_id = new.id),
    'publication_ended',
    new.status_changed_at
  );

  return null;
end;
$$;

revoke execute on function app.end_loan_requests_after_publication_change() from public;

create trigger environment_publications_end_loan_requests
  after update of status on app.environment_publications
  for each row
  when (old.status in ('pending', 'active') and new.status not in ('pending', 'active'))
  execute function app.end_loan_requests_after_publication_change();

-- A friendship ends (PS-USR-004): direct requests of either user end unless
-- another owner of the object is still their friend.
create function app.end_loan_requests_after_friendship_ended()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_loan_requests(
    array(
      select id from app.loan_requests
      where origin = 'direct'
        and borrower_user_id in (new.requester_id, new.addressee_id)
        and not app.has_friend_among_owners(borrower_user_id, object_id)
    ),
    'access_lost',
    new.ended_at
  );

  return null;
end;
$$;

revoke execute on function app.end_loan_requests_after_friendship_ended() from public;

create trigger friendships_end_loan_requests
  after update of status on app.friendships
  for each row
  when (old.status = 'active' and new.status = 'ended')
  execute function app.end_loan_requests_after_friendship_ended();

-- A block between the borrower and any owner, in either direction, ends
-- every request between them, whatever the origin (PS-USR-006).
create function app.end_loan_requests_after_block()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_loan_requests(
    array(
      select request.id from app.loan_requests as request
      join app.object_owners as owner on owner.object_id = request.object_id
      where (request.borrower_user_id = new.blocker_id and owner.user_id = new.blocked_id)
        or (request.borrower_user_id = new.blocked_id and owner.user_id = new.blocker_id)
    ),
    'access_lost',
    new.created_at
  );

  return null;
end;
$$;

revoke execute on function app.end_loan_requests_after_block() from public;

create trigger user_blocks_end_loan_requests
  after insert on app.user_blocks
  for each row execute function app.end_loan_requests_after_block();

-- A conflict between co-owners freezes the object, and its requests end
-- (PS-OBJ-009, vision «Uttreden og fjerning av medeiere»).
create function app.end_loan_requests_after_freeze()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_loan_requests(
    array(select id from app.loan_requests where object_id = new.object_id),
    'object_unavailable',
    new.started_at
  );

  return null;
end;
$$;

revoke execute on function app.end_loan_requests_after_freeze() from public;

create trigger object_freezes_end_loan_requests
  after insert on app.object_freezes
  for each row execute function app.end_loan_requests_after_freeze();

-- An archived object takes no new loans (PS-OBJ-016).
create function app.end_loan_requests_after_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_loan_requests(
    array(select id from app.loan_requests where object_id = new.id),
    'object_unavailable',
    new.archived_at
  );

  return null;
end;
$$;

revoke execute on function app.end_loan_requests_after_archive() from public;

create trigger objects_end_loan_requests
  after update of status on app.objects
  for each row
  when (new.status = 'archived' and old.status <> 'archived')
  execute function app.end_loan_requests_after_archive();

-- A new owner: the borrower's own request ends, and so do requests from a
-- borrower the new owner blocks or is blocked by (PS-USR-006).
create function app.end_loan_requests_after_owner_joined()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_loan_requests(
    array(
      select id from app.loan_requests
      where object_id = new.object_id and borrower_user_id = new.user_id
    ),
    'object_unavailable',
    new.added_at
  );
  perform app.end_loan_requests(
    array(
      select id from app.loan_requests
      where object_id = new.object_id
        and app.users_blocked(borrower_user_id, new.user_id)
    ),
    'access_lost',
    new.added_at
  );

  return null;
end;
$$;

revoke execute on function app.end_loan_requests_after_owner_joined() from public;

create trigger object_owners_end_loan_requests_on_join
  after insert on app.object_owners
  for each row execute function app.end_loan_requests_after_owner_joined();

-- An owner left: a direct request ends if no remaining owner is the
-- borrower's friend. Environment requests follow their publication, which
-- ends when no owner with access is left (WP-25).
create function app.end_loan_requests_after_owner_left()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_loan_requests(
    array(
      select id from app.loan_requests
      where object_id = old.object_id
        and origin = 'direct'
        and not app.has_friend_among_owners(borrower_user_id, object_id)
    ),
    'access_lost',
    clock_timestamp()
  );

  return null;
end;
$$;

revoke execute on function app.end_loan_requests_after_owner_left() from public;

create trigger object_owners_end_loan_requests_on_leave
  after delete on app.object_owners
  for each row execute function app.end_loan_requests_after_owner_left();

-- PS-LOAN-005: every new version of the object is compared with the terms
-- each open request's borrower confirmed. Different terms put the request on
-- hold until the borrower confirms the new ones; terms that are back to what
-- they confirmed release it again. Archiving ends requests separately.
create function app.hold_loan_requests_on_terms_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update app.loan_requests as request
  set status = case
      when app.loan_terms_differ(request.object_id, request.terms_version, new.version)
        then 'awaiting_terms_confirmation'
      else 'requested'
    end,
    status_changed_at = new.recorded_at
  where request.object_id = new.object_id
    and request.status in ('requested', 'awaiting_terms_confirmation')
    and request.status <> case
      when app.loan_terms_differ(request.object_id, request.terms_version, new.version)
        then 'awaiting_terms_confirmation'
      else 'requested'
    end;

  return null;
end;
$$;

revoke execute on function app.hold_loan_requests_on_terms_change() from public;

create trigger object_revisions_hold_loan_requests
  after insert on app.object_revisions
  for each row execute function app.hold_loan_requests_on_terms_change();
