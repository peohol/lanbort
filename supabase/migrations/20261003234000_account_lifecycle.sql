-- Account lifecycle (WP-53, PS-ADM-001–006, PS-ADM-014).
--
-- An account has an explicit state, and the reason it is in that state is
-- kept apart from the state itself (PS-ADM-001):
-- - `active`: an ordinary account (after registration);
-- - `dormant`: put to rest after long inactivity (reason `inactivity`);
-- - `deactivated`: the user stopped new activity themselves (`user_request`);
-- - `suspended`: the platform stopped the user's participation (`platform`);
-- - `closing`: the platform is closing the account in a controlled way
--   (`platform`): new activity is stopped while existing bindings are
--   handled by the ordinary rules;
-- - `deleted`: permanently deleted, by the user (`user_request`) or at the
--   end of a controlled closure (`platform`). The row stays as the
--   pseudonymous anchor of shared history: profile, contacts and active
--   relations are gone, so the id alone no longer identifies anyone
--   (PS-ADM-006).
--
-- Every change of state after registration is an append-only row saying
-- from what to what, why, when and by whom, and for platform interventions
-- on what basis (PS-ADM-014). The basis is kept only there, never in events
-- or logs. Only `active` takes new activity: a request or a loan cannot be
-- started by or for an account in any other state, and when an account stops
-- being active its open requests, and those no owner can lend any more, end
-- neutrally in the same transaction. Existing loans and other bindings stay
-- with the account's minimum access (PS-ADM-002, PS-LOAN-021); the domain's
-- policies decide that access.

alter table app.users
  drop constraint users_status_check,
  add constraint users_status_check check (status in (
    'pending_registration', 'active', 'dormant', 'deactivated', 'suspended',
    'closing', 'deleted'
  )),
  add column status_reason text
    check (status_reason in ('user_request', 'inactivity', 'platform')),
  add column status_changed_at timestamptz,
  add constraint users_status_reason_shape check (
    case status
      when 'pending_registration' then status_reason is null
      when 'active' then status_reason is null
      when 'dormant' then status_reason = 'inactivity'
      when 'deactivated' then status_reason = 'user_request'
      when 'suspended' then status_reason = 'platform'
      when 'closing' then status_reason = 'platform'
      when 'deleted' then status_reason in ('user_request', 'platform')
    end
  );

-- The changes a reason allows (PS-ADM-001–006). Registration
-- (pending_registration → active) is not a lifecycle change. A deleted
-- account never changes again. The domain has the same table
-- (`accountTransitions`).
create function app.account_transition_allowed(from_status text, to_status text, reason text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (from_status, to_status, reason) in (
    ('active', 'deactivated', 'user_request'),
    ('active', 'dormant', 'inactivity'),
    ('deactivated', 'active', 'user_request'),
    ('dormant', 'active', 'user_request'),
    ('active', 'suspended', 'platform'),
    ('deactivated', 'suspended', 'platform'),
    ('dormant', 'suspended', 'platform'),
    ('suspended', 'active', 'platform'),
    ('active', 'closing', 'platform'),
    ('deactivated', 'closing', 'platform'),
    ('dormant', 'closing', 'platform'),
    ('suspended', 'closing', 'platform'),
    ('closing', 'active', 'platform'),
    ('active', 'deleted', 'user_request'),
    ('deactivated', 'deleted', 'user_request'),
    ('dormant', 'deleted', 'user_request'),
    ('closing', 'deleted', 'platform')
  );
$$;

revoke execute on function app.account_transition_allowed(text, text, text) from public;

-- PS-ADM-014: one row per change of an account's state. A user changes only
-- their own account; the inactivity process only puts it to rest; a platform
-- steward never acts on their own account (PS-USR-009) and always gives the
-- basis for the intervention.
create table app.account_status_changes (
  id uuid primary key default gen_random_uuid(),
  position bigint generated always as identity unique,
  user_id uuid not null references app.users (id),
  from_status text not null,
  to_status text not null,
  reason text not null check (reason in ('user_request', 'inactivity', 'platform')),
  changed_at timestamptz not null,
  changed_by_user_id uuid references app.users (id),
  changed_by_process text check (changed_by_process ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  -- Why the platform intervened. Never copied into events or logs.
  basis text check (basis = btrim(basis) and char_length(basis) between 1 and 2000),
  constraint account_status_changes_changed_by check (
    num_nonnulls(changed_by_user_id, changed_by_process) = 1
  ),
  constraint account_status_changes_reason_shape check (
    case reason
      when 'user_request' then changed_by_user_id = user_id and basis is null
      when 'inactivity' then changed_by_process is not null and basis is null
      when 'platform' then changed_by_user_id <> user_id and basis is not null
    end
  )
);

comment on table app.account_status_changes is
  'Every lifecycle change of an account, with reason, actor and the platform''s basis (PS-ADM-001, PS-ADM-014).';

create index account_status_changes_user_idx
  on app.account_status_changes (user_id, position);

create trigger account_status_changes_immutable
  before update or delete on app.account_status_changes
  for each row execute function app.reject_append_only_mutation();

create trigger account_status_changes_no_truncate
  before truncate on app.account_status_changes
  for each statement execute function app.reject_append_only_mutation();

-- A change starts from the account's current state and is one the reason
-- allows.
create function app.guard_new_account_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.users where id = new.user_id and status = new.from_status
  ) or not app.account_transition_allowed(new.from_status, new.to_status, new.reason)
  then
    raise exception 'account % cannot change from % to % (%)',
      new.user_id, new.from_status, new.to_status, new.reason
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_account_status_change() from public;

create trigger account_status_changes_guard
  before insert on app.account_status_changes
  for each row execute function app.guard_new_account_status_change();

-- The account's state changes only together with its recorded change, and
-- its stored reason is that change's (none once active again).
create function app.guard_account_status_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'pending_registration' and new.status = 'active' then
    if new.status_reason is not null
      or new.status_changed_at is distinct from old.status_changed_at
    then
      raise exception 'registration does not change the lifecycle of account %', old.id
        using errcode = 'restrict_violation';
    end if;

    return new;
  end if;

  if (old.status, old.status_reason, old.status_changed_at)
      is not distinct from (new.status, new.status_reason, new.status_changed_at)
  then
    return new;
  end if;

  if not exists (
    select 1 from app.account_status_changes
    where user_id = new.id
      and from_status = old.status
      and to_status = new.status
      and changed_at = new.status_changed_at
      and new.status_reason is not distinct from
        case when new.status = 'active' then null else reason end
  ) then
    raise exception 'account % changes state only with its recorded change', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_account_status_update() from public;

create trigger users_status_history
  before update on app.users
  for each row execute function app.guard_account_status_update();

-- Only an active account takes new activity: requests, loans, new contact.
create function app.account_accepts_new_activity(account uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from app.users where id = account and status = 'active');
$$;

revoke execute on function app.account_accepts_new_activity(uuid) from public;

-- An owner who can lend the object now: someone has to be able to approve
-- and hand it over. An object whose owners are all inactive takes no new
-- loans and is not found in environments (vision «Brukerkontoens
-- livssyklus»: the objects of an account at rest are hidden).
create function app.object_has_active_owner(object uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from app.object_owners
    where object_id = object and app.account_accepts_new_activity(user_id)
  );
$$;

revoke execute on function app.object_has_active_owner(uuid) from public;

-- PS-LOAN-001 / PS-USR-004, as in WP-30, and the friend must be an owner
-- who can lend now.
create or replace function app.has_friend_among_owners(borrower uuid, object uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from app.object_owners
    where object_id = object
      and user_id <> borrower
      and app.account_accepts_new_activity(user_id)
      and app.users_are_friends(user_id, borrower)
  );
$$;

-- As in WP-31, and the borrower's account takes new activity and an owner
-- can lend the object (PS-ADM-002–003).
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
      when 'direct' then app.has_friend_among_owners(borrower, object)
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

-- New activity holds the accounts it is for (the columns named in the
-- trigger arguments, where set) until it commits, and they must be active. A
-- concurrent change of state therefore either comes first, and the new
-- activity is refused, or waits and then sees it (and ends it, for a
-- request). The domain locks the signed-in actor's account first in every
-- command; this also holds the other accounts a command builds on.
create function app.require_active_accounts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  accounts uuid[] := array(
    select (to_jsonb(new) ->> column_name)::uuid
    from unnest(tg_argv) as column_name
    where to_jsonb(new) ->> column_name is not null
  );
begin
  perform 1 from app.users where id = any(accounts) order by id for share;

  if exists (
    select 1 from unnest(accounts) as account
    where not app.account_accepts_new_activity(account)
  ) then
    raise exception 'an account of this % does not take new activity', tg_table_name
      using errcode = 'restrict_violation', constraint = 'account_takes_new_activity';
  end if;

  return new;
end;
$$;

revoke execute on function app.require_active_accounts() from public;

create trigger loan_requests_active_accounts
  before insert on app.loan_requests
  for each row execute function app.require_active_accounts('borrower_user_id');

create trigger loans_active_accounts
  before insert on app.loans
  for each row execute function app.require_active_accounts(
    'borrower_user_id', 'responsible_lender_id'
  );

-- Everything else that builds a new relation or binding on an account
-- (PS-ADM-001–002): objects and their ownership, co-ownership invitations,
-- environments, memberships, roles and claims to them, type proposals,
-- publications, friendships, and taking on a loan's lender role. Only the
-- accounts the new row binds count: a lender handing the role on, or anyone
-- winding down, does it with minimum access.
create trigger objects_active_accounts
  before insert on app.objects
  for each row execute function app.require_active_accounts('created_by_user_id');

create trigger object_owners_active_accounts
  before insert on app.object_owners
  for each row execute function app.require_active_accounts('user_id');

create trigger object_co_owner_invitations_active_accounts
  before insert on app.object_co_owner_invitations
  for each row execute function app.require_active_accounts(
    'invited_by_user_id', 'invited_user_id'
  );

create trigger environments_active_accounts
  before insert on app.environments
  for each row execute function app.require_active_accounts('created_by_user_id');

create trigger environment_memberships_active_accounts
  before insert on app.environment_memberships
  for each row execute function app.require_active_accounts(
    'user_id', 'invited_by_user_id'
  );

create trigger environment_memberships_activation_active_accounts
  before update of state on app.environment_memberships
  for each row
  when (old.state <> 'active' and new.state = 'active')
  execute function app.require_active_accounts('user_id');

create trigger environment_role_invitations_active_accounts
  before insert on app.environment_role_invitations
  for each row execute function app.require_active_accounts(
    'invited_by_user_id', 'user_id'
  );

create trigger environment_role_grants_active_accounts
  before insert on app.environment_role_grants
  for each row execute function app.require_active_accounts('user_id');

create trigger environment_ownership_claims_active_accounts
  before insert on app.environment_ownership_claims
  for each row execute function app.require_active_accounts('user_id');

create trigger environment_type_proposals_active_accounts
  before insert on app.environment_type_proposals
  for each row execute function app.require_active_accounts('proposed_by_user_id');

create trigger environment_publications_active_accounts
  before insert on app.environment_publications
  for each row execute function app.require_active_accounts('published_by_user_id');

create trigger friendships_active_accounts
  before insert on app.friendships
  for each row execute function app.require_active_accounts('requester_id', 'addressee_id');

create trigger friendships_acceptance_active_accounts
  before update of status on app.friendships
  for each row
  when (old.status = 'pending' and new.status = 'active')
  execute function app.require_active_accounts('requester_id', 'addressee_id');

create trigger loan_lender_transfers_active_accounts
  before insert on app.loan_lender_transfers
  for each row execute function app.require_active_accounts('to_user_id');

create trigger loan_request_responsibility_acceptances_active_accounts
  before insert on app.loan_request_responsibility_acceptances
  for each row execute function app.require_active_accounts('user_id');

-- Cases (WP-45): opening a contact or a report, and everything a handler
-- does or writes, is new activity (handling a case needs an active account).
-- A mediation is part of finishing a loan, and a party writing in an open
-- case keeps what it has (PS-ADM-002); a case going back to the queue names
-- the handler who left it.
create trigger cases_active_accounts
  before insert on app.cases
  for each row when (new.kind <> 'loan_mediation')
  execute function app.require_active_accounts('opened_by_user_id');

create trigger case_actions_active_accounts
  before insert on app.case_actions
  for each row when (new.kind <> 'returned_to_queue')
  execute function app.require_active_accounts('actor_user_id');

create trigger case_assignments_active_accounts
  before insert on app.case_actions
  for each row when (new.kind = 'assigned')
  execute function app.require_active_accounts('target_user_id');

create trigger case_handler_entries_active_accounts
  before insert on app.case_entries
  for each row when (new.capacity = 'handler')
  execute function app.require_active_accounts('author_user_id');

-- An account stops being active: what was waiting for it to start
-- something new ends neutrally, like any other lost access (PS-LOAN-002):
-- - its own open requests (`access_lost`);
-- - open requests for an object it owns that no owner can lend any more
--   (`object_unavailable`);
-- - direct requests for such an object whose borrower has no active friend
--   among the owners any more (`access_lost`);
-- - transfers of a lender's role to it, which it can no longer accept.
-- Loans already approved stay; so does what it offered to others.
create function app.stop_new_activity_of_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.end_loan_requests(
    array(select id from app.loan_requests where borrower_user_id = new.id),
    'access_lost',
    new.status_changed_at
  );
  perform app.end_loan_requests(
    array(
      select request.id
      from app.loan_requests as request
      join app.object_owners as owner
        on owner.object_id = request.object_id and owner.user_id = new.id
      where not app.object_has_active_owner(request.object_id)
    ),
    'object_unavailable',
    new.status_changed_at
  );
  perform app.end_loan_requests(
    array(
      select request.id
      from app.loan_requests as request
      join app.object_owners as owner
        on owner.object_id = request.object_id and owner.user_id = new.id
      where request.origin = 'direct'
        and not app.has_friend_among_owners(request.borrower_user_id, request.object_id)
    ),
    'access_lost',
    new.status_changed_at
  );

  update app.loan_lender_transfers
  set status = 'lapsed', resolved_at = new.status_changed_at
  where to_user_id = new.id and status = 'proposed';

  return null;
end;
$$;

revoke execute on function app.stop_new_activity_of_account() from public;

create trigger users_stop_new_activity
  after update of status on app.users
  for each row
  when (old.status = 'active' and new.status <> 'active')
  execute function app.stop_new_activity_of_account();

-- PS-ADM-003: a suspension stops reserved loans that have not reached their
-- handover day, administratively (`stopped`). Nobody ended them, and it is
-- neither a party's cancellation nor a handover that did not happen
-- (UX-EXC-007).
alter table app.loans
  drop constraint loans_end_reason_check,
  add constraint loans_end_reason_check check (
    end_reason in ('cancelled', 'not_completed', 'returned', 'unresolved', 'stopped')
  ),
  add constraint loans_stopped_by_nobody check (
    end_reason is distinct from 'stopped' or ended_by_user_id is null
  );

-- As in WP-45, and a stopped loan, like a cancelled one, ended before
-- anything was said about its handover or return.
create or replace function app.ensure_loan_consistent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed jsonb := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  loan app.loans;
  handover text;
  returned text;
begin
  select * into loan from app.loans
  where id = (changed ->> case tg_table_name when 'loans' then 'id' else 'loan_id' end)::uuid;
  handover := app.loan_handover_verdict(loan.id, coalesce(loan.ended_at, clock_timestamp()));
  returned := app.loan_return_verdict(loan.id);

  if (case
      when loan.status = 'ended' or returned in ('received', 'reopened') then
        exists (select 1 from app.loan_reservations where loan_id = loan.id)
      else not exists (
        select 1 from app.loan_reservations
        where loan_id = loan.id
          and object_id = loan.object_id
          and period = (app.current_loan_agreement(loan.id)).period
      )
    end)
    or loan.responsible_lender_id is distinct from coalesce(
      (
        select to_user_id from app.loan_lender_transfers
        where loan_id = loan.id and status = 'completed'
        order by position desc
        limit 1
      ),
      (select lender_user_id from app.loan_agreements where loan_id = loan.id and version = 1)
    )
    or exists (
      select 1 from app.loan_amendments as amendment
      where amendment.loan_id = loan.id
        and amendment.status = 'accepted'
        and not exists (
          select 1 from app.loan_agreements
          where loan_id = amendment.loan_id
            and version = amendment.base_version + 1
            and period = amendment.period
        )
    )
    or exists (
      select 1 from app.loan_return_confirmations as confirmation
      where confirmation.loan_id = loan.id
        and confirmation.status = 'applied'
        and not exists (
          select 1 from app.loan_return_reports
          where confirmation_id = confirmation.id
        )
    )
    or not coalesce(case loan.status
      when 'reserved' then handover in ('none', 'awaiting_answer', 'unanswered')
        and returned = 'none'
      when 'active' then handover = 'handed_over' and returned = 'none'
      when 'disputed' then handover = 'disputed' and returned = 'none'
      when 'awaiting_return' then handover = 'handed_over'
        and returned in ('returned', 'not_received')
      when 'late' then handover = 'handed_over' and returned = 'late'
      when 'return_disputed' then handover = 'handed_over'
        and returned in ('disputed', 'reopened')
      when 'ended' then case loan.end_reason
        when 'cancelled' then handover = 'none' and returned = 'none'
        when 'stopped' then handover = 'none' and returned = 'none'
        when 'not_completed' then handover in ('not_handed_over', 'unanswered')
          and returned = 'none'
        when 'returned' then handover = 'handed_over' and returned = 'received'
          and loan.ended_by_user_id = (
            select reported_by_user_id from app.loan_return_reports
            where loan_id = loan.id
              and agreement_version = (app.current_loan_agreement(loan.id)).version
              and outcome = 'received'
            order by position desc
            limit 1
          )
        when 'unresolved' then loan.ended_by_user_id is null and returned <> 'received'
      end
    end, false)
  then
    raise exception 'loan % does not hold what it agreed and its parties said', loan.id
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

-- PS-ADM-006: deleting an account ends its friendships and requests, and
-- its memberships, as their own reason. Ending a friendship this way is
-- recorded as done by the deleted account.
alter table app.friendships
  drop constraint friendships_end_reason_check,
  add constraint friendships_end_reason_check check (
    end_reason in ('declined', 'withdrawn', 'removed', 'blocked', 'account_deleted')
  ),
  drop constraint friendships_state_shape,
  add constraint friendships_state_shape check (
    (status = 'pending'
      and accepted_at is null
      and num_nonnulls(ended_at, ended_by_user_id, end_reason) = 0)
    or (status = 'active'
      and accepted_at is not null
      and num_nonnulls(ended_at, ended_by_user_id, end_reason) = 0)
    or (status = 'ended'
      and num_nonnulls(ended_at, ended_by_user_id, end_reason) = 3
      and ended_by_user_id in (requester_id, addressee_id)
      and (end_reason in ('blocked', 'account_deleted')
        or (end_reason in ('declined', 'withdrawn')) = (accepted_at is null)))
  );

alter table app.environment_memberships drop constraint environment_memberships_end_reason_check;
alter table app.environment_memberships add constraint environment_memberships_end_reason_check
  check (end_reason in (
    'left', 'application_withdrawn', 'application_rejected',
    'invitation_declined', 'invitation_withdrawn', 'environment_wound_down',
    'environment_type_changed', 'account_deleted'
  ));
