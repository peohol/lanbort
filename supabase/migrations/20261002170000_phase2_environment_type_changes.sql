-- Phase 2 environment type changes and historical privacy (WP-23,
-- PS-ENV-007–010).
--
-- The type an environment has had is history, not a setting: every type is a
-- period in `app.environment_type_periods`, so the privacy context in which
-- anything was created can always be found again (PS-ENV-009). A weaker type
-- only follows a consent process that ended adopted (PS-ENV-008), and the
-- database refuses anything else.
--
-- What happened first is decided by position, never by clock time: two
-- changes can share a timestamp. Every event historical privacy compares
-- (a type period, a publication, an activation, a passivation) takes the
-- next position when the database writes it. The writes whose order matters
-- in one environment are serialized by the locks the commands hold (the
-- environment row, and the memberships a type change decides), so positions
-- follow the order in which those changes happen.
create sequence app.history_positions as bigint cache 1;

revoke all on sequence app.history_positions from public;

-- Positions are the database's to give: a row never brings its own, even
-- where a column default shows that one is given.
create function app.assign_history_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.position := nextval('app.history_positions');

  return new;
end;
$$;

revoke execute on function app.assign_history_position() from public;

-- Higher is more private. Only the order matters.
create function app.environment_type_rank(environment_type text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case environment_type
    when 'open' then 0
    when 'closed' then 1
    when 'hidden' then 2
  end::smallint
$$;

revoke execute on function app.environment_type_rank(text) from public;

-- PS-ENV-008: a change to weaker privacy is a proposal with a deadline.
-- closed → open asks every active member for consent; hidden → closed is a
-- vote that needs 2/3 of all active members. hidden → open does not exist.
create table app.environment_type_proposals (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references app.environments (id),
  from_type text not null,
  to_type text not null,
  proposed_by_user_id uuid not null references app.users (id),
  proposed_at timestamptz not null default clock_timestamp(),
  deadline timestamptz not null,
  closed_at timestamptz,
  outcome text check (outcome in ('adopted', 'rejected', 'withdrawn', 'lapsed')),
  -- The administrator who withdrew it. Concluding and lapsing are the
  -- consequence of the deadline or of another change.
  closed_by_user_id uuid references app.users (id),
  -- Counted at the deadline: active members, and those of them who supported.
  eligible_count integer check (eligible_count >= 0),
  support_count integer check (support_count >= 0 and support_count <= eligible_count),
  constraint environment_type_proposals_environment_key unique (id, environment_id),
  constraint environment_type_proposals_weaker check (
    (from_type, to_type) in (('closed', 'open'), ('hidden', 'closed'))
  ),
  constraint environment_type_proposals_deadline check (deadline > proposed_at),
  constraint environment_type_proposals_close_shape check (
    (closed_at is null and outcome is null and closed_by_user_id is null
      and eligible_count is null and support_count is null)
    or (closed_at is not null and outcome is not null
      and (outcome = 'withdrawn') = (closed_by_user_id is not null)
      and (outcome in ('adopted', 'rejected')) = (eligible_count is not null)
      and (eligible_count is null) = (support_count is null))
  ),
  -- Consent is individual, so a consent proposal is never rejected as a whole.
  constraint environment_type_proposals_rejected_vote check (
    outcome is distinct from 'rejected' or from_type = 'hidden'
  )
);

create unique index environment_type_proposals_open_key
  on app.environment_type_proposals (environment_id)
  where closed_at is null;

create index environment_type_proposals_deadline_idx
  on app.environment_type_proposals (deadline)
  where closed_at is null;

create trigger environment_type_proposals_history
  before update on app.environment_type_proposals
  for each row execute function app.guard_history_update(
    'closed_at', 'outcome', 'closed_by_user_id', 'eligible_count', 'support_count'
  );

-- A member's answer to a proposal: consent (closed → open) or a vote
-- (hidden → closed). A changed answer supersedes the earlier one.
create table app.environment_type_responses (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  environment_id uuid not null,
  membership_id uuid not null,
  support boolean not null,
  responded_at timestamptz not null default clock_timestamp(),
  superseded_at timestamptz,
  foreign key (proposal_id, environment_id)
    references app.environment_type_proposals (id, environment_id),
  foreign key (membership_id, environment_id)
    references app.environment_memberships (id, environment_id)
);

create unique index environment_type_responses_current_key
  on app.environment_type_responses (proposal_id, membership_id)
  where superseded_at is null;

create trigger environment_type_responses_history
  before update on app.environment_type_responses
  for each row execute function app.guard_history_update('superseded_at');

-- Every type an environment has had, from when (PS-ENV-009). The current
-- type is the latest period; a weaker one names the adopted proposal.
create table app.environment_type_periods (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references app.environments (id),
  type text not null check (type in ('open', 'closed', 'hidden')),
  started_at timestamptz not null default clock_timestamp(),
  position bigint not null default nextval('app.history_positions'),
  proposal_id uuid,
  constraint environment_type_periods_position_key unique (environment_id, position),
  foreign key (proposal_id, environment_id)
    references app.environment_type_proposals (id, environment_id)
);

-- PS-ENV-007/008 at the source: a new period must change the type, and a
-- weaker type needs the adopted proposal for exactly this step. Stricter
-- types need no consent and name no proposal.
create function app.check_environment_type_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous_type text;
begin
  select type into previous_type
  from app.environment_type_periods
  where environment_id = new.environment_id
  order by position desc
  limit 1;

  if previous_type is null then
    if new.proposal_id is not null then
      raise exception 'the first type of environment % needs no proposal', new.environment_id
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if previous_type = new.type then
    raise exception 'environment % already has type %', new.environment_id, new.type
      using errcode = 'check_violation';
  end if;

  if app.environment_type_rank(new.type) > app.environment_type_rank(previous_type) then
    if new.proposal_id is not null then
      raise exception 'a stricter type needs no proposal'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if not exists (
    select from app.environment_type_proposals
    where id = new.proposal_id
      and environment_id = new.environment_id
      and from_type = previous_type
      and to_type = new.type
      and outcome = 'adopted'
  ) then
    raise exception 'environment % cannot become % without an adopted proposal',
      new.environment_id, new.type
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.check_environment_type_period() from public;

create trigger environment_type_periods_check
  before insert on app.environment_type_periods
  for each row execute function app.check_environment_type_period();

create trigger environment_type_periods_position
  before insert on app.environment_type_periods
  for each row execute function app.assign_history_position();

-- Existing environments start their history with the type they have, before
-- anything that happened in them is given a position below.
insert into app.environment_type_periods (environment_id, type, started_at)
select id, type, created_at from app.environments order by created_at, id;

-- A new environment's first period is written with it.
create function app.start_environment_type_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into app.environment_type_periods (environment_id, type, started_at)
  values (new.id, new.type, new.created_at);

  return null;
end;
$$;

revoke execute on function app.start_environment_type_history() from public;

create trigger environments_type_history
  after insert on app.environments
  for each row execute function app.start_environment_type_history();

-- The environment's type is always its latest period, checked at commit so a
-- command can write both in either order.
create function app.check_environment_type()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  environment uuid;
begin
  if tg_table_name = 'environments' then
    environment := new.id;
  else
    environment := new.environment_id;
  end if;

  if (
    select type from app.environments where id = environment
  ) is distinct from (
    select type from app.environment_type_periods
    where environment_id = environment
    order by position desc
    limit 1
  ) then
    raise exception 'the type of environment % does not match its history', environment
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

revoke execute on function app.check_environment_type() from public;

create constraint trigger environments_type_matches_history
  after update of type on app.environments
  deferrable initially deferred
  for each row execute function app.check_environment_type();

create constraint trigger environment_type_periods_match
  after insert on app.environment_type_periods
  deferrable initially deferred
  for each row execute function app.check_environment_type();

-- Memberships and type changes (PS-ENV-008, vision: «Ventende innmelding når
-- regler eller miljøtype endres»):
-- - a member who did not accept a weaker type is passive for that reason;
-- - an application ends neutrally when the environment becomes hidden;
-- - after closed → open an applicant must confirm the wish to join.
alter table app.environment_memberships drop constraint environment_memberships_passive_reason_check;
alter table app.environment_memberships add constraint environment_memberships_passive_reason_check
  check (passive_reason in ('requirements_not_met', 'type_change_not_accepted'));

alter table app.environment_memberships drop constraint environment_memberships_end_reason_check;
alter table app.environment_memberships add constraint environment_memberships_end_reason_check
  check (end_reason in (
    'left', 'application_withdrawn', 'application_rejected',
    'invitation_declined', 'invitation_withdrawn', 'environment_wound_down',
    'environment_type_changed'
  ));

alter table app.environment_memberships drop constraint environment_memberships_review_stage_check;
alter table app.environment_memberships add constraint environment_memberships_review_stage_check
  check (review_stage in ('submitted', 'information_requested', 'confirmation_required'));

alter table app.environment_memberships add constraint environment_memberships_confirmation_shape
  check (review_stage is distinct from 'confirmation_required'
    or (state = 'pending' and origin = 'application'));

-- Publications are created in a privacy context (WP-25): their position.
-- Existing ones come after every environment's first period, and nothing
-- has become less private yet, so their order among themselves is moot.
alter table app.environment_publications
  add column position bigint not null default nextval('app.history_positions');

create trigger environment_publications_position
  before insert on app.environment_publications
  for each row execute function app.assign_history_position();

-- A member's current active period, and passivity, start at a position.
-- Each new active or passive period takes the next one; otherwise the
-- position stays as it is.
alter table app.environment_memberships
  add column activated_position bigint,
  add column passive_position bigint;

update app.environment_memberships
set activated_position = nextval('app.history_positions')
where activated_at is not null;

update app.environment_memberships
set passive_position = nextval('app.history_positions')
where passive_since is not null;

create function app.position_membership_periods()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.activated_at is null then
    new.activated_position := null;
  elsif tg_op = 'INSERT'
    or old.activated_at is distinct from new.activated_at
    or (old.state is distinct from 'active' and new.state = 'active') then
    new.activated_position := nextval('app.history_positions');
  else
    new.activated_position := old.activated_position;
  end if;

  if new.passive_since is null then
    new.passive_position := null;
  elsif tg_op = 'INSERT'
    or old.passive_since is distinct from new.passive_since
    or (old.state is distinct from 'passive' and new.state = 'passive') then
    new.passive_position := nextval('app.history_positions');
  else
    new.passive_position := old.passive_position;
  end if;

  return new;
end;
$$;

revoke execute on function app.position_membership_periods() from public;

create trigger environment_memberships_positions
  before insert or update on app.environment_memberships
  for each row execute function app.position_membership_periods();

alter table app.environment_memberships add constraint environment_memberships_positions_shape
  check ((activated_at is null) = (activated_position is null)
    and (passive_since is null) = (passive_position is null));

create trigger environment_type_proposals_no_delete
  before delete on app.environment_type_proposals
  for each row execute function app.reject_append_only_mutation();

create trigger environment_type_responses_no_delete
  before delete on app.environment_type_responses
  for each row execute function app.reject_append_only_mutation();

create trigger environment_type_periods_no_change
  before update or delete on app.environment_type_periods
  for each row execute function app.reject_append_only_mutation();
