-- Phase 3 handover and the active loan (WP-33, PS-LOAN-012–013).
--
-- The parties say what happened at the handover: the object was handed over,
-- or it was not. Their statements are append-only rows on the agreement
-- version they were given for; the loan's status follows from the latest
-- statement of each side on the current version:
-- - nobody has said anything: still `reserved` (shown as awaiting handover
--   clarification once the handover day is over);
-- - one side says handed over and the other does not contradict: `active`;
-- - one says handed over, the other not: `disputed`, and the object is
--   blocked for new colliding loans until the parties agree;
-- - both say not handed over: `ended` as `not_completed`;
-- - one says not handed over and the other does not answer by the deadline
--   on that statement: `ended` as `not_completed`, by nobody. Silence is
--   never read as the other side's fault, only as no answer.
-- An agreed new handover (WP-32's amendment) is a new agreement version, so
-- the statements on the old one stop counting and stay as history.

alter table app.loans
  drop constraint loans_status_check,
  add constraint loans_status_check check (
    status in ('reserved', 'active', 'disputed', 'ended')
  ),
  drop constraint loans_end_reason_check,
  add constraint loans_end_reason_check check (
    end_reason in ('cancelled', 'not_completed')
  ),
  -- Nobody ends a loan as not completed: the parties' statements do.
  add constraint loans_not_completed_by_nobody check (
    end_reason is distinct from 'not_completed' or ended_by_user_id is null
  ),
  add constraint loans_ended_by_shape check (
    ended_at is not null or ended_by_user_id is null
  );

-- A party's statement about the handover of a loan, on the agreement version
-- they saw. A statement that it was not handed over carries the deadline by
-- which the other side may answer it (pilot standard 72 hours, set by the
-- domain). `position` orders statements, also when they share a timestamp.
create table app.loan_handover_reports (
  id uuid primary key default gen_random_uuid(),
  position bigint generated always as identity unique,
  loan_id uuid not null references app.loans (id),
  agreement_version integer not null check (agreement_version > 0),
  reported_by_user_id uuid not null references app.users (id),
  reporter_role text not null check (reporter_role in ('borrower', 'lender')),
  outcome text not null check (outcome in ('handed_over', 'not_handed_over')),
  reported_at timestamptz not null default clock_timestamp(),
  answer_due_at timestamptz,
  constraint loan_handover_reports_answer_shape check (
    (outcome = 'not_handed_over') = (answer_due_at is not null)
    and (answer_due_at is null or answer_due_at > reported_at)
  )
);

comment on table app.loan_handover_reports is
  'The parties'' append-only statements on whether a loan was handed over (PS-LOAN-012–013).';

create index loan_handover_reports_loan
  on app.loan_handover_reports (loan_id, agreement_version, position);

create trigger loan_handover_reports_immutable
  before update or delete on app.loan_handover_reports
  for each row execute function app.reject_append_only_mutation();

-- The latest statement of each side on the loan's current agreement.
create function app.current_handover_reports(loan uuid)
returns table (reporter_role text, outcome text, answer_due_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select distinct on (report.reporter_role)
    report.reporter_role, report.outcome, report.answer_due_at
  from app.loan_handover_reports as report
  where report.loan_id = loan
    and report.agreement_version = (app.current_loan_agreement(loan)).version
  order by report.reporter_role, report.position desc;
$$;

revoke execute on function app.current_handover_reports(uuid) from public;

-- What the current statements say as of `at` (the domain's handoverVerdict):
-- 'none', 'handed_over', 'disputed', 'not_handed_over' (both say so),
-- 'awaiting_answer' (one says so, the other has until the deadline) or
-- 'unanswered' (the deadline has passed without an answer).
create function app.loan_handover_verdict(loan uuid, at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when count(*) = 0 then 'none'
    when bool_and(outcome = 'handed_over') then 'handed_over'
    when not bool_and(outcome = 'not_handed_over') then 'disputed'
    when count(*) = 2 then 'not_handed_over'
    when max(answer_due_at) <= at then 'unanswered'
    else 'awaiting_answer'
  end
  from app.current_handover_reports(loan);
$$;

revoke execute on function app.loan_handover_verdict(uuid, timestamptz) from public;

-- A statement is the party's of its side, on the current agreement of a loan
-- that is not over, and says something new for that side. Once the loan is
-- active, only the side that has not spoken may still contradict it.
create function app.guard_new_handover_report()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
  latest text;
begin
  select * into loan from app.loans where id = new.loan_id;
  select outcome into latest
  from app.current_handover_reports(new.loan_id)
  where reporter_role = new.reporter_role;

  if new.reported_by_user_id is distinct from app.loan_party(loan, new.reporter_role)
    or new.agreement_version is distinct from (app.current_loan_agreement(new.loan_id)).version
    or coalesce(loan.status not in ('reserved', 'active', 'disputed'), true)
    or new.outcome is not distinct from latest
    or (loan.status = 'active' and latest is not null)
  then
    raise exception 'loan % cannot get this handover statement', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_handover_report() from public;

create trigger loan_handover_reports_guard
  before insert on app.loan_handover_reports
  for each row execute function app.guard_new_handover_report();

-- A loan changes in these ways only (WP-35 adds the transfer of the
-- responsible lender, WP-34 the return):
-- - a reserved loan becomes active or disputed, or ends (cancelled by a
--   party, or not completed);
-- - an active loan becomes disputed, a disputed one active again, or it
--   ends as not completed;
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

-- An open proposal lapses when the loan leaves reserved, whichever way: it
-- ends, or it is handed over (WP-34 brings changes during the loan).
create or replace function app.lapse_loan_amendments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update app.loan_amendments
  set status = 'lapsed', resolved_at = coalesce(new.ended_at, new.status_changed_at)
  where loan_id = new.id and status = 'proposed';

  return null;
end;
$$;

-- PS-LOAN-013: while a loan is disputed, nobody knows who has the object, so
-- from its handover day on it is blocked for every other new reservation or
-- added day. Reservations that were already made stay as they are.
create function app.possession_uncertain(
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
    join app.loan_reservations as reservation on reservation.loan_id = loan.id
    where loan.object_id = object
      and loan.status = 'disputed'
      and loan.id <> except_loan
      and datemultirange(daterange(lower(reservation.period), null)) && period
  );
$$;

revoke execute on function app.possession_uncertain(uuid, datemultirange, uuid) from public;

create or replace function app.guard_new_loan_reservation()
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
    or app.possession_uncertain(new.object_id, datemultirange(new.period), new.loan_id)
  then
    raise exception 'loan % cannot reserve that period', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- A reservation follows its loan:
-- - its period moves only for a reserved loan and only to an agreed one
--   (checked at commit), and the days it adds must lie within the object's
--   general availability, outside every co-owner restriction and freeze and
--   outside uncertain possession, like a new reservation; overlap with other
--   loans is the exclusion constraint's;
-- - it is released (deleted) only once the loan has ended.
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
      or app.possession_uncertain(new.object_id, added, new.loan_id)
    ))
  then
    raise exception 'loan % cannot reserve that period', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- PS-LOAN-006/010–013: by commit,
-- - a loan that is not over holds exactly the period of its current
--   agreement, and an ended loan holds none;
-- - every accepted proposal is its agreement's next version;
-- - the status is what the parties' current statements say: reserved while
--   nobody has spoken or an answer is awaited, active when handed over,
--   disputed when they contradict each other; not completed when both say it
--   was not handed over, or the deadline of an unanswered statement had
--   passed when it ended; cancelled only while nobody had spoken.
create or replace function app.ensure_loan_consistent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed jsonb := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  loan app.loans;
  verdict text;
begin
  select * into loan from app.loans
  where id = (changed ->> case tg_table_name when 'loans' then 'id' else 'loan_id' end)::uuid;
  verdict := app.loan_handover_verdict(loan.id, coalesce(loan.ended_at, clock_timestamp()));

  if (case loan.status
      when 'ended' then exists (select 1 from app.loan_reservations where loan_id = loan.id)
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
    or not coalesce(case loan.status
      when 'reserved' then verdict in ('none', 'awaiting_answer', 'unanswered')
      when 'active' then verdict = 'handed_over'
      when 'disputed' then verdict = 'disputed'
      when 'ended' then case loan.end_reason
        when 'cancelled' then verdict = 'none'
        when 'not_completed' then verdict in ('not_handed_over', 'unanswered')
      end
    end, false)
  then
    raise exception 'loan % does not hold what it agreed and its parties said', loan.id
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

create constraint trigger loan_handover_reports_consistent
  after insert on app.loan_handover_reports
  deferrable initially deferred
  for each row execute function app.ensure_loan_consistent();
