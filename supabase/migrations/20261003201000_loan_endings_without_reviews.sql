-- Loan endings without review rights yet (WP-53 with WP-45 and WP-50).
--
-- The review window opens for the endings `app.review_dimensions` names
-- (PS-TRUST-001). A loan can also end administratively: stopped by a
-- suspension before its handover (`stopped`, PS-ADM-003) or unresolved by no
-- party (`unresolved`, PS-LOAN-018). Neither has review dimensions yet, so
-- such an ending opens no window, and a window paused by a reopening stays
-- paused, instead of the ending being refused. Which dimensions an unresolved
-- loan can be reviewed on (PS-TRUST-001: undisputed ones, marked unresolved)
-- is added as dimension data, with the ending in the window's basis.

create or replace function app.follow_loan_review_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  period app.loan_review_periods;
begin
  select * into period from app.loan_review_periods where loan_id = new.id for update;

  if new.status = 'ended' and not exists (
    select 1 from app.review_dimensions where new.end_reason = any(endings)
  ) then
    -- An ending nothing can be reviewed after opens no window; a paused one
    -- stays paused.
    return null;
  elsif new.status = 'ended' then
    if period.loan_id is null then
      insert into app.loan_review_periods (
        loan_id, borrower_user_id, lender_user_id, basis, opened_at, due_at
      ) values (
        new.id, new.borrower_user_id, new.responsible_lender_id, new.end_reason,
        new.ended_at, new.ended_at + app.loan_review_window()
      );
    elsif period.status = 'paused' then
      update app.loan_review_periods
      set status = 'open',
        borrower_user_id = new.borrower_user_id,
        lender_user_id = new.responsible_lender_id,
        basis = new.end_reason,
        opened_at = new.ended_at,
        due_at = new.ended_at + app.loan_review_window()
      where loan_id = new.id;

      update app.loan_reviews as review
      set status = 'lapsed', updated_at = new.ended_at
      where review.loan_id = new.id
        and review.status = 'hidden'
        and not app.loan_review_fits(review);
    end if;
  elsif period.status = 'open' and new.status_changed_at < period.due_at then
    update app.loan_review_periods
    set status = 'paused', due_at = null
    where loan_id = new.id;
  end if;

  return null;
end;
$$;

