-- PS-LOAN-022: the side that has said nothing about the handover may still
-- say it did not happen once the loan is handed over, also once the return
-- is under way (awaiting return clarification, or late), as long as it has
-- said nothing about the return either. The contradiction makes the loan
-- disputed (PS-LOAN-013), with the return statements kept. Agreeing again
-- puts it back where those statements say; both saying it was not handed
-- over ends it as not completed, as before.

create or replace function app.guard_new_handover_report()
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
    or new.outcome is not distinct from latest
    or not coalesce(case loan.status
      when 'reserved' then true
      when 'disputed' then true
      when 'active' then latest is null
      when 'awaiting_return' then latest is null
        and new.outcome = 'not_handed_over'
        and not exists (
          select 1 from app.loan_return_reports
          where loan_id = new.loan_id
            and agreement_version = new.agreement_version
            and reporter_role = new.reporter_role
        )
      when 'late' then latest is null
        and new.outcome = 'not_handed_over'
        and not exists (
          select 1 from app.loan_return_reports
          where loan_id = new.loan_id
            and agreement_version = new.agreement_version
            and reporter_role = new.reporter_role
        )
      else false
    end, false)
  then
    raise exception 'loan % cannot get this handover statement', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_handover_report() from public;

-- As in WP-45, and a loan awaiting return clarification or late becomes
-- disputed when its handover is contradicted, and goes back once the
-- parties agree it was handed over.
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
      or (old.status = 'disputed' and new.status in ('active', 'awaiting_return', 'late'))
      or (old.status in ('awaiting_return', 'late') and new.status = 'disputed')
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

-- As in PS-ADM-003, and a disputed handover, or a loan that ended as not
-- completed, keeps what was said about the return before the handover was
-- contradicted; none of it confirmed a receipt or disputed the return.
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
      when 'disputed' then handover = 'disputed'
        and returned in ('none', 'returned', 'not_received', 'late')
      when 'awaiting_return' then handover = 'handed_over'
        and returned in ('returned', 'not_received')
      when 'late' then handover = 'handed_over' and returned = 'late'
      when 'return_disputed' then handover = 'handed_over'
        and returned in ('disputed', 'reopened')
      when 'ended' then case loan.end_reason
        when 'cancelled' then handover = 'none' and returned = 'none'
        when 'stopped' then handover = 'none' and returned = 'none'
        when 'not_completed' then handover in ('not_handed_over', 'unanswered')
          and returned in ('none', 'returned', 'not_received', 'late')
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
