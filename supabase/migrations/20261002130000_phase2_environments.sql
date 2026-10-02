-- Phase 2 environment core (WP-21, PS-ENV-001–006).
--
-- An environment is identified by its id, never by its name (PS-ENV-002).
-- Memberships, roles, requirements and access restrictions keep their history:
-- a change is a new row or a one-way stamp, never a rewrite (PS-NFR-009).
-- Like every table in `app`, nothing here is reachable from the browser.

-- Rows of a history table are fixed once stamped (revoked, lifted, retired).
-- Until then only the columns named in the trigger arguments may change.
create function app.guard_history_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stamp text := tg_argv[0];
  mutable text[] := tg_argv;
begin
  if to_jsonb(old) ->> stamp is not null
    or (to_jsonb(old) - mutable) is distinct from (to_jsonb(new) - mutable)
  then
    raise exception 'only % may change on %.%', array_to_string(mutable, ', '),
      tg_table_schema, tg_table_name
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_history_update() from public;

create table app.environments (
  id uuid primary key default gen_random_uuid(),
  -- PS-ENV-001. Changing the type is a separate process (WP-23).
  type text not null check (type in ('open', 'closed', 'hidden')),
  -- PS-ENV-012 lifecycle. Winding down and archiving arrive with WP-22.
  state text not null default 'active' check (state in ('active')),
  name text not null check (
    name = btrim(name) and char_length(name) between 1 and 100
    and name !~ '[[:cntrl:]]'
  ),
  description text
    check (description = btrim(description) and char_length(description) between 1 and 2000),
  audience text
    check (audience = btrim(audience) and char_length(audience) between 1 and 500),
  object_focus text
    check (object_focus = btrim(object_focus) and char_length(object_focus) between 1 and 500),
  -- Free-text geographic connection. Structured geography is WP-62.
  location text check (
    location = btrim(location) and char_length(location) between 1 and 200
    and location !~ '[[:cntrl:]]'
  ),
  -- Optimistic concurrency for the details above.
  version integer not null default 1 check (version > 0),
  -- Bumped by every change to the membership requirements.
  requirements_revision integer not null default 0 check (requirements_revision >= 0),
  created_by_user_id uuid not null references app.users (id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

comment on table app.environments is
  'Environments (PS-ENV-001–002). Names are not unique; the id is the identity.';

-- Membership requirements (PS-ENV-005–006). A requirement is never edited:
-- a changed text is a new requirement, so it is always clear which wording a
-- member answered or accepted. Removing one retires it.
create table app.environment_requirements (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references app.environments (id),
  -- information: the member gives an answer; acceptance: rules or a
  -- self-declaration the member explicitly accepts.
  kind text not null check (kind in ('information', 'acceptance')),
  text text not null check (text = btrim(text) and char_length(text) between 1 and 2000),
  position smallint not null check (position between 0 and 99),
  introduced_in_revision integer not null check (introduced_in_revision > 0),
  retired_in_revision integer,
  created_at timestamptz not null default clock_timestamp(),
  constraint environment_requirements_retired_after_introduced
    check (retired_in_revision > introduced_in_revision),
  constraint environment_requirements_environment_key unique (id, environment_id)
);

create index environment_requirements_current_idx
  on app.environment_requirements (environment_id, position)
  where retired_in_revision is null;

create trigger environment_requirements_history
  before update on app.environment_requirements
  for each row execute function app.guard_history_update('retired_in_revision', 'position');

-- Contextual roles (PS-ENV-003). Owner and administrator are separate grants so
-- that continuous administrator tenure and ownership changes stay traceable
-- (WP-22). A grant is revoked by stamping it, never deleted.
create table app.environment_role_grants (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references app.environments (id),
  user_id uuid not null references app.users (id),
  role text not null check (role in ('owner', 'administrator')),
  granted_at timestamptz not null default clock_timestamp(),
  granted_by_user_id uuid references app.users (id),
  granted_by_process text check (granted_by_process ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  revoked_at timestamptz,
  revoked_by_user_id uuid references app.users (id),
  revoked_by_process text check (revoked_by_process ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  constraint environment_role_grants_granted_by check (
    num_nonnulls(granted_by_user_id, granted_by_process) = 1
  ),
  constraint environment_role_grants_revocation_shape check (
    (revoked_at is null and num_nonnulls(revoked_by_user_id, revoked_by_process) = 0)
    or (revoked_at is not null and num_nonnulls(revoked_by_user_id, revoked_by_process) = 1)
  )
);

create unique index environment_role_grants_active_key
  on app.environment_role_grants (environment_id, user_id, role)
  where revoked_at is null;

-- At most one owner at a time (PS-ENV-003). Zero is possible while ownerless.
create unique index environment_role_grants_one_owner
  on app.environment_role_grants (environment_id)
  where role = 'owner' and revoked_at is null;

create index environment_role_grants_user_idx
  on app.environment_role_grants (user_id)
  where revoked_at is null;

create trigger environment_role_grants_history
  before update on app.environment_role_grants
  for each row execute function app.guard_history_update(
    'revoked_at', 'revoked_by_user_id', 'revoked_by_process'
  );

-- Memberships with explicit state (PS-ENV-004). A user has at most one
-- current (not ended) membership per environment; a new membership after an
-- ended one is a new row, so earlier periods stay intact.
create table app.environment_memberships (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references app.environments (id),
  user_id uuid not null references app.users (id),
  state text not null check (state in ('pending', 'active', 'passive', 'ended')),
  -- How the membership started.
  origin text not null
    check (origin in ('founder', 'self_service', 'application', 'invitation')),
  -- Administrator review of an application, or of a passive member's request
  -- to become active again.
  review_stage text check (review_stage in ('submitted', 'information_requested')),
  -- The administrator who sent an invitation. The invitation belongs to the
  -- environment and stays valid if that administrator leaves (PS-ENV-010).
  invited_by_user_id uuid references app.users (id),
  activated_at timestamptz,
  -- The requirements revision the member fulfilled when last activated.
  activation_revision integer check (activation_revision >= 0),
  -- PS-ENV-006: an active member who must act on new requirements keeps the
  -- membership until this deadline.
  transition_deadline timestamptz,
  passive_reason text check (passive_reason in ('requirements_not_met')),
  passive_since timestamptz,
  ended_at timestamptz,
  end_reason text check (end_reason in (
    'left', 'application_withdrawn', 'application_rejected',
    'invitation_declined', 'invitation_withdrawn'
  )),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint environment_memberships_environment_key unique (id, environment_id),
  constraint environment_memberships_invitation_shape check (
    (origin = 'invitation') = (invited_by_user_id is not null)
  ),
  constraint environment_memberships_state_shape check (
    case state
      when 'pending' then
        origin in ('application', 'invitation')
        and (review_stage is not null) = (origin = 'application')
        and num_nonnulls(activated_at, activation_revision, transition_deadline,
          passive_reason, passive_since, ended_at, end_reason) = 0
      when 'active' then
        num_nonnulls(activated_at, activation_revision) = 2
        and num_nonnulls(review_stage, passive_reason, passive_since, ended_at, end_reason) = 0
      when 'passive' then
        num_nonnulls(activated_at, activation_revision, passive_reason, passive_since) = 4
        and num_nonnulls(transition_deadline, ended_at, end_reason) = 0
      when 'ended' then
        num_nonnulls(ended_at, end_reason) = 2
        and num_nonnulls(review_stage, transition_deadline) = 0
    end
  )
);

create unique index environment_memberships_current_key
  on app.environment_memberships (environment_id, user_id)
  where state <> 'ended';

create index environment_memberships_user_idx
  on app.environment_memberships (user_id)
  where state <> 'ended';

create index environment_memberships_transition_idx
  on app.environment_memberships (transition_deadline)
  where state = 'active' and transition_deadline is not null;

-- Answers and acceptances given for membership (PS-NFR-008). They belong to the
-- membership process, never to the profile. Composite keys ensure an answer
-- only refers to a requirement of the membership's own environment.
create table app.environment_membership_answers (
  membership_id uuid not null,
  requirement_id uuid not null,
  environment_id uuid not null,
  -- Null for an acceptance; the row itself records that it was accepted.
  answer text check (answer = btrim(answer) and char_length(answer) between 1 and 1000),
  given_at timestamptz not null default clock_timestamp(),
  primary key (membership_id, requirement_id),
  foreign key (membership_id, environment_id)
    references app.environment_memberships (id, environment_id),
  foreign key (requirement_id, environment_id)
    references app.environment_requirements (id, environment_id)
);

-- Barring a user from new membership attempts (PS-ENV-004). Separate from
-- passive membership; lifted by stamping.
create table app.environment_access_restrictions (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references app.environments (id),
  user_id uuid not null references app.users (id),
  imposed_at timestamptz not null default clock_timestamp(),
  imposed_by_user_id uuid not null references app.users (id),
  lifted_at timestamptz,
  lifted_by_user_id uuid references app.users (id),
  constraint environment_access_restrictions_lift_shape check (
    (lifted_at is null) = (lifted_by_user_id is null)
  )
);

create unique index environment_access_restrictions_active_key
  on app.environment_access_restrictions (environment_id, user_id)
  where lifted_at is null;

create trigger environment_access_restrictions_history
  before update on app.environment_access_restrictions
  for each row execute function app.guard_history_update('lifted_at', 'lifted_by_user_id');

-- History that explains current rights is never deleted by product code.
create trigger environments_no_delete
  before delete on app.environments
  for each row execute function app.reject_append_only_mutation();

create trigger environment_requirements_no_delete
  before delete on app.environment_requirements
  for each row execute function app.reject_append_only_mutation();

create trigger environment_role_grants_no_delete
  before delete on app.environment_role_grants
  for each row execute function app.reject_append_only_mutation();

create trigger environment_memberships_no_delete
  before delete on app.environment_memberships
  for each row execute function app.reject_append_only_mutation();

create trigger environment_access_restrictions_no_delete
  before delete on app.environment_access_restrictions
  for each row execute function app.reject_append_only_mutation();
