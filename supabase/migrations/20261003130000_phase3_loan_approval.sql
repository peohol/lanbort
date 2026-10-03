-- Phase 3 approval and reservation (WP-31, PS-LOAN-006–008, PS-NFR-004).
--
-- Approving a request makes it a loan in one transaction: the loan with its
-- responsible lender, the immutable agreement snapshot of what was approved,
-- and the reservation of its period for the object, globally. The request is
-- then `approved` and never changes again; colliding open requests end
-- neutrally (`period_unavailable`).
--
-- The domain decides and locks the object first, so concurrent approvals of
-- one object run one after another. The database still refuses anything that
-- would leave two truths: overlapping reservations of one object (an
-- exclusion constraint), a loan without the access, terms or declaration it
-- needs, and a loan without its agreement and reservation.

alter table app.loan_requests
  drop constraint loan_requests_status_check,
  add constraint loan_requests_status_check check (status in (
    'requested', 'awaiting_terms_confirmation', 'approved', 'ended'
  )),
  drop constraint loan_requests_end_reason_check,
  -- period_unavailable: another request was approved for a colliding period
  -- (PS-LOAN-007). Neutral like the others: it never says whose.
  add constraint loan_requests_end_reason_check check (end_reason in (
    'withdrawn', 'declined', 'access_lost', 'publication_ended',
    'object_unavailable', 'period_unavailable'
  ));

-- PS-LOAN-002: whether the access a request builds on still holds, as the
-- database can see it. The backstop for making a request and for approving
-- it; the domain's assessOrigin decides first and answers neutrally.
create function app.loan_request_access_holds(
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

revoke execute on function app.loan_request_access_holds(uuid, uuid, text, uuid, uuid)
  from public;

create or replace function app.guard_new_loan_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'requested' or not app.loan_request_access_holds(
    new.object_id, new.borrower_user_id, new.origin, new.environment_id,
    new.publication_id
  ) then
    raise exception 'loan request for object % has no access behind it', new.object_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- PS-LOAN-006: the loan an approval creates, one per request. The borrower
-- and object are the request's. The responsible lender is the co-owner who
-- approved (PS-LOAN-008); transfers (WP-35) change it explicitly.
create table app.loans (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references app.loan_requests (id),
  object_id uuid not null references app.objects (id),
  borrower_user_id uuid not null references app.users (id),
  responsible_lender_id uuid not null references app.users (id),
  -- reserved: approved, not yet handed over. Later work packages add the
  -- rest of the loan's course (PS-LOAN-010–021).
  status text not null default 'reserved' check (status in ('reserved')),
  approved_at timestamptz not null default clock_timestamp(),
  status_changed_at timestamptz not null default clock_timestamp(),
  constraint loans_parties_differ check (responsible_lender_id <> borrower_user_id)
);

comment on table app.loans is
  'Approved loans (PS-LOAN-006–008), one per approved request.';

create index loans_object_idx on app.loans (object_id);
create index loans_borrower_idx on app.loans (borrower_user_id);
create index loans_responsible_lender_idx on app.loans (responsible_lender_id);

-- What was agreed, copied when it was agreed: the object's content and terms
-- at approval, the period and the parties' declaration. Later edits to the
-- object, and its deletion, never change it (Port B). Version 1 is the
-- approval; agreed changes (WP-32) add versions, never rewrite one.
create table app.loan_agreements (
  loan_id uuid not null references app.loans (id),
  version integer not null check (version > 0),
  -- The object version approved, and the one whose terms the borrower
  -- confirmed (PS-LOAN-005); their terms are the same.
  object_version integer not null check (object_version > 0),
  terms_version integer not null check (terms_version > 0),
  title text not null,
  category_id text not null references app.object_categories (id),
  description text not null,
  loan_terms text,
  -- Calendar dates, [first day, last day + 1).
  period daterange not null check (
    not isempty(period) and not lower_inf(period) and not upper_inf(period)
  ),
  -- The lender who agreed: the responsible lender at approval.
  lender_user_id uuid not null references app.users (id),
  -- PS-LOAN-003: the declaration both parties accepted, direct loans only.
  responsibility_declaration_version integer
    check (responsibility_declaration_version > 0),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (loan_id, version)
);

comment on table app.loan_agreements is
  'Immutable agreement snapshots of loans (PS-LOAN-006, PS-DOM-004).';

create trigger loan_agreements_immutable
  before update or delete on app.loan_agreements
  for each row execute function app.reject_append_only_mutation();

-- The period a loan holds on its object. Reservations of one object never
-- overlap, whoever approved them and wherever the object is published
-- (PS-NFR-004): this constraint is what makes two concurrent approvals
-- unable to double-book, also if the domain's lock were bypassed. Actual
-- availability subtracts them (availabilityBlockSources).
create table app.loan_reservations (
  loan_id uuid primary key references app.loans (id),
  object_id uuid not null references app.objects (id),
  period daterange not null check (
    not isempty(period) and not lower_inf(period) and not upper_inf(period)
  ),
  constraint loan_reservations_no_overlap
    exclude using gist (object_id with =, period with &&)
);

comment on table app.loan_reservations is
  'Periods reserved by approved loans; never overlapping per object (PS-NFR-004).';

-- Nothing changes or releases a loan before cancellation, handover and
-- return arrive (WP-32–WP-34); those relax this explicitly.
create trigger loans_immutable
  before update or delete on app.loans
  for each row execute function app.reject_append_only_mutation();

create trigger loan_reservations_immutable
  before update or delete on app.loan_reservations
  for each row execute function app.reject_append_only_mutation();

-- A loan is only made from a request that can be approved now (PS-LOAN-002,
-- PS-LOAN-005, PS-LOAN-008): still `requested` (not waiting for the borrower
-- to confirm new terms), with its access behind it, approved by an owner who
-- has the borrower's relation to the origin. The domain checks this first;
-- this is the backstop.
create function app.guard_new_loan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  request app.loan_requests;
begin
  select * into request from app.loan_requests where id = new.request_id;

  if request.status is distinct from 'requested'
    or request.object_id is distinct from new.object_id
    or request.borrower_user_id is distinct from new.borrower_user_id
    or new.status <> 'reserved'
    or not exists (
      select 1 from app.object_owners
      where object_id = new.object_id and user_id = new.responsible_lender_id
    )
    or not app.loan_request_access_holds(
      request.object_id, request.borrower_user_id, request.origin,
      request.environment_id, request.publication_id
    )
    or (request.origin = 'direct'
      and not app.users_are_friends(new.responsible_lender_id, request.borrower_user_id))
    or (request.origin = 'environment' and not exists (
      select 1 from app.environment_memberships
      where environment_id = request.environment_id
        and user_id = new.responsible_lender_id
        and state = 'active'
    ))
  then
    raise exception 'loan request % cannot be approved by %',
      new.request_id, new.responsible_lender_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_loan() from public;

create trigger loans_guard
  before insert on app.loans
  for each row execute function app.guard_new_loan();

-- The agreement is what the borrower confirmed (PS-LOAN-005) and, for a
-- direct loan, what both parties accepted the declaration for (PS-LOAN-003).
create function app.guard_new_loan_agreement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
  request app.loan_requests;
begin
  select * into loan from app.loans where id = new.loan_id;
  select * into request from app.loan_requests where id = loan.request_id;

  if new.version <> 1
    or new.lender_user_id is distinct from loan.responsible_lender_id
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
end;
$$;

revoke execute on function app.guard_new_loan_agreement() from public;

create trigger loan_agreements_guard
  before insert on app.loan_agreements
  for each row execute function app.guard_new_loan_agreement();

-- A reservation lies within the object's general availability and outside
-- every co-owner restriction (PS-OBJ-003, PS-OBJ-008). Overlap with other
-- reservations is the exclusion constraint's.
create function app.guard_new_loan_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
      select 1 from app.loans
      where id = new.loan_id and object_id = new.object_id and status = 'reserved'
    )
    or not exists (
      select 1 from app.object_availability_intervals
      where object_id = new.object_id and period @> new.period
    )
    or exists (
      select 1 from app.object_restrictions
      where object_id = new.object_id
        and lifted_at is null
        and (period is null or period && new.period)
    )
  then
    raise exception 'loan % cannot reserve that period', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_loan_reservation() from public;

create trigger loan_reservations_guard
  before insert on app.loan_reservations
  for each row execute function app.guard_new_loan_reservation();

-- PS-LOAN-006: one consistent whole. By commit, a new loan has its approved
-- request, its agreement and the reservation of the agreed period.
create function app.ensure_loan_complete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
      select 1 from app.loan_requests
      where id = new.request_id and status = 'approved'
    )
    or not exists (
      select 1 from app.loan_agreements as agreement
      join app.loan_reservations as reservation using (loan_id)
      where agreement.loan_id = new.id
        and agreement.version = 1
        and reservation.object_id = new.object_id
        and reservation.period = agreement.period
    )
  then
    raise exception 'loan % lacks its approval, agreement or reservation', new.id
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

revoke execute on function app.ensure_loan_complete() from public;

create constraint trigger loans_complete
  after insert on app.loans
  deferrable initially deferred
  for each row execute function app.ensure_loan_complete();

-- An ended or approved request is history and never changes again. An open
-- request becomes `approved` only from `requested`, and only with its loan.
-- When its object is deleted, an ended request lets go of the object's rows
-- and keeps the owners of that time instead (WP-30).
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
    if old.ended_at is null
      or (to_jsonb(old) - detached) is distinct from (to_jsonb(new) - detached)
    then
      raise exception 'only an ended loan request (%) lets go of its object', old.id
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
