-- Phase 3 cancellation and agreement changes (WP-32, PS-LOAN-010–011).
--
-- Before the object is handed over, either party of a reserved loan can end
-- it on their own: the loan is `ended` as `cancelled`, by them, and its
-- reservation is released in the same transaction. Its agreement versions,
-- its request and its events stay as they were.
--
-- A change to the agreement is a proposal by one party that only the other
-- party can accept. Until then nothing changes. Accepting it adds the next
-- agreement version, never rewriting an earlier one, and moves the
-- reservation to the new period in the same transaction. The exclusion
-- constraint on reservations still decides whether the new period is free,
-- so a change can never push aside another approved loan (scenario 26).
--
-- WP-31 made loans, agreements and reservations immutable; this replaces
-- those triggers with guards that allow exactly these changes, and a
-- deferred check that the reservation is always the one the current
-- agreement says, or none once the loan has ended.

-- How a loan ended. Only the parties' cancellation exists so far; not
-- handed over, completed and administrative endings (PS-LOAN-011–018) join
-- this check with their work packages.
alter table app.loans
  drop constraint loans_status_check,
  add constraint loans_status_check check (status in ('reserved', 'ended')),
  add column end_reason text check (end_reason in ('cancelled')),
  add column ended_at timestamptz,
  add column ended_by_user_id uuid references app.users (id),
  add constraint loans_end_shape check (
    (status = 'ended') = (ended_at is not null)
    and (ended_at is null) = (end_reason is null)
  ),
  -- PS-LOAN-011: a cancellation is always one of the two parties'.
  add constraint loans_cancelled_by_party check (
    end_reason is distinct from 'cancelled'
    or (ended_by_user_id is not null
      and ended_by_user_id in (borrower_user_id, responsible_lender_id))
  ),
  -- An ended loan outlives its object as the parties' history, like its
  -- request (release_loan_requests below).
  alter column object_id drop not null,
  add constraint loans_object_kept check (object_id is not null or status = 'ended');

-- A proposed change to a reserved loan's agreement (PS-LOAN-010): the period
-- it would agree, proposed by one party on top of the agreement version
-- they saw. Only the other party accepts or declines it; the proposer may
-- withdraw it. It lapses when the loan ends. Only the period can change so
-- far: it holds both the agreed handover (its first day) and the return
-- date (its last day).
create table app.loan_amendments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references app.loans (id),
  base_version integer not null check (base_version > 0),
  proposed_by_user_id uuid not null references app.users (id),
  -- Which side proposed. Who answers follows from it, also if the
  -- responsible lender changes in between (WP-35).
  proposer_role text not null check (proposer_role in ('borrower', 'lender')),
  -- Calendar dates, [first day, last day + 1), like the agreement's.
  period daterange not null check (
    not isempty(period) and not lower_inf(period) and not upper_inf(period)
  ),
  status text not null default 'proposed' check (status in (
    'proposed', 'accepted', 'declined', 'withdrawn', 'lapsed'
  )),
  proposed_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  -- Who answered; null when it lapsed with the loan.
  resolved_by_user_id uuid references app.users (id),
  constraint loan_amendments_resolution_shape check (
    (status = 'proposed') = (resolved_at is null)
    and (status = 'lapsed' or status = 'proposed') = (resolved_by_user_id is null)
  )
);

comment on table app.loan_amendments is
  'Proposed changes to loan agreements; only the other party makes them agreed (PS-LOAN-010).';

-- One open proposal per loan at a time, so two changes can never be agreed
-- on top of the same version, and one agreed change per version.
create unique index loan_amendments_open_key
  on app.loan_amendments (loan_id)
  where status = 'proposed';

create unique index loan_amendments_accepted_key
  on app.loan_amendments (loan_id, base_version)
  where status = 'accepted';

create trigger loan_amendments_kept
  before delete on app.loan_amendments
  for each row execute function app.reject_append_only_mutation();

-- The loan's party on one side.
create function app.loan_party(loan app.loans, role text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case role
    when 'borrower' then loan.borrower_user_id
    when 'lender' then loan.responsible_lender_id
  end;
$$;

revoke execute on function app.loan_party(app.loans, text) from public;

-- The loan's current agreement: its latest version.
create function app.current_loan_agreement(loan uuid)
returns app.loan_agreements
language sql
stable
set search_path = ''
as $$
  select * from app.loan_agreements
  where loan_id = loan
  order by version desc
  limit 1;
$$;

revoke execute on function app.current_loan_agreement(uuid) from public;

-- A proposal is made by the party of its side, on a reserved loan, on top of
-- the current agreement, and changes something.
create function app.guard_new_loan_amendment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
  agreement app.loan_agreements;
begin
  select * into loan from app.loans where id = new.loan_id;
  agreement := app.current_loan_agreement(new.loan_id);

  if new.status <> 'proposed'
    or loan.status is distinct from 'reserved'
    or new.base_version is distinct from agreement.version
    or new.period = agreement.period
    or new.proposed_by_user_id is distinct from app.loan_party(loan, new.proposer_role)
  then
    raise exception 'loan % cannot get this proposal', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_loan_amendment() from public;

create trigger loan_amendments_guard
  before insert on app.loan_amendments
  for each row execute function app.guard_new_loan_amendment();

-- An open proposal is answered once, and only its answer changes:
-- - accepted or declined by the other side's party; accepted only on a
--   reserved loan whose agreement is still the one it was made on (the
--   domain then adds the agreed version, see guard_new_loan_agreement);
-- - withdrawn by its own side's party;
-- - lapsed, by nobody, when the loan has ended or its agreement moved on.
create function app.guard_loan_amendment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  answer text[] := array['status', 'resolved_at', 'resolved_by_user_id'];
  loan app.loans;
  current_version integer;
  other_role text := case old.proposer_role when 'borrower' then 'lender' else 'borrower' end;
begin
  select * into loan from app.loans where id = old.loan_id;
  current_version := (app.current_loan_agreement(old.loan_id)).version;

  if old.status <> 'proposed'
    or (to_jsonb(old) - answer) is distinct from (to_jsonb(new) - answer)
    or not coalesce(case new.status
      when 'accepted' then
        new.resolved_by_user_id = app.loan_party(loan, other_role)
        and loan.status = 'reserved'
        and old.base_version = current_version
      when 'declined' then
        new.resolved_by_user_id = app.loan_party(loan, other_role)
      when 'withdrawn' then
        new.resolved_by_user_id = app.loan_party(loan, old.proposer_role)
      when 'lapsed' then
        loan.status <> 'reserved' or old.base_version <> current_version
      else false
    end, false)
  then
    raise exception 'proposal % cannot be answered like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_loan_amendment_update() from public;

create trigger loan_amendments_answer
  before update on app.loan_amendments
  for each row execute function app.guard_loan_amendment_update();

-- Version 1 is the approval (WP-31, unchanged). Every later version is an
-- accepted proposal: the next version of a reserved loan, with the agreed
-- period and everything else exactly as before (PS-LOAN-010). The object's
-- content and terms never come back in through a change.
create or replace function app.guard_new_loan_agreement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
  request app.loan_requests;
  previous app.loan_agreements;
begin
  select * into loan from app.loans where id = new.loan_id;

  if new.version = 1 then
    select * into request from app.loan_requests where id = loan.request_id;

    if new.lender_user_id is distinct from loan.responsible_lender_id
      or new.terms_version is distinct from request.terms_version
      or app.loan_terms_differ(loan.object_id, new.terms_version, new.object_version)
      or (request.origin = 'direct') <> (new.responsibility_declaration_version is not null)
      or (request.origin = 'direct' and (
        select count(distinct user_id)
        from app.loan_request_responsibility_acceptances
        where request_id = request.id
          and declaration_version = new.responsibility_declaration_version
          and user_id in (request.borrower_user_id, loan.responsible_lender_id)
      ) <> 2)
    then
      raise exception 'agreement for loan % is not what was confirmed', new.loan_id
        using errcode = 'restrict_violation';
    end if;

    return new;
  end if;

  previous := app.current_loan_agreement(new.loan_id);

  if previous.version is distinct from new.version - 1
    or loan.status is distinct from 'reserved'
    or new.lender_user_id is distinct from loan.responsible_lender_id
    or (new.object_version, new.terms_version, new.title, new.category_id,
      new.description, new.loan_terms, new.responsibility_declaration_version)
      is distinct from (previous.object_version, previous.terms_version, previous.title,
      previous.category_id, previous.description, previous.loan_terms,
      previous.responsibility_declaration_version)
    or not exists (
      select 1 from app.loan_amendments
      where loan_id = new.loan_id
        and status = 'accepted'
        and base_version = previous.version
        and period = new.period
    )
  then
    raise exception 'agreement % of loan % was not agreed', new.version, new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- A loan changes in two ways only (WP-35 adds the transfer of the
-- responsible lender):
-- - a reserved loan ends, recording how, when and by whom;
-- - an ended loan lets go of its deleted object.
-- It is never deleted.
create function app.guard_loan_update()
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
    (old.status = 'reserved' and new.status = 'ended'
      and (to_jsonb(old) - ending) = (to_jsonb(new) - ending))
    or (old.status = 'ended' and old.object_id is not null and new.object_id is null
      and (to_jsonb(old) - 'object_id') = (to_jsonb(new) - 'object_id'))
  ) then
    raise exception 'loan % cannot change like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_loan_update() from public;

drop trigger loans_immutable on app.loans;

create trigger loans_history
  before update on app.loans
  for each row execute function app.guard_loan_update();

create trigger loans_kept
  before delete on app.loans
  for each row execute function app.reject_append_only_mutation();

-- An open proposal cannot outlive the loan: it lapses when the loan ends,
-- whichever way it ends.
create function app.lapse_loan_amendments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update app.loan_amendments
  set status = 'lapsed', resolved_at = new.ended_at
  where loan_id = new.id and status = 'proposed';

  return null;
end;
$$;

revoke execute on function app.lapse_loan_amendments() from public;

create trigger loans_lapse_amendments
  after update of status on app.loans
  for each row
  when (old.status = 'reserved' and new.status <> 'reserved')
  execute function app.lapse_loan_amendments();

-- A reservation follows its loan:
-- - its period moves only to an agreed one (checked at commit), and the days
--   it adds must lie within the object's general availability, outside every
--   co-owner restriction and freeze, like a new reservation; overlap with
--   other loans is the exclusion constraint's;
-- - it is released (deleted) only once the loan has ended.
create function app.guard_loan_reservation_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  added datemultirange;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from app.loans where id = old.loan_id and status = 'reserved') then
      raise exception 'loan % still holds its reservation', old.loan_id
        using errcode = 'restrict_violation';
    end if;

    return old;
  end if;

  added := datemultirange(new.period) - datemultirange(old.period);

  if new.loan_id <> old.loan_id
    or new.object_id <> old.object_id
    or not exists (select 1 from app.loans where id = new.loan_id and status = 'reserved')
    or (not isempty(added) and (
      not exists (select 1 from app.objects where id = new.object_id and status = 'active')
      or not added <@ coalesce(
        (
          select range_agg(period) from app.object_availability_intervals
          where object_id = new.object_id
        ),
        '{}'::datemultirange
      )
      or exists (
        select 1 from app.object_restrictions
        where object_id = new.object_id
          and lifted_at is null
          and (period is null or datemultirange(period) && added)
      )
      or exists (
        select 1 from app.object_freezes
        where object_id = new.object_id and ended_at is null
      )
    ))
  then
    raise exception 'loan % cannot reserve that period', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_loan_reservation_change() from public;

drop trigger loan_reservations_immutable on app.loan_reservations;

create trigger loan_reservations_follow_loan
  before update or delete on app.loan_reservations
  for each row execute function app.guard_loan_reservation_change();

-- PS-LOAN-006/010/011: the reservation and the agreement never disagree. By
-- commit, a reserved loan holds exactly the period of its current agreement,
-- an ended loan holds none, and every accepted proposal is its agreement's
-- next version with the proposed period.
create function app.ensure_loan_consistent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed jsonb := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  loan app.loans;
begin
  select * into loan from app.loans
  where id = (changed ->> case tg_table_name when 'loans' then 'id' else 'loan_id' end)::uuid;

  if (case loan.status
      when 'reserved' then not exists (
        select 1 from app.loan_reservations
        where loan_id = loan.id
          and object_id = loan.object_id
          and period = (app.current_loan_agreement(loan.id)).period
      )
      else exists (select 1 from app.loan_reservations where loan_id = loan.id)
    end)
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
  then
    raise exception 'loan % does not hold the period it agreed', loan.id
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

revoke execute on function app.ensure_loan_consistent() from public;

create constraint trigger loans_consistent
  after update on app.loans
  deferrable initially deferred
  for each row execute function app.ensure_loan_consistent();

create constraint trigger loan_agreements_consistent
  after insert on app.loan_agreements
  deferrable initially deferred
  for each row execute function app.ensure_loan_consistent();

create constraint trigger loan_reservations_consistent
  after update or delete on app.loan_reservations
  deferrable initially deferred
  for each row execute function app.ensure_loan_consistent();

create constraint trigger loan_amendments_consistent
  after update on app.loan_amendments
  deferrable initially deferred
  for each row execute function app.ensure_loan_consistent();

-- An approved request lets go of its deleted object like an ended one, once
-- its loan has ended (otherwise the object cannot be deleted at all).
alter table app.loan_requests
  drop constraint loan_requests_object_shape,
  add constraint loan_requests_object_shape check (
    (object_id is null) = (terms_version is null)
    and (object_id is null) = (former_owner_ids is not null)
    and (object_id is not null or status in ('ended', 'approved'))
  );

create or replace function app.guard_loan_request_update()
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
    if (old.ended_at is null and not (
        old.status = 'approved'
        and exists (select 1 from app.loans where request_id = old.id and status = 'ended')
      ))
      or (to_jsonb(old) - detached) is distinct from (to_jsonb(new) - detached)
    then
      raise exception 'only a finished loan request (%) lets go of its object', old.id
        using errcode = 'restrict_violation';
    end if;
  elsif old.ended_at is not null
    or old.status = 'approved'
    or (to_jsonb(old) - mutable) is distinct from (to_jsonb(new) - mutable)
  then
    raise exception 'only % may change on an open loan request', array_to_string(mutable, ', ')
      using errcode = 'restrict_violation';
  elsif new.status = 'approved' and (
    old.status <> 'requested'
    or new.terms_version is distinct from old.terms_version
    or not exists (select 1 from app.loans where request_id = new.id)
  ) then
    raise exception 'loan request % is approved only from requested, with its loan', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- The object is deleted (PS-OBJ-011), which its commitments allow only once
-- every loan of it has ended: its open requests end neutrally, and its
-- requests and ended loans let go of the object's rows before they are
-- deleted. Agreements are snapshots and never pointed at the object.
create or replace function app.release_loan_requests(object uuid, at timestamptz)
returns void
language sql
set search_path = ''
as $$
  select app.end_loan_requests(
    array(select id from app.loan_requests where object_id = object),
    'object_unavailable',
    at
  );

  update app.loans set object_id = null where object_id = object;

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
