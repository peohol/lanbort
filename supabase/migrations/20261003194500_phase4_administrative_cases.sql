-- Phase 4 administrative cases and queue (WP-45, PS-COM-010–015), and the
-- administrative unresolved ending of a loan (PS-LOAN-018–019).
--
-- A case is a governed process with explicit access, kept apart from private
-- chat and from notifications (PS-COM-001). It belongs to a function, never
-- to the person who handles it (PS-COM-010):
-- - `environment_contact`: a member contacts the environment's
--   administrators as a function;
-- - `loan_mediation`: a party of a loan that came through an environment
--   asks its administrators to mediate a disagreement about the handover or
--   the return (vision 05, «Konflikt om tilbakelevering»);
-- - `unavailability_report`: someone reports that a user may have died or be
--   permanently unavailable. It is a confidential verification case that only
--   platform stewards handle, and it changes no account, loan or access by
--   itself (PS-COM-015).
-- Who may handle a case follows from its kind and context: the environment's
-- active administrators, or the platform stewards; never anyone involved in
-- it (PS-USR-009). One handler may take a case and is then its responsible
-- handler; when they lose the role, or can otherwise no longer handle it, the
-- case goes back to the shared queue (PS-COM-011).
--
-- What is written in a case is append-only: corrections are new entries that
-- name what they correct (PS-COM-014). A case never reaches private chat
-- (PS-COM-013): it holds only what its participants write in it.
--
-- A loan can now end as administratively unresolved (PS-LOAN-018). That ends
-- the process without saying who was right. When the object's possession is
-- still uncertain, an owner first confirms having it back before it takes new
-- loans (PS-LOAN-019). Who may end a loan this way, and after what process,
-- is not decided (OD-0017): nothing in the product does it yet.

-- The order of everything in a case: its entries and its actions share one
-- sequence, so the order is unambiguous also when timestamps are equal.
create sequence app.case_log_positions;

revoke all on sequence app.case_log_positions from public;

create table app.cases (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('environment_contact', 'loan_mediation', 'unavailability_report')),
  environment_id uuid references app.environments (id),
  loan_id uuid references app.loans (id),
  -- The user an unavailability report is about. They are never a participant.
  subject_user_id uuid references app.users (id),
  opened_by_user_id uuid not null references app.users (id),
  opened_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  -- The responsible handler, while one has taken the case.
  assignee_user_id uuid references app.users (id),
  closed_at timestamptz,
  constraint cases_context check (
    case kind
      when 'environment_contact' then
        environment_id is not null and loan_id is null and subject_user_id is null
      when 'loan_mediation' then
        environment_id is not null and loan_id is not null and subject_user_id is null
      when 'unavailability_report' then
        environment_id is null and loan_id is null and subject_user_id is not null
        and subject_user_id <> opened_by_user_id
    end
  ),
  constraint cases_closed check ((status = 'closed') = (closed_at is not null))
);

comment on table app.cases is
  'Administrative cases (PS-COM-010–015): governed processes that belong to a function, not to their handler.';

create unique index cases_one_open_contact
  on app.cases (environment_id, opened_by_user_id)
  where kind = 'environment_contact' and status = 'open';

create unique index cases_one_open_mediation
  on app.cases (loan_id)
  where kind = 'loan_mediation' and status = 'open';

create unique index cases_one_open_report
  on app.cases (opened_by_user_id, subject_user_id)
  where kind = 'unavailability_report' and status = 'open';

create index cases_environment_open on app.cases (environment_id) where status = 'open';
create index cases_report_open on app.cases (opened_at) where kind = 'unavailability_report'
  and status = 'open';
create index cases_assignee on app.cases (assignee_user_id) where assignee_user_id is not null;

-- The parties of a case: who opened it and, in a mediation, both parties of
-- the loan. `may_write` is whether they may write now: a mediation's parties
-- write one first statement each and then wait until the handler opens a new
-- round, as does the reporter of an unavailability report (PS-COM-012).
create table app.case_participants (
  case_id uuid not null references app.cases (id),
  user_id uuid not null references app.users (id),
  role text not null check (role in ('requester', 'borrower', 'lender', 'reporter')),
  may_write boolean not null,
  joined_at timestamptz not null,
  primary key (case_id, user_id)
);

comment on table app.case_participants is
  'The parties of a case and whether each may write now (PS-COM-011/012).';

create index case_participants_user on app.case_participants (user_id);

-- What a handler did in the case, in order: taking it (`assigned`, also to
-- another handler), giving it back (`released`), the case going back to the
-- queue because its handler can no longer handle it (`returned_to_queue`, by
-- the system, naming whom it left and why), opening a new writing round for
-- one party or all (`round_opened`), sharing the parties' statements with
-- each other (`statements_shared`), stepping aside as not impartial
-- (`recused`) and closing it (`closed`).
create table app.case_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references app.cases (id),
  position bigint not null unique default nextval('app.case_log_positions'),
  kind text not null check (kind in (
    'assigned', 'released', 'returned_to_queue', 'round_opened', 'statements_shared',
    'recused', 'closed'
  )),
  actor_user_id uuid references app.users (id),
  target_user_id uuid references app.users (id),
  at timestamptz not null,
  -- Why the case went back to the queue: the handler's account is no longer
  -- active, they became involved, their role ended, or their membership did.
  reason text check (reason in ('account_inactive', 'involved', 'role_ended', 'membership_ended')),
  constraint case_actions_shape check (
    (reason is not null) = (kind = 'returned_to_queue')
    and case kind
      when 'assigned' then actor_user_id is not null and target_user_id is not null
      when 'returned_to_queue' then actor_user_id is null and target_user_id is not null
      when 'round_opened' then actor_user_id is not null
      else actor_user_id is not null and target_user_id is null
    end
  )
);

comment on table app.case_actions is
  'The append-only history of what was done in a case: assignment, rounds, sharing, recusal, closing.';

create index case_actions_case on app.case_actions (case_id, position);

create trigger case_actions_immutable
  before update or delete on app.case_actions
  for each row execute function app.reject_append_only_mutation();

-- What was written in a case. A party writes to the case (`parties`); in a
-- mediation, the other party sees it only once a handler has shared the
-- statements written so far. A handler writes to all parties, to one party
-- (`party`), or to the handlers only (`handlers`, an internal note). A
-- correction is a new entry by the same author to the same audience that
-- names the entry it corrects (PS-COM-014).
create table app.case_entries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references app.cases (id),
  position bigint not null unique default nextval('app.case_log_positions'),
  author_user_id uuid not null references app.users (id),
  capacity text not null check (capacity in ('party', 'handler')),
  audience text not null check (audience in ('parties', 'party', 'handlers')),
  audience_user_id uuid references app.users (id),
  body text not null check (body = btrim(body) and char_length(body) between 1 and 4000),
  corrects_entry_id uuid references app.case_entries (id),
  created_at timestamptz not null,
  constraint case_entries_audience check (
    (audience = 'party') = (audience_user_id is not null)
    and (capacity = 'handler' or audience = 'parties')
  )
);

comment on table app.case_entries is
  'What participants and handlers wrote in a case, append-only (PS-COM-012–014).';

create index case_entries_case on app.case_entries (case_id, position);

create trigger case_entries_immutable
  before update or delete on app.case_entries
  for each row execute function app.reject_append_only_mutation();

create trigger cases_kept
  before delete on app.cases
  for each row execute function app.reject_append_only_mutation();

create trigger case_participants_kept
  before delete on app.case_participants
  for each row execute function app.reject_append_only_mutation();

-- Whether `candidate` is involved in the case, and so can never handle it
-- (PS-USR-009): who opened it, the user it is about, its parties, anyone who
-- recused themselves, and for a mediation everyone with a stake in the loan:
-- its parties, everyone who held or was offered its lender role, and the
-- object's owners then and now.
create function app.case_involved(c app.cases, candidate uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select candidate = c.opened_by_user_id
    or candidate is not distinct from c.subject_user_id
    or exists (
      select 1 from app.case_participants
      where case_id = c.id and user_id = candidate
    )
    or exists (
      select 1 from app.case_actions
      where case_id = c.id and kind = 'recused' and actor_user_id = candidate
    )
    or exists (
      select 1 from app.loans as loan
      where loan.id = c.loan_id
        and (
          candidate in (loan.borrower_user_id, loan.responsible_lender_id)
          or candidate = any(loan.owner_ids_at_approval)
          or exists (
            select 1 from app.object_owners
            where object_id = loan.object_id and user_id = candidate
          )
          or exists (
            select 1 from app.loan_lender_transfers
            where loan_id = loan.id and candidate in (from_user_id, to_user_id)
          )
        )
    );
$$;

revoke execute on function app.case_involved(app.cases, uuid) from public;

-- Whether `candidate` holds the role that handles the case as of `at`: for
-- an unavailability report a platform steward, for an environment's case one
-- of its administrators with an active membership. Holding it is not enough
-- to handle a case one is involved in (app.case_handler).
create function app.case_handler_role(c app.cases, candidate uuid, at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case c.kind
    when 'unavailability_report' then exists (
      select 1 from app.platform_role_grants
      where user_id = candidate and role = 'platform_steward' and revoked_at is null
    )
    else exists (
      select 1 from app.environment_role_grants
      where environment_id = c.environment_id
        and user_id = candidate
        and role = 'administrator'
        and revoked_at is null
    )
    and exists (
      select 1 from app.environment_memberships
      where environment_id = c.environment_id
        and user_id = candidate
        and state = 'active'
        and (transition_deadline is null or transition_deadline > at)
    )
  end;
$$;

revoke execute on function app.case_handler_role(app.cases, uuid, timestamptz) from public;

-- Whether `candidate` may handle the case as of `at`: an active account that
-- holds the role and is not involved. The stronger authentication a steward
-- also needs is the session's, which the domain checks.
create function app.case_handler(c app.cases, candidate uuid, at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from app.users where id = candidate and status = 'active')
    and not app.case_involved(c, candidate)
    and app.case_handler_role(c, candidate, at);
$$;

revoke execute on function app.case_handler(app.cases, uuid, timestamptz) from public;

-- Whether `candidate` may act as the case's handler now: they may handle it,
-- and nobody else has taken it.
create function app.case_handler_acts(c app.cases, candidate uuid, at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.case_handler(c, candidate, at)
    and (c.assignee_user_id is null or c.assignee_user_id = candidate);
$$;

revoke execute on function app.case_handler_acts(app.cases, uuid, timestamptz) from public;

-- Whether anyone may handle the case as of `at`, so its participants can be
-- told plainly when nobody can (UX-EXC-009).
create function app.case_has_handler(c app.cases, at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case c.kind
    when 'unavailability_report' then exists (
      select 1 from app.platform_role_grants
      where role = 'platform_steward'
        and revoked_at is null
        and app.case_handler(c, user_id, at)
    )
    else exists (
      select 1 from app.environment_role_grants
      where environment_id = c.environment_id
        and role = 'administrator'
        and revoked_at is null
        and app.case_handler(c, user_id, at)
    )
  end;
$$;

revoke execute on function app.case_has_handler(app.cases, timestamptz) from public;

-- The loan statuses in which its parties may ask for mediation: the parties
-- disagree about the handover or the return, or the return is unsettled.
-- How long an unsettled return must have waited first is a matter of time,
-- which the domain decides (`mediationOffered`).
create function app.loan_mediable(status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select status in ('disputed', 'return_disputed', 'awaiting_return', 'active');
$$;

revoke execute on function app.loan_mediable(text) from public;

-- A case opens as its kind allows:
-- - a contact by an active member of the environment;
-- - a mediation by a party of a loan that came through this environment,
--   while its handover or return is in question;
-- - a report by an active account about someone else, not across a block.
-- It opens unassigned.
create function app.guard_new_case()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'open'
    or new.assignee_user_id is not null
    or not exists (select 1 from app.users where id = new.opened_by_user_id and status = 'active')
    or not coalesce(case new.kind
      when 'environment_contact' then exists (
        select 1 from app.environment_memberships
        where environment_id = new.environment_id
          and user_id = new.opened_by_user_id
          and state = 'active'
          and (transition_deadline is null or transition_deadline > new.opened_at)
      )
      when 'loan_mediation' then exists (
        select 1
        from app.loans as loan
        join app.loan_requests as request on request.id = loan.request_id
        where loan.id = new.loan_id
          and request.origin = 'environment'
          and request.environment_id = new.environment_id
          and new.opened_by_user_id in (loan.borrower_user_id, loan.responsible_lender_id)
          and app.loan_mediable(loan.status)
      )
      when 'unavailability_report' then
        exists (select 1 from app.users where id = new.subject_user_id)
        and not app.users_blocked(new.opened_by_user_id, new.subject_user_id)
    end, false)
  then
    raise exception 'case cannot open like that' using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_case() from public;

create trigger cases_guard
  before insert on app.cases
  for each row execute function app.guard_new_case();

-- An open case changes only its responsible handler, and closes once. A
-- closed case never changes. Whether the change is what its actions say is
-- checked at commit (ensure_case_consistent).
create function app.guard_case_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  state text[] := array['status', 'closed_at', 'assignee_user_id'];
begin
  if old.status <> 'open'
    or (to_jsonb(old) - state) is distinct from (to_jsonb(new) - state)
    or (new.status = 'closed' and new.assignee_user_id is distinct from old.assignee_user_id)
  then
    raise exception 'case % cannot change like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_case_update() from public;

create trigger cases_update_guard
  before update on app.cases
  for each row execute function app.guard_case_update();

-- A participant is who the case's kind names: the requester or reporter who
-- opened it, or in a mediation the loan's borrower or responsible lender (a
-- new responsible lender joins an open mediation). Afterwards only whether
-- they may write changes.
create function app.guard_case_participant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
  loan app.loans;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(old) - 'may_write') is distinct from (to_jsonb(new) - 'may_write') then
      raise exception 'participant of case % cannot change like that', old.case_id
        using errcode = 'restrict_violation';
    end if;

    return new;
  end if;

  select * into c from app.cases where id = new.case_id;
  select * into loan from app.loans where id = c.loan_id;

  if c.status <> 'open'
    or not coalesce(case c.kind
      when 'environment_contact' then
        new.role = 'requester' and new.user_id = c.opened_by_user_id
      when 'unavailability_report' then
        new.role = 'reporter' and new.user_id = c.opened_by_user_id
      when 'loan_mediation' then
        (new.role = 'borrower' and new.user_id = loan.borrower_user_id)
        or (new.role = 'lender' and new.user_id = loan.responsible_lender_id)
    end, false)
  then
    raise exception 'case % cannot have this participant', new.case_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_case_participant() from public;

create trigger case_participants_guard
  before insert or update on app.case_participants
  for each row execute function app.guard_case_participant();

-- A handler's action on an open case:
-- - taking it is for a handler while nobody holds it; handing it to another
--   handler is for the one who holds it;
-- - giving it back is for the one who holds it;
-- - stepping aside is for anyone who could handle it;
-- - opening a round (for one participant or all), sharing the statements of
--   a mediation and closing it are for the acting handler.
-- Returning it to the queue is the system's, for a handler who can no longer
-- handle it.
create function app.guard_new_case_action()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
begin
  select * into c from app.cases where id = new.case_id;

  if c.status <> 'open'
    or not coalesce(case new.kind
      when 'assigned' then
        app.case_handler(c, new.target_user_id, new.at)
        and case
          when new.actor_user_id = new.target_user_id then c.assignee_user_id is null
          else c.assignee_user_id = new.actor_user_id
            and app.case_handler(c, new.actor_user_id, new.at)
        end
      when 'released' then
        c.assignee_user_id = new.actor_user_id
        and app.case_handler(c, new.actor_user_id, new.at)
      when 'returned_to_queue' then
        c.assignee_user_id = new.target_user_id
        and not app.case_handler(c, new.target_user_id, new.at)
      when 'recused' then
        app.case_handler(c, new.actor_user_id, new.at)
        and c.assignee_user_id is distinct from new.actor_user_id
      when 'round_opened' then
        app.case_handler_acts(c, new.actor_user_id, new.at)
        and c.kind <> 'environment_contact'
        and (new.target_user_id is null or exists (
          select 1 from app.case_participants
          where case_id = c.id and user_id = new.target_user_id
        ))
      when 'statements_shared' then
        app.case_handler_acts(c, new.actor_user_id, new.at)
        and c.kind = 'loan_mediation'
      when 'closed' then
        app.case_handler_acts(c, new.actor_user_id, new.at)
    end, false)
  then
    raise exception 'case % cannot get this action', new.case_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_case_action() from public;

create trigger case_actions_guard
  before insert on app.case_actions
  for each row execute function app.guard_new_case_action();

-- An entry is written:
-- - by a participant who may write now, to the case (parties), while it is
--   open;
-- - by the acting handler, to all participants, to one of them or to the
--   handlers, while it is open; a handler may still correct their own entry
--   once it is closed;
-- and a correction names an earlier entry of the same case, by the same
-- author, to the same audience.
create function app.guard_new_case_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
  corrected app.case_entries;
begin
  select * into c from app.cases where id = new.case_id;
  select * into corrected from app.case_entries where id = new.corrects_entry_id;

  if not coalesce(case new.capacity
      when 'party' then
        c.status = 'open'
        and exists (
          select 1 from app.case_participants
          where case_id = c.id and user_id = new.author_user_id and may_write
        )
      when 'handler' then
        (c.status = 'open' or new.corrects_entry_id is not null)
        and case c.status
          when 'open' then app.case_handler_acts(c, new.author_user_id, new.created_at)
          else app.case_handler(c, new.author_user_id, new.created_at)
        end
        and (new.audience_user_id is null or exists (
          select 1 from app.case_participants
          where case_id = c.id and user_id = new.audience_user_id
        ))
    end, false)
    or (new.corrects_entry_id is not null and (
      corrected.case_id is distinct from new.case_id
      or corrected.author_user_id is distinct from new.author_user_id
      or (corrected.capacity, corrected.audience, corrected.audience_user_id)
        is distinct from (new.capacity, new.audience, new.audience_user_id)
    ))
  then
    raise exception 'case % cannot get this entry', new.case_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_case_entry() from public;

create trigger case_entries_guard
  before insert on app.case_entries
  for each row execute function app.guard_new_case_entry();

-- By commit, a case is what its actions say: its responsible handler is the
-- one the latest assignment action names (none after it was given back or
-- returned to the queue), and it is closed exactly when it has a closing
-- action.
create function app.ensure_case_consistent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
begin
  select * into c from app.cases
  where id = (to_jsonb(new) ->> case tg_table_name when 'cases' then 'id' else 'case_id' end)::uuid;

  if c.assignee_user_id is distinct from (
      select case kind when 'assigned' then target_user_id end
      from app.case_actions
      where case_id = c.id and kind in ('assigned', 'released', 'returned_to_queue')
      order by position desc
      limit 1
    )
    or (c.status = 'closed') <> exists (
      select 1 from app.case_actions where case_id = c.id and kind = 'closed'
    )
  then
    raise exception 'case % is not what its actions say', c.id
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

revoke execute on function app.ensure_case_consistent() from public;

create constraint trigger cases_consistent
  after insert or update on app.cases
  deferrable initially deferred
  for each row execute function app.ensure_case_consistent();

create constraint trigger case_actions_consistent
  after insert on app.case_actions
  deferrable initially deferred
  for each row execute function app.ensure_case_consistent();

-- Why `candidate` cannot handle the case as of `at`, null if they can
-- (app.case_handler, with its conditions named in order).
create function app.case_handler_lapse(c app.cases, candidate uuid, at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when app.case_handler(c, candidate, at) then null
    when not exists (select 1 from app.users where id = candidate and status = 'active')
      then 'account_inactive'
    when app.case_involved(c, candidate) then 'involved'
    when c.kind = 'unavailability_report' or not exists (
      select 1 from app.environment_role_grants
      where environment_id = c.environment_id
        and user_id = candidate
        and role = 'administrator'
        and revoked_at is null
    ) then 'role_ended'
    -- What is left of the role is the active membership.
    else 'membership_ended'
  end;
$$;

revoke execute on function app.case_handler_lapse(app.cases, uuid, timestamptz) from public;

-- PS-COM-010/011: a case whose responsible handler can no longer handle it
-- goes back to the queue at once, in the same transaction as the cause, with
-- its history saying whom it left and why. Nobody else is assigned: another
-- handler takes it from the queue. The domain runs it too before acting on a
-- case, for what only time changes (a membership's transition deadline).
create function app.return_cases_to_queue(case_ids uuid[], at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
  lapse text;
begin
  for c in
    select * from app.cases
    where id = any(case_ids) and status = 'open' and assignee_user_id is not null
    order by id
    for update
  loop
    lapse := app.case_handler_lapse(c, c.assignee_user_id, at);

    if lapse is not null then
      insert into app.case_actions (case_id, kind, target_user_id, at, reason)
      values (c.id, 'returned_to_queue', c.assignee_user_id, at, lapse);

      update app.cases set assignee_user_id = null where id = c.id;
    end if;
  end loop;
end;
$$;

revoke execute on function app.return_cases_to_queue(uuid[], timestamptz) from public;

-- The causes: an administrator role revoked, a membership no longer active,
-- a platform role revoked, an account that is no longer active, and someone
-- who became an owner of a mediated loan's object.
create function app.return_assignee_cases()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed jsonb := to_jsonb(new);
  assignee uuid := coalesce(changed ->> 'user_id', changed ->> 'id')::uuid;
begin
  perform app.return_cases_to_queue(
    array(
      select id from app.cases
      where status = 'open'
        and assignee_user_id = assignee
        and case tg_table_name
          when 'environment_role_grants' then environment_id = (changed ->> 'environment_id')::uuid
          when 'environment_memberships' then environment_id = (changed ->> 'environment_id')::uuid
          when 'platform_role_grants' then kind = 'unavailability_report'
          when 'object_owners' then loan_id in (
            select id from app.loans where object_id = (changed ->> 'object_id')::uuid
          )
          else true
        end
    ),
    clock_timestamp()
  );

  return null;
end;
$$;

revoke execute on function app.return_assignee_cases() from public;

create trigger environment_role_grants_return_cases
  after update of revoked_at on app.environment_role_grants
  for each row
  when (old.revoked_at is null and new.revoked_at is not null)
  execute function app.return_assignee_cases();

create trigger environment_memberships_return_cases
  after update of state on app.environment_memberships
  for each row
  when (old.state = 'active' and new.state <> 'active')
  execute function app.return_assignee_cases();

create trigger platform_role_grants_return_cases
  after update of revoked_at on app.platform_role_grants
  for each row
  when (old.revoked_at is null and new.revoked_at is not null)
  execute function app.return_assignee_cases();

create trigger users_return_cases
  after update of status on app.users
  for each row
  when (old.status is distinct from new.status)
  execute function app.return_assignee_cases();

create trigger object_owners_return_cases
  after insert on app.object_owners
  for each row execute function app.return_assignee_cases();

-- A new responsible lender becomes a party of the loan's open mediation and
-- may write their own first statement. The former lender stays a party.
create function app.join_new_lender_to_mediation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into app.case_participants (case_id, user_id, role, may_write, joined_at)
  select id, new.responsible_lender_id, 'lender', true, clock_timestamp()
  from app.cases
  where loan_id = new.id and kind = 'loan_mediation' and status = 'open'
  on conflict (case_id, user_id) do nothing;

  return null;
end;
$$;

revoke execute on function app.join_new_lender_to_mediation() from public;

create trigger loans_join_new_lender_to_mediation
  after update of responsible_lender_id on app.loans
  for each row
  when (old.responsible_lender_id is distinct from new.responsible_lender_id)
  execute function app.join_new_lender_to_mediation();

-- PS-LOAN-018: a loan whose handover or return could not be clarified ends
-- as administratively unresolved, by no party. It says nothing about who was
-- right; the statements stay as they are.
alter table app.loans
  drop constraint loans_end_reason_check,
  add constraint loans_end_reason_check check (
    end_reason in ('cancelled', 'not_completed', 'returned', 'unresolved')
  ),
  add constraint loans_unresolved_by_no_party check (
    end_reason is distinct from 'unresolved' or ended_by_user_id is null
  );

-- PS-LOAN-019: an owner confirms having the object back in their control
-- after its loan ended unresolved. Until then the object takes no new loans.
create table app.loan_control_confirmations (
  loan_id uuid primary key references app.loans (id),
  confirmed_by_user_id uuid not null references app.users (id),
  confirmed_at timestamptz not null
);

comment on table app.loan_control_confirmations is
  'Owners'' confirmations that an object is back in their control after its loan ended unresolved (PS-LOAN-019).';

create trigger loan_control_confirmations_immutable
  before update or delete on app.loan_control_confirmations
  for each row execute function app.reject_append_only_mutation();

-- Only a current owner of the object, never its borrower, and only for a
-- loan that ended unresolved.
create function app.guard_new_control_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.loans as loan
    where loan.id = new.loan_id
      and loan.status = 'ended'
      and loan.end_reason = 'unresolved'
      and loan.borrower_user_id <> new.confirmed_by_user_id
      and exists (
        select 1 from app.object_owners
        where object_id = loan.object_id and user_id = new.confirmed_by_user_id
      )
  ) then
    raise exception 'loan % cannot get this confirmation', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_control_confirmation() from public;

create trigger loan_control_confirmations_guard
  before insert on app.loan_control_confirmations
  for each row execute function app.guard_new_control_confirmation();

-- As in WP-35, and a loan whose handover or return is not settled (reserved,
-- disputed, in its return phase short of a confirmed receipt) may end as
-- unresolved.
create or replace function app.guard_loan_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ending text[] := array[
    'status', 'status_changed_at', 'end_reason', 'ended_at', 'ended_by_user_id'
  ];
begin
  if not (
    ((to_jsonb(old) - ending) = (to_jsonb(new) - ending) and (
      (old.status = 'reserved' and new.status in ('active', 'disputed', 'ended'))
      or (old.status = 'active' and new.status = 'disputed')
      or (old.status = 'disputed' and new.status = 'active')
      or (old.status = 'disputed' and new.status = 'ended'
        and new.end_reason in ('not_completed', 'unresolved'))
      or (app.loan_return_phase(old.status) and app.loan_return_phase(new.status)
        and old.status <> new.status)
      or (app.loan_return_phase(old.status) and new.status = 'ended'
        and new.end_reason in ('returned', 'unresolved'))
      or (old.status = 'ended' and old.end_reason = 'returned'
        and new.status = 'return_disputed')
    ))
    or (old.status = 'ended' and old.object_id is not null and new.object_id is null
      and (to_jsonb(old) - 'object_id') = (to_jsonb(new) - 'object_id'))
    or (old.status <> 'ended'
      and (to_jsonb(old) - 'responsible_lender_id') = (to_jsonb(new) - 'responsible_lender_id')
      and exists (
        select 1 from app.loan_lender_transfers
        where loan_id = old.id
          and status = 'completed'
          and from_user_id = old.responsible_lender_id
          and to_user_id = new.responsible_lender_id
          and position = (
            select max(position) from app.loan_lender_transfers
            where loan_id = old.id and status = 'completed'
          )
      ))
  ) then
    raise exception 'loan % cannot change like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- As in WP-35, and a loan that ended unresolved was ended by no party,
-- whatever its statements say.
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

-- As in WP-34, and a loan that ended unresolved keeps the object blocked in
-- the same way until an owner confirms having it back (PS-LOAN-019). Loans
-- that were already approved stay as they are.
create or replace function app.possession_uncertain(
  object uuid,
  period datemultirange,
  except_loan uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from app.loans as loan
    where loan.object_id = object
      and (
        loan.status in ('disputed', 'awaiting_return', 'late', 'return_disputed')
        or (loan.status = 'ended' and loan.end_reason = 'unresolved'
          and not exists (
            select 1 from app.loan_control_confirmations where loan_id = loan.id
          ))
      )
      and loan.id <> except_loan
      and datemultirange(
        daterange(lower((app.current_loan_agreement(loan.id)).period), null)
      ) && period
  );
$$;
