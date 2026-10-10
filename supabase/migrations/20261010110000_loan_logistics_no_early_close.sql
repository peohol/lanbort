-- Loan logistics channels have no early closing (PS-COM-007, OD-0020).
--
-- OD-0020 was decided on 6 October 2026: neither party can close the
-- channel while the loan is in progress; each may only mute or archive the
-- conversation for themselves. The channel closes only when the loan ends
-- (`loan_ended`) or its parties change (`parties_changed`). The unused
-- safety closure (`safety`) is removed, with the closed channel a restore
-- could add for it. Nothing ever ran it, so no channel has that reason.

do $$
begin
  if exists (select 1 from app.loan_logistics_channels where close_reason = 'safety') then
    raise exception 'a logistics channel was closed as a safety measure; decide what it becomes first';
  end if;
end;
$$;

alter table app.loan_logistics_channels
  drop constraint loan_logistics_channels_close_reason_check,
  add constraint loan_logistics_channels_close_reason_check
    check (close_reason in ('loan_ended', 'parties_changed'));

-- Whether the loan's current parties may have a logistics channel now: the
-- loan is in progress and they are blocked either way.
create or replace function app.loan_logistics_qualifies(loan app.loans)
returns boolean
language sql
stable
set search_path = ''
as $$
  select loan.status <> 'ended'
    and app.users_blocked(loan.borrower_user_id, loan.responsible_lender_id);
$$;

-- A new channel joins the loan's current parties, open, while the loan
-- qualifies. It is never added closed.
create or replace function app.guard_new_loan_logistics_channel()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
begin
  select * into loan from app.loans where id = new.loan_id;

  if new.closed_at is null
    and loan.borrower_user_id = new.borrower_user_id
    and loan.responsible_lender_id = new.lender_user_id
    and app.loan_logistics_qualifies(loan)
  then
    return new;
  end if;

  raise exception 'loan % cannot have such a logistics channel', new.loan_id
    using errcode = 'restrict_violation';
end;
$$;
