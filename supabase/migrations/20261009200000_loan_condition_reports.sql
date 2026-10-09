-- PS-LOAN-023 (OD-0033): damage, deficiency and loss as traceable
-- statements on a loan.
--
-- Either party registers a short, factual description of a concrete damage,
-- deficiency or loss, at the return or at any time later, with no deadline.
-- The other party may answer it once, disagreeing or adding their own
-- explanation; the answer is a row of its own that points to the report, so
-- nothing anyone said is ever overwritten. A statement is not a loan status,
-- an accusation, a claim or a trust score: nothing here touches the loan,
-- its ending or its reviews.
--
-- Who may speak is the domain's policy (the parties, `loan.report_condition`
-- and `loan.answer_condition`); the guard below keeps the same rules for
-- any other writer.

create table app.loan_condition_reports (
  id uuid primary key default gen_random_uuid(),
  -- The order statements were made in, given by the database.
  position bigint generated always as identity unique,
  loan_id uuid not null references app.loans (id),
  reported_by_user_id uuid not null references app.users (id),
  -- The side the statement was made for, as the loan's party then.
  reporter_role text not null check (reporter_role in ('borrower', 'lender')),
  -- Null for a report; for an answer, the report it answers.
  responds_to_id uuid references app.loan_condition_reports (id),
  -- What an answer does: disagree, or add the answering party's explanation.
  answer_kind text check (answer_kind in ('disagreement', 'explanation')),
  -- Free text, seen only by the parties; never copied to events or logs.
  description text not null check (
    char_length(description) between 1 and 2000
    and description = btrim(description)
  ),
  reported_at timestamptz not null default clock_timestamp(),
  constraint loan_condition_reports_answer_shape check (
    (responds_to_id is null) = (answer_kind is null)
  ),
  -- A report has at most one answer.
  constraint loan_condition_reports_one_answer unique (responds_to_id)
);

comment on table app.loan_condition_reports is
  'The parties'' append-only statements on damage, deficiency or loss, and the other party''s answers (PS-LOAN-023).';

create index loan_condition_reports_loan
  on app.loan_condition_reports (loan_id, position);

create trigger loan_condition_reports_immutable
  before update or delete on app.loan_condition_reports
  for each row execute function app.reject_append_only_mutation();

-- Whether the loan's object has been with the borrower, so a report can be
-- made: the loan is handed over and in its return phase, or it ended after
-- the handover (returned, or administratively unresolved). Not before the
-- handover, not while the handover is disputed, and not for a loan that was
-- cancelled, stopped or never completed.
create function app.loan_condition_reportable(loan app.loans)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select loan.status in ('active', 'awaiting_return', 'late', 'return_disputed')
    or (loan.status = 'ended' and loan.end_reason in ('returned', 'unresolved'));
$$;

revoke execute on function app.loan_condition_reportable(app.loans) from public;

-- A statement is made by the party of its side now. A report needs a loan
-- whose object has been with the borrower. An answer points to a report
-- (never to another answer) on the same loan, made for the other side.
create function app.guard_new_loan_condition_report()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
  report app.loan_condition_reports;
begin
  select * into loan from app.loans where id = new.loan_id;

  if new.reported_by_user_id is distinct from app.loan_party(loan, new.reporter_role) then
    raise exception 'only the party of its side speaks on loan %', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  if new.responds_to_id is null then
    if not app.loan_condition_reportable(loan) then
      raise exception 'loan % cannot get a condition report', new.loan_id
        using errcode = 'restrict_violation';
    end if;
  else
    select * into report
    from app.loan_condition_reports
    where id = new.responds_to_id;

    if report.loan_id is distinct from new.loan_id
      or report.responds_to_id is not null
      or report.reporter_role = new.reporter_role
    then
      raise exception 'an answer on loan % answers the other side''s report', new.loan_id
        using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_loan_condition_report() from public;

create trigger loan_condition_reports_guard
  before insert on app.loan_condition_reports
  for each row execute function app.guard_new_loan_condition_report();
