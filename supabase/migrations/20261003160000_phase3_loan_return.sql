-- Phase 3 return and early return (WP-34, PS-LOAN-014–017, PS-LOAN-020).
--
-- Once the object is handed over, the parties say what happened at the
-- return, like at the handover (WP-33): the borrower that it was returned or
-- that they still have it, the responsible lender that it was received or
-- not. Their statements are append-only rows on the agreement version they
-- were given for; the loan's status follows from them:
-- - nobody has said anything: `active` (shown as awaiting return
--   clarification once the return day is over, never as late);
-- - the borrower says returned, or the lender says not received: still
--   unsettled, `awaiting_return`;
-- - the borrower says they still have it: `late`, whatever the lender says
--   short of having received it;
-- - the borrower says returned and the lender not received: `return_disputed`;
-- - the lender says received: `ended` as `returned`, at once, also before the
--   agreed return day (early return). The reservation is released, so the
--   rest of the period is free unless something else blocks it.
-- A receipt that a party later contradicts (lender: not received after all;
-- borrower: still has it) reopens the loan as `return_disputed` until the
-- lender confirms a receipt again. The receipt stays as history, and loans
-- approved in between stay as they are.
--
-- A return confirmation (returned, received) waits 30 seconds before it is
-- made, unless its party asks for it at once (PS-LOAN-016). Until then it is
-- only a pending row its party can withdraw, as if never sent; it becomes a
-- statement when it is made.
--
-- While the return is unsettled, nobody knows for sure who has the object, so
-- it is blocked for new colliding loans, as for a disputed handover. An
-- agreed new return date (WP-32's amendment, now also for an active or late
-- loan) is a new agreement version, so the return statements on the old one
-- stop counting. The handover statements keep counting until the handover
-- day itself changes.

alter table app.loans
  drop constraint loans_status_check,
  add constraint loans_status_check check (
    status in (
      'reserved', 'active', 'disputed', 'awaiting_return', 'late',
      'return_disputed', 'ended'
    )
  ),
  drop constraint loans_end_reason_check,
  add constraint loans_end_reason_check check (
    end_reason in ('cancelled', 'not_completed', 'returned')
  ),
  -- PS-LOAN-015: the responsible lender's receipt ends a normal return.
  add constraint loans_returned_by_lender check (
    end_reason is distinct from 'returned'
    or ended_by_user_id is not distinct from responsible_lender_id
  );

-- The statuses of a loan that was handed over and has not ended.
create function app.loan_return_phase(status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select status in ('active', 'awaiting_return', 'late', 'return_disputed');
$$;

revoke execute on function app.loan_return_phase(text) from public;

-- The agreement version from which the current handover day holds: the
-- latest that changed the handover day (the period's first day). Handover
-- statements on it and later versions count; an agreed new return date
-- during the loan keeps them.
create function app.loan_handover_version(loan uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(max(agreement.version), 1)
  from app.loan_agreements as agreement
  join app.loan_agreements as previous
    on previous.loan_id = agreement.loan_id
    and previous.version = agreement.version - 1
  where agreement.loan_id = loan
    and lower(agreement.period) <> lower(previous.period);
$$;

revoke execute on function app.loan_handover_version(uuid) from public;

create or replace function app.current_handover_reports(loan uuid)
returns table (reporter_role text, outcome text, answer_due_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select distinct on (report.reporter_role)
    report.reporter_role, report.outcome, report.answer_due_at
  from app.loan_handover_reports as report
  where report.loan_id = loan
    and report.agreement_version >= app.loan_handover_version(loan)
  order by report.reporter_role, report.position desc;
$$;

-- A return confirmation in its undo buffer (PS-LOAN-016): what its party
-- confirmed and when it takes effect. Only its party sees it. It ends
-- `withdrawn` (before `effective_at`, as if never sent), `applied` (it became
-- a statement, early when its party asked for it at once) or `lapsed` (the
-- loan or its agreement moved on first).
create table app.loan_return_confirmations (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references app.loans (id),
  agreement_version integer not null check (agreement_version > 0),
  requested_by_user_id uuid not null references app.users (id),
  reporter_role text not null,
  outcome text not null,
  requested_at timestamptz not null,
  effective_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'withdrawn', 'applied', 'lapsed')),
  resolved_at timestamptz,
  constraint loan_return_confirmations_kind check (
    (reporter_role, outcome) in (('borrower', 'returned'), ('lender', 'received'))
  ),
  constraint loan_return_confirmations_shape check (
    effective_at > requested_at
    and (status = 'pending') = (resolved_at is null)
    and (status <> 'withdrawn' or resolved_at < effective_at)
  )
);

comment on table app.loan_return_confirmations is
  'Return confirmations in their undo buffer (PS-LOAN-016), seen only by their party.';

create unique index loan_return_confirmations_one_pending
  on app.loan_return_confirmations (loan_id, reporter_role)
  where status = 'pending';

create index loan_return_confirmations_due
  on app.loan_return_confirmations (effective_at)
  where status = 'pending';

create trigger loan_return_confirmations_kept
  before delete on app.loan_return_confirmations
  for each row execute function app.reject_append_only_mutation();

-- A party's statement about the return, on the agreement version they saw.
-- `position` orders statements, also when they share a timestamp. A
-- statement made from a confirmation names it.
create table app.loan_return_reports (
  id uuid primary key default gen_random_uuid(),
  position bigint generated always as identity unique,
  loan_id uuid not null references app.loans (id),
  agreement_version integer not null check (agreement_version > 0),
  reported_by_user_id uuid not null references app.users (id),
  reporter_role text not null,
  outcome text not null,
  reported_at timestamptz not null default clock_timestamp(),
  confirmation_id uuid unique references app.loan_return_confirmations (id),
  constraint loan_return_reports_kind check (
    (reporter_role, outcome) in (
      ('borrower', 'returned'), ('borrower', 'still_has'),
      ('lender', 'received'), ('lender', 'not_received')
    )
  ),
  constraint loan_return_reports_confirmed check (
    confirmation_id is null or outcome in ('returned', 'received')
  )
);

comment on table app.loan_return_reports is
  'The parties'' append-only statements on whether a loan''s object was returned (PS-LOAN-014–017).';

create index loan_return_reports_loan
  on app.loan_return_reports (loan_id, agreement_version, position);

create trigger loan_return_reports_immutable
  before update or delete on app.loan_return_reports
  for each row execute function app.reject_append_only_mutation();

-- What the return statements on the loan's current agreement say (the
-- domain's returnVerdict):
-- - 'received': the lender's latest receipt, and nobody contradicted it since;
-- - 'reopened': a receipt that the lender (not received) or the borrower
--   (still has it) contradicted afterwards;
-- otherwise, by the latest statement of each side:
-- - 'disputed': returned, and not received;
-- - 'late': the borrower still has it;
-- - 'returned' or 'not_received': one side's word, not settled;
-- - 'none': nobody has said anything.
create function app.loan_return_verdict(loan uuid)
returns text
language sql
stable
set search_path = ''
as $$
  with report as (
    select reporter_role, outcome, position
    from app.loan_return_reports
    where loan_id = loan
      and agreement_version = (app.current_loan_agreement(loan)).version
  ),
  receipt as (
    select max(position) as position from report where outcome = 'received'
  ),
  latest as (
    select
      (select outcome from report where reporter_role = 'borrower'
        order by position desc limit 1) as borrower,
      (select outcome from report where reporter_role = 'lender'
        order by position desc limit 1) as lender
  )
  select case
    when receipt.position is not null then
      case when exists (
        select 1 from report
        where report.position > receipt.position
          and report.outcome in ('still_has', 'not_received')
      ) then 'reopened' else 'received' end
    when latest.borrower = 'returned' and latest.lender = 'not_received' then 'disputed'
    when latest.borrower = 'still_has' then 'late'
    when latest.borrower = 'returned' then 'returned'
    when latest.lender = 'not_received' then 'not_received'
    else 'none'
  end
  from receipt, latest;
$$;

revoke execute on function app.loan_return_verdict(uuid) from public;

-- A confirmation is made by the party of its side, on the current agreement
-- of a loan in its return phase, and waits.
create function app.guard_new_return_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
begin
  select * into loan from app.loans where id = new.loan_id;

  if new.status <> 'pending'
    or new.requested_by_user_id is distinct from app.loan_party(loan, new.reporter_role)
    or new.agreement_version is distinct from (app.current_loan_agreement(new.loan_id)).version
    or not coalesce(app.loan_return_phase(loan.status), false)
  then
    raise exception 'loan % cannot get this return confirmation', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_return_confirmation() from public;

create trigger loan_return_confirmations_guard
  before insert on app.loan_return_confirmations
  for each row execute function app.guard_new_return_confirmation();

-- A pending confirmation is resolved once, and only how and when change:
-- withdrawn before it takes effect, applied, or lapsed because the loan left
-- its return phase or its agreement moved on.
create function app.guard_return_confirmation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resolution text[] := array['status', 'resolved_at'];
  loan app.loans;
begin
  select * into loan from app.loans where id = old.loan_id;

  if old.status <> 'pending'
    or (to_jsonb(old) - resolution) is distinct from (to_jsonb(new) - resolution)
    or (new.status = 'lapsed' and app.loan_return_phase(loan.status)
      and old.agreement_version = (app.current_loan_agreement(old.loan_id)).version)
  then
    raise exception 'return confirmation % cannot be resolved like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_return_confirmation_update() from public;

create trigger loan_return_confirmations_resolve
  before update on app.loan_return_confirmations
  for each row execute function app.guard_return_confirmation_update();

-- A waiting confirmation lapses as soon as it can no longer be made as
-- confirmed: the loan left its return phase (it ended, or its handover was
-- contradicted) or its agreement moved on.
create function app.lapse_return_confirmations()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed jsonb := to_jsonb(new);
  target uuid := coalesce(changed ->> 'loan_id', changed ->> 'id')::uuid;
  -- When the loan ended or changed status, or the new agreement was made.
  at timestamptz := coalesce(
    changed ->> 'ended_at', changed ->> 'status_changed_at', changed ->> 'recorded_at'
  )::timestamptz;
begin
  update app.loan_return_confirmations as confirmation
  set status = 'lapsed', resolved_at = at
  from app.loans as loan
  where loan.id = confirmation.loan_id
    and confirmation.loan_id = target
    and confirmation.status = 'pending'
    and (
      not app.loan_return_phase(loan.status)
      or confirmation.agreement_version
        <> (app.current_loan_agreement(loan.id)).version
    );

  return null;
end;
$$;

revoke execute on function app.lapse_return_confirmations() from public;

create trigger loans_lapse_return_confirmations
  after update of status on app.loans
  for each row
  when (old.status is distinct from new.status)
  execute function app.lapse_return_confirmations();

create trigger loan_agreements_lapse_return_confirmations
  after insert on app.loan_agreements
  for each row execute function app.lapse_return_confirmations();

-- A statement is the party's of its side, on the current agreement, and
-- either about a loan in its return phase, or a contradiction of the receipt
-- that ended it (PS-LOAN-017). Repeating what one's side said last is
-- refused unless the other side has spoken since. A statement made from a
-- confirmation says what was confirmed.
create function app.guard_new_return_report()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
  version integer := (app.current_loan_agreement(new.loan_id)).version;
  latest app.loan_return_reports;
begin
  select * into loan from app.loans where id = new.loan_id;
  select * into latest
  from app.loan_return_reports
  where loan_id = new.loan_id and agreement_version = version
  order by position desc
  limit 1;

  if new.reported_by_user_id is distinct from app.loan_party(loan, new.reporter_role)
    or new.agreement_version is distinct from version
    or not coalesce(
      app.loan_return_phase(loan.status)
      or (loan.status = 'ended' and loan.end_reason = 'returned'
        and new.outcome in ('still_has', 'not_received')),
      false
    )
    or (latest.reporter_role = new.reporter_role and latest.outcome = new.outcome)
    or (new.confirmation_id is not null and not exists (
      select 1 from app.loan_return_confirmations as confirmation
      where confirmation.id = new.confirmation_id
        and confirmation.status = 'applied'
        and confirmation.loan_id = new.loan_id
        and confirmation.agreement_version = new.agreement_version
        and confirmation.reporter_role = new.reporter_role
        and confirmation.outcome = new.outcome
    ))
  then
    raise exception 'loan % cannot get this return statement', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_return_report() from public;

create trigger loan_return_reports_guard
  before insert on app.loan_return_reports
  for each row execute function app.guard_new_return_report();

-- Whether the loan's agreed period can still become `period`: a reserved
-- loan can change both its handover and its return day, a handed-over loan
-- that is active or late only its return day (PS-LOAN-010, vision «Når
-- returtidspunktet passeres»).
create function app.loan_period_changeable(loan app.loans, period daterange)
returns boolean
language sql
stable
set search_path = ''
as $$
  select loan.status = 'reserved'
    or (loan.status in ('active', 'late')
      and lower(period) = lower((app.current_loan_agreement(loan.id)).period));
$$;

revoke execute on function app.loan_period_changeable(app.loans, daterange) from public;

create or replace function app.guard_new_loan_amendment()
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
    or not coalesce(app.loan_period_changeable(loan, new.period), false)
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

-- As in WP-32, with «can still change» in place of «reserved»: a proposal is
-- accepted only while the loan can take its period, and lapses once it
-- cannot (handed over with a new handover day, or past active and late).
create or replace function app.guard_loan_amendment_update()
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
        and app.loan_period_changeable(loan, old.period)
        and old.base_version = current_version
      when 'declined' then
        new.resolved_by_user_id = app.loan_party(loan, other_role)
      when 'withdrawn' then
        new.resolved_by_user_id = app.loan_party(loan, old.proposer_role)
      when 'lapsed' then
        not app.loan_period_changeable(loan, old.period)
        or old.base_version <> current_version
      else false
    end, false)
  then
    raise exception 'proposal % cannot be answered like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- An open proposal lapses as soon as the loan can no longer take its period.
create or replace function app.lapse_loan_amendments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update app.loan_amendments
  set status = 'lapsed', resolved_at = coalesce(new.ended_at, new.status_changed_at)
  where loan_id = new.id
    and status = 'proposed'
    and not app.loan_period_changeable(new, period);

  return null;
end;
$$;

drop trigger loans_lapse_amendments on app.loans;

create trigger loans_lapse_amendments
  after update of status on app.loans
  for each row
  when (old.status is distinct from new.status)
  execute function app.lapse_loan_amendments();

-- As in WP-32, with «can still change» in place of «reserved».
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
    or not coalesce(app.loan_period_changeable(loan, new.period), false)
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

-- A loan changes in these ways only (WP-35 adds the transfer of the
-- responsible lender):
-- - a reserved loan becomes active or disputed, or ends (cancelled by a
--   party, or not completed);
-- - an active loan becomes disputed, a disputed one active again, or it
--   ends as not completed;
-- - in its return phase it moves between active, awaiting return, late and
--   return disputed, or ends as returned;
-- - a loan that ended as returned reopens as return disputed (PS-LOAN-017);
-- - an ended loan lets go of its deleted object.
-- Whether the statements carry the new status is checked at commit
-- (ensure_loan_consistent). It is never deleted.
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
        and new.end_reason = 'not_completed')
      or (app.loan_return_phase(old.status) and app.loan_return_phase(new.status)
        and old.status <> new.status)
      or (app.loan_return_phase(old.status) and new.status = 'ended'
        and new.end_reason = 'returned')
      or (old.status = 'ended' and old.end_reason = 'returned'
        and new.status = 'return_disputed')
    ))
    or (old.status = 'ended' and old.object_id is not null and new.object_id is null
      and (to_jsonb(old) - 'object_id') = (to_jsonb(new) - 'object_id'))
  ) then
    raise exception 'loan % cannot change like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- PS-LOAN-013/014/017, PS-OBJ-005: while nobody knows for sure who has the
-- object (a disputed handover, an unsettled or disputed return, a borrower
-- who still has it, a reopened return), it is blocked from that loan's
-- handover day on, with no end, for every other new reservation or added
-- day. Reservations that were already made stay as they are. A reopened
-- loan holds no reservation, so the day comes from its agreement. That an
-- active loan's return day has passed is a matter of time, which the
-- domain decides (loanPossessionBlocks).
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
      and loan.status in ('disputed', 'awaiting_return', 'late', 'return_disputed')
      and loan.id <> except_loan
      and datemultirange(
        daterange(lower((app.current_loan_agreement(loan.id)).period), null)
      ) && period
  );
$$;

-- A reservation follows its loan, as in WP-33, and now also moves for an
-- active or late loan whose return day was agreed anew.
create or replace function app.guard_loan_reservation_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  added datemultirange;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from app.loans where id = old.loan_id and status <> 'ended') then
      raise exception 'loan % still holds its reservation', old.loan_id
        using errcode = 'restrict_violation';
    end if;

    return old;
  end if;

  added := datemultirange(new.period) - datemultirange(old.period);

  if new.loan_id <> old.loan_id
    or new.object_id <> old.object_id
    or not exists (
      select 1 from app.loans
      where id = new.loan_id and status in ('reserved', 'active', 'late')
    )
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
      or app.possession_uncertain(new.object_id, added, new.loan_id)
    ))
  then
    raise exception 'loan % cannot reserve that period', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- PS-LOAN-006/010–017: by commit,
-- - a loan that is not over holds exactly the period of its current
--   agreement, unless a receipt ended it once (then it was released and it
--   holds none, also when reopened); an ended loan holds none;
-- - every accepted proposal is its agreement's next version, and every
--   applied confirmation is a statement;
-- - the status is what the parties' current statements say: the handover
--   statements as in WP-33, and once handed over the return statements
--   (loan_return_verdict).
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
      end
    end, false)
  then
    raise exception 'loan % does not hold what it agreed and its parties said', loan.id
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

create constraint trigger loan_return_reports_consistent
  after insert on app.loan_return_reports
  deferrable initially deferred
  for each row execute function app.ensure_loan_consistent();

create constraint trigger loan_return_confirmations_consistent
  after update on app.loan_return_confirmations
  deferrable initially deferred
  for each row execute function app.ensure_loan_consistent();
