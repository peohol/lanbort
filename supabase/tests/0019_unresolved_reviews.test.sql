begin;

select plan(4);

-- PS-TRUST-001: after an unresolved ending, only what is not in dispute.
select is(
  app.review_dimensions_for('unresolved', role),
  array['communication'],
  format('the %s scores only communication after an unresolved ending', role)
)
from unnest(array['borrower', 'lender']) as role;

select is(
  app.review_dimensions_for('returned', 'borrower'),
  array['available_at_handover', 'available_for_return', 'matches_description', 'communication'],
  'a returned loan is still reviewed in full'
);

select ok(
  pg_get_constraintdef(
    (select oid from pg_constraint where conname = 'loan_review_periods_basis_check')
  ) like '%unresolved%',
  'a review window can follow an unresolved ending'
);

select * from finish();
rollback;
