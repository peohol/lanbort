-- WP-45 with WP-50: the review right after an administratively unresolved
-- loan.

-- PS-TRUST-001: a loan that ended unresolved can be reviewed only on what is
-- not in dispute, and the review is marked as unresolved by its basis. The
-- dispute may be about the handover or about the return, so only
-- communication is assessed: whether the object was handed over, returned,
-- on time or as described is exactly what nobody established.
alter table app.review_dimensions
  drop constraint review_dimensions_endings_check,
  add constraint review_dimensions_endings_check check (
    cardinality(endings) > 0
    and endings <@ array['cancelled', 'not_completed', 'returned', 'unresolved']
  );

update app.review_dimensions
set endings = endings || array['unresolved']
where code = 'communication';

alter table app.loan_review_periods
  drop constraint loan_review_periods_basis_check,
  add constraint loan_review_periods_basis_check check (
    basis in ('cancelled', 'not_completed', 'returned', 'unresolved')
  );
