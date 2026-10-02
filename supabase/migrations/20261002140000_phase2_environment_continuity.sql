-- Phase 2 environment roles and continuity (WP-22, PS-ENV-003, PS-ENV-012–014).
--
-- Roles, role invitations, ownership vacancies and winding down keep their
-- history like the rest of the environment model: a decision stamps a row,
-- a new period is a new row, and nothing is deleted (PS-NFR-009).

-- PS-ENV-012: winding down is its own state. Archiving follows later, once
-- loans and cases can tell when nothing is active any more.
alter table app.environments drop constraint environments_state_check;
alter table app.environments add constraint environments_state_check
  check (state in ('active', 'winding_down'));

-- Pending applications and invitations that end when winding down is final.
alter table app.environment_memberships drop constraint environment_memberships_end_reason_check;
alter table app.environment_memberships add constraint environment_memberships_end_reason_check
  check (end_reason in (
    'left', 'application_withdrawn', 'application_rejected',
    'invitation_declined', 'invitation_withdrawn', 'environment_wound_down'
  ));

-- Why a role ended. Continuous administrator tenure is the active grant's
-- `granted_at`, so a role that ends and is granted again starts over.
alter table app.environment_role_grants
  add column revoke_reason text check (
    revoke_reason in ('resigned', 'removed', 'transferred', 'account_departed')
  ),
  add constraint environment_role_grants_revoke_reason_shape
    check ((revoked_at is null) = (revoke_reason is null));

drop trigger environment_role_grants_history on app.environment_role_grants;
create trigger environment_role_grants_history
  before update on app.environment_role_grants
  for each row execute function app.guard_history_update(
    'revoked_at', 'revoked_by_user_id', 'revoked_by_process', 'revoke_reason'
  );

-- A role becomes active only when the invited member accepts (PS-ENV-003).
-- An administrator invitation belongs to the environment and survives its
-- sender; an ownership invitation is the owner's offer to hand over and
-- lapses if that owner no longer owns the environment.
create table app.environment_role_invitations (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references app.environments (id),
  user_id uuid not null references app.users (id),
  role text not null check (role in ('owner', 'administrator')),
  invited_by_user_id uuid not null references app.users (id),
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  outcome text check (outcome in ('accepted', 'declined', 'withdrawn', 'lapsed')),
  -- The invitee (accepted, declined) or the administrator who withdrew it.
  -- Lapsing is a consequence of another change and has no one deciding it.
  closed_by_user_id uuid references app.users (id),
  constraint environment_role_invitations_not_self check (user_id <> invited_by_user_id),
  constraint environment_role_invitations_close_shape check (
    (closed_at is null and outcome is null and closed_by_user_id is null)
    or (closed_at is not null and outcome is not null
      and (outcome = 'lapsed') = (closed_by_user_id is null))
  )
);

create unique index environment_role_invitations_pending_key
  on app.environment_role_invitations (environment_id, user_id, role)
  where closed_at is null;

-- One ownership handover at a time.
create unique index environment_role_invitations_one_handover
  on app.environment_role_invitations (environment_id)
  where role = 'owner' and closed_at is null;

create index environment_role_invitations_user_idx
  on app.environment_role_invitations (user_id)
  where closed_at is null;

create trigger environment_role_invitations_history
  before update on app.environment_role_invitations
  for each row execute function app.guard_history_update(
    'closed_at', 'outcome', 'closed_by_user_id'
  );

-- PS-ENV-013: an owner who disappears without handing over leaves the
-- environment temporarily ownerless. Remaining administrators may register
-- interest until the deadline; then the one with the longest continuous
-- administrator tenure becomes owner, or the environment winds down.
create table app.environment_ownership_vacancies (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references app.environments (id),
  former_owner_user_id uuid not null references app.users (id),
  opened_at timestamptz not null default clock_timestamp(),
  claim_deadline timestamptz not null,
  closed_at timestamptz,
  outcome text check (outcome in ('claimed', 'wound_down')),
  new_owner_user_id uuid references app.users (id),
  constraint environment_ownership_vacancies_deadline check (claim_deadline > opened_at),
  constraint environment_ownership_vacancies_close_shape check (
    (closed_at is null and outcome is null and new_owner_user_id is null)
    or (closed_at is not null and outcome is not null
      and (outcome = 'claimed') = (new_owner_user_id is not null))
  )
);

create unique index environment_ownership_vacancies_open_key
  on app.environment_ownership_vacancies (environment_id)
  where closed_at is null;

create index environment_ownership_vacancies_deadline_idx
  on app.environment_ownership_vacancies (claim_deadline)
  where closed_at is null;

create trigger environment_ownership_vacancies_history
  before update on app.environment_ownership_vacancies
  for each row execute function app.guard_history_update(
    'closed_at', 'outcome', 'new_owner_user_id'
  );

-- An administrator's registered interest in taking over. Withdrawing stamps
-- the row; registering again is a new row.
create table app.environment_ownership_claims (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references app.environment_ownership_vacancies (id),
  user_id uuid not null references app.users (id),
  claimed_at timestamptz not null default clock_timestamp(),
  withdrawn_at timestamptz
);

create unique index environment_ownership_claims_current_key
  on app.environment_ownership_claims (vacancy_id, user_id)
  where withdrawn_at is null;

create trigger environment_ownership_claims_history
  before update on app.environment_ownership_claims
  for each row execute function app.guard_history_update('withdrawn_at');

-- PS-ENV-012: winding down. A voluntary one can be cancelled by the owner
-- until `final_at` (7 days); one caused by ownerlessness is final at once.
-- `settled_at` records the cancellation, or when the job closed the processes
-- that were left waiting once it became final.
create table app.environment_wind_downs (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references app.environments (id),
  reason text not null check (reason in ('voluntary', 'ownerless')),
  started_at timestamptz not null default clock_timestamp(),
  started_by_user_id uuid references app.users (id),
  final_at timestamptz not null,
  settled_at timestamptz,
  outcome text check (outcome in ('cancelled', 'finalized')),
  settled_by_user_id uuid references app.users (id),
  constraint environment_wind_downs_started_by check (
    (reason = 'voluntary') = (started_by_user_id is not null)
  ),
  constraint environment_wind_downs_final_after_start check (final_at >= started_at),
  constraint environment_wind_downs_settle_shape check (
    (settled_at is null and outcome is null and settled_by_user_id is null)
    or (outcome = 'cancelled' and reason = 'voluntary'
      and settled_by_user_id is not null and settled_at < final_at)
    or (outcome = 'finalized' and settled_by_user_id is null and settled_at >= final_at)
  )
);

-- A cancelled wind-down is history; any other one is the current one.
create unique index environment_wind_downs_current_key
  on app.environment_wind_downs (environment_id)
  where outcome is distinct from 'cancelled';

create index environment_wind_downs_unsettled_idx
  on app.environment_wind_downs (final_at)
  where settled_at is null;

create trigger environment_wind_downs_history
  before update on app.environment_wind_downs
  for each row execute function app.guard_history_update(
    'settled_at', 'outcome', 'settled_by_user_id'
  );

create trigger environment_role_invitations_no_delete
  before delete on app.environment_role_invitations
  for each row execute function app.reject_append_only_mutation();

create trigger environment_ownership_vacancies_no_delete
  before delete on app.environment_ownership_vacancies
  for each row execute function app.reject_append_only_mutation();

create trigger environment_ownership_claims_no_delete
  before delete on app.environment_ownership_claims
  for each row execute function app.reject_append_only_mutation();

create trigger environment_wind_downs_no_delete
  before delete on app.environment_wind_downs
  for each row execute function app.reject_append_only_mutation();

-- PS-ENV-003 / PS-ENV-013 as a database invariant, checked at commit so a
-- command may pass through intermediate states inside its transaction:
-- - the owner is also an administrator;
-- - an active environment has its owner, or an open ownership vacancy;
-- - a vacancy only exists while there is no owner and nothing winds down;
-- - the state is `winding_down` exactly while a wind-down is current.
create function app.check_environment_continuity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  environment uuid;
  environment_state text;
  owner uuid;
  has_vacancy boolean;
  has_wind_down boolean;
begin
  if tg_table_name = 'environments' then
    environment := new.id;
  else
    environment := new.environment_id;
  end if;

  select state into environment_state
  from app.environments
  where id = environment;

  select user_id into owner
  from app.environment_role_grants
  where environment_id = environment and role = 'owner' and revoked_at is null;

  select exists (
    select from app.environment_ownership_vacancies
    where environment_id = environment and closed_at is null
  ) into has_vacancy;

  select exists (
    select from app.environment_wind_downs
    where environment_id = environment and outcome is distinct from 'cancelled'
  ) into has_wind_down;

  if owner is not null and not exists (
    select from app.environment_role_grants
    where environment_id = environment and user_id = owner
      and role = 'administrator' and revoked_at is null
  ) then
    raise exception 'the owner of environment % must be an administrator', environment
      using errcode = 'check_violation';
  end if;

  if has_vacancy and (owner is not null or environment_state <> 'active') then
    raise exception 'environment % has an ownership vacancy it cannot have', environment
      using errcode = 'check_violation';
  end if;

  if environment_state = 'active' and owner is null and not has_vacancy then
    raise exception 'active environment % has no owner', environment
      using errcode = 'check_violation';
  end if;

  if (environment_state = 'winding_down') <> has_wind_down then
    raise exception 'state of environment % does not match its wind-down', environment
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

revoke execute on function app.check_environment_continuity() from public;

create constraint trigger environments_continuity
  after insert or update of state on app.environments
  deferrable initially deferred
  for each row execute function app.check_environment_continuity();

create constraint trigger environment_role_grants_continuity
  after insert or update on app.environment_role_grants
  deferrable initially deferred
  for each row execute function app.check_environment_continuity();

create constraint trigger environment_ownership_vacancies_continuity
  after insert or update on app.environment_ownership_vacancies
  deferrable initially deferred
  for each row execute function app.check_environment_continuity();

create constraint trigger environment_wind_downs_continuity
  after insert or update on app.environment_wind_downs
  deferrable initially deferred
  for each row execute function app.check_environment_continuity();
