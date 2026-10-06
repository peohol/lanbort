-- Visibility for friends (WP-27, PS-OBJ-020, OD-0013).
--
-- An owner can make an object visible to friends, a publishing choice of its
-- own next to the environment publications (PS-OBJ-006). It is off until an
-- owner turns it on. Like a publication it is a row of its own, never part of
-- the object: turning it on or off changes neither the object nor its
-- version. A withdrawn row is history, and turning it on again is a new row.
--
-- Who finds such an object is decided where it is read, with the same limits
-- as every other way of finding an object (the domain's friend discovery). A
-- direct request needs it: turning it off ends the object's open direct
-- requests neutrally in the same transaction (PS-LOAN-002).

create table app.object_friend_publications (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references app.objects (id) on delete cascade,
  published_by_user_id uuid not null references app.users (id),
  published_at timestamptz not null default clock_timestamp(),
  withdrawn_at timestamptz,
  withdrawn_by_user_id uuid references app.users (id),
  constraint object_friend_publications_withdrawal_shape check (
    (withdrawn_at is null) = (withdrawn_by_user_id is null)
    and (withdrawn_at is null or withdrawn_at >= published_at)
  )
);

comment on table app.object_friend_publications is
  'Objects made visible to their owners'' friends (PS-OBJ-020), with history.';

-- At most one current row per object.
create unique index object_friend_publications_current_key
  on app.object_friend_publications (object_id)
  where withdrawn_at is null;

-- Whether an owner has made the object visible to friends now.
create function app.object_visible_to_friends(object uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from app.object_friend_publications
    where object_id = object and withdrawn_at is null
  );
$$;

revoke execute on function app.object_visible_to_friends(uuid) from public;

-- Only an owner of an active object that is not frozen turns it on (PS-OBJ-009,
-- PS-OBJ-016). The domain checks this first and answers; this is the backstop.
create function app.guard_new_friend_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.withdrawn_at is not null
    or not exists (
      select 1 from app.objects where id = new.object_id and status = 'active'
    )
    or not exists (
      select 1 from app.object_owners
      where object_id = new.object_id and user_id = new.published_by_user_id
    )
    or exists (
      select 1 from app.object_freezes
      where object_id = new.object_id and ended_at is null
    )
  then
    raise exception 'object % cannot be made visible to friends', new.object_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_friend_publication() from public;

create trigger object_friend_publications_guard
  before insert on app.object_friend_publications
  for each row execute function app.guard_new_friend_publication();

create trigger object_friend_publications_active_accounts
  before insert on app.object_friend_publications
  for each row execute function app.require_active_accounts('published_by_user_id');

-- A row only ever changes once: when it is withdrawn.
create function app.guard_friend_publication_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.withdrawn_at is not null
    or new.withdrawn_at is null
    or to_jsonb(new) - array['withdrawn_at', 'withdrawn_by_user_id']
      <> to_jsonb(old) - array['withdrawn_at', 'withdrawn_by_user_id']
  then
    raise exception 'a friend publication only changes when it is withdrawn'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_friend_publication_update() from public;

create trigger object_friend_publications_history
  before update on app.object_friend_publications
  for each row execute function app.guard_friend_publication_update();

-- Turned off: the object's open direct requests end neutrally (PS-OBJ-020).
create function app.end_loan_requests_after_friend_publication_withdrawn()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_loan_requests(
    array(
      select id from app.loan_requests
      where object_id = new.object_id and origin = 'direct'
    ),
    'publication_ended',
    new.withdrawn_at
  );

  return null;
end;
$$;

revoke execute on function app.end_loan_requests_after_friend_publication_withdrawn()
  from public;

create trigger object_friend_publications_end_loan_requests
  after update of withdrawn_at on app.object_friend_publications
  for each row
  when (old.withdrawn_at is null and new.withdrawn_at is not null)
  execute function app.end_loan_requests_after_friend_publication_withdrawn();

-- As in the account lifecycle migration, and a direct request also needs the
-- object to be visible to friends (PS-OBJ-020). The backstop for making a
-- request and for approving it.
create or replace function app.loan_request_access_holds(
  object uuid,
  borrower uuid,
  origin text,
  environment uuid,
  publication uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from app.objects where id = object and status = 'active')
    and not exists (
      select 1 from app.object_freezes where object_id = object and ended_at is null
    )
    and not exists (
      select 1 from app.object_owners where object_id = object and user_id = borrower
    )
    and app.account_accepts_new_activity(borrower)
    and app.object_has_active_owner(object)
    and not app.blocked_with_an_owner(borrower, object)
    and case origin
      when 'direct' then app.object_visible_to_friends(object)
        and app.has_friend_among_owners(borrower, object)
      else exists (
        select 1 from app.environment_publications
        where id = publication and status = 'active'
      )
      and exists (
        select 1 from app.environment_memberships
        where environment_id = environment and user_id = borrower and state = 'active'
      )
    end;
$$;

-- Until now a direct request needed no such choice. No object has made it
-- yet, so open direct requests end as if it had been turned off.
select app.end_loan_requests(
  array(select id from app.loan_requests where origin = 'direct'),
  'publication_ended',
  clock_timestamp()
);

-- Finn (WP-61) indexes what can be found: through an environment or, now,
-- through friends. Who finds it is still decided when searching.
create or replace view app.search_object_sources as
select
  object.id as object_id,
  app.search_document(object.title, category.label, object.description) as document
from app.objects as object
join app.object_categories as category on category.id = object.category_id
where object.status = 'active'
  and (
    exists (
      select 1 from app.environment_publications as publication
      where publication.object_id = object.id and publication.status = 'active'
    )
    or app.object_visible_to_friends(object.id)
  );
