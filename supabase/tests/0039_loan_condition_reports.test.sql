begin;

select plan(24);

-- PS-LOAN-023: the parties' statements on damage, deficiency or loss.

select ok(
  not has_table_privilege(role_name, 'app.loan_condition_reports', privilege),
  format('%s cannot %s condition reports', role_name, privilege)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array['SELECT', 'INSERT']) as privilege;

select ok(
  not has_function_privilege(role_name, function_name, 'EXECUTE'),
  format('%s cannot run %s', role_name, function_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array[
    'app.loan_condition_reportable(app.loans)',
    'app.guard_new_loan_condition_report()'
  ]) as function_name;

-- Anna (a1) lends the trailer (f1), co-owned by Dag (d1), through the
-- environment (e1): to Bo (b1) for 2–4 November and to Cia (c1) for 12–14
-- November.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000d1', 'active', now());

insert into app.objects (id, title, category_id, description, loan_terms, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000f1', 'Tilhenger', 'annet', 'Liten tilhenger',
  'Vaskes etter bruk', '00000000-0000-4000-8000-0000000000a1');
insert into app.object_revisions (
  object_id, version, change, actor_user_id, title, category_id, description,
  loan_terms, status, availability, image_ids
)
values ('00000000-0000-4000-8000-0000000000f1', 1, 'created',
  '00000000-0000-4000-8000-0000000000a1', 'Tilhenger', 'annet', 'Liten tilhenger',
  'Vaskes etter bruk', 'active', '[]', '{}');
insert into app.object_owners (object_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1');
insert into app.object_availability_intervals (object_id, period)
values ('00000000-0000-4000-8000-0000000000f1', daterange('2026-11-01', null));

insert into app.environments (id, type, name, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000e1', 'open', 'Borettslaget',
  '00000000-0000-4000-8000-0000000000a1');
insert into app.environment_memberships (
  id, environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000b1', 'active', 'self_service', now(), 0),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000c1', 'active', 'self_service', now(), 0);
insert into app.environment_publications (
  id, object_id, environment_id, published_by_user_id, status
)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'active');

insert into app.loan_requests (
  id, object_id, borrower_user_id, origin, environment_id, publication_id,
  desired_start, desired_end, message, terms_version
) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000b1', 'environment',
    '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000101',
    '2026-11-02', '2026-11-04', 'Kan jeg låne den?', 1),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000c1', 'environment',
    '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000101',
    '2026-11-12', '2026-11-14', 'Kan jeg låne den?', 1);

create function pg_temp.approve(
  loan uuid, request uuid, borrower uuid, period daterange
)
returns void
language plpgsql
as $$
begin
  insert into app.loans (id, request_id, object_id, borrower_user_id, responsible_lender_id,
    owner_ids_at_approval)
  values (loan, request, '00000000-0000-4000-8000-0000000000f1', borrower,
    '00000000-0000-4000-8000-0000000000a1',
    array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1']::uuid[]);
  insert into app.loan_agreements (
    loan_id, version, object_version, terms_version, title, category_id,
    description, loan_terms, period, lender_user_id
  )
  values (loan, 1, 1, 1, 'Tilhenger', 'annet', 'Liten tilhenger',
    'Vaskes etter bruk', period, '00000000-0000-4000-8000-0000000000a1');
  insert into app.loan_reservations (loan_id, object_id, period)
  values (loan, '00000000-0000-4000-8000-0000000000f1', period);
  update app.loan_requests set status = 'approved', status_changed_at = now()
  where id = request;
end;
$$;

-- A statement on the loan: a report, or with `answers` an answer to one.
create function pg_temp.say(
  id uuid, loan uuid, by uuid, role text, description text,
  answers uuid default null, kind text default null
)
returns void
language sql
as $$
  insert into app.loan_condition_reports (
    id, loan_id, reported_by_user_id, reporter_role, description,
    responds_to_id, answer_kind
  ) values (id, loan, by, role, description, answers, kind);
$$;

select pg_temp.approve('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
  '[2026-11-02,2026-11-05)');
select pg_temp.approve('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
  '[2026-11-12,2026-11-15)');

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 'Ripe i lakken') $$,
  '23001',
  null,
  'a reserved loan cannot get a report: the object was never with the borrower'
);

-- Bo says the trailer was handed over: the loan is active.
insert into app.loan_handover_reports (
  loan_id, agreement_version, reported_by_user_id, reporter_role, outcome
) values ('00000000-0000-4000-8000-000000000301', 1,
  '00000000-0000-4000-8000-0000000000b1', 'borrower', 'handed_over');
update app.loans set status = 'active', status_changed_at = clock_timestamp()
where id = '00000000-0000-4000-8000-000000000301';

select lives_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000401',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 'Ripe i lakken') $$,
  'the borrower reports damage on the active loan'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000402',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000d1', 'lender', 'Mangler en stropp') $$,
  '23001',
  null,
  'a co-owner who is not the responsible lender does not speak for the lender'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000402',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000c1', 'borrower', 'Mangler en stropp') $$,
  '23001',
  null,
  'someone else is not the borrower of the loan'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000402',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000a1', 'lender', ' Mangler en stropp') $$,
  '23514',
  null,
  'the description is stored trimmed'
);

select lives_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000402',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000a1', 'lender', 'Mangler en stropp') $$,
  'the lender reports too'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000403',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000a1', 'lender', 'Uenig',
       '00000000-0000-4000-8000-000000000401') $$,
  '23514',
  null,
  'an answer says what kind of answer it is'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000403',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000a1', 'lender', 'Egen',
       '00000000-0000-4000-8000-000000000402', 'explanation') $$,
  '23001',
  null,
  'nobody answers their own side''s report'
);

select lives_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000403',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000a1', 'lender', 'Ripen var der før',
       '00000000-0000-4000-8000-000000000401', 'disagreement') $$,
  'the lender disagrees with the borrower''s report'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000404',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000a1', 'lender', 'Igjen',
       '00000000-0000-4000-8000-000000000401', 'explanation') $$,
  '23505',
  null,
  'a report has one answer'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000404',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', 'borrower', 'Svar på svar',
       '00000000-0000-4000-8000-000000000403', 'disagreement') $$,
  '23001',
  null,
  'an answer is never answered'
);

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000404',
       '00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000c1', 'borrower', 'Annet lån',
       '00000000-0000-4000-8000-000000000402', 'explanation') $$,
  '23001',
  null,
  'an answer is on the same loan as its report'
);

select throws_ok(
  $$ update app.loan_condition_reports set description = 'Endret'
     where id = '00000000-0000-4000-8000-000000000401' $$,
  '23001',
  null,
  'a statement is never changed'
);

select throws_ok(
  $$ delete from app.loan_condition_reports
     where id = '00000000-0000-4000-8000-000000000401' $$,
  '23001',
  null,
  'a statement is never deleted'
);

-- Anna received it: the loan ended as returned.
update app.loans set status = 'ended', status_changed_at = clock_timestamp(),
  end_reason = 'returned', ended_at = clock_timestamp(),
  ended_by_user_id = '00000000-0000-4000-8000-0000000000a1'
where id = '00000000-0000-4000-8000-000000000301';
delete from app.loan_reservations
where loan_id = '00000000-0000-4000-8000-000000000301';

select lives_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000405',
       '00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000a1', 'lender', 'Sprekk oppdaget senere') $$,
  'a report comes after the loan ended as returned, with no deadline'
);

-- Cia's loan was cancelled before the handover.
update app.loans set status = 'ended', status_changed_at = clock_timestamp(),
  end_reason = 'cancelled', ended_at = clock_timestamp(),
  ended_by_user_id = '00000000-0000-4000-8000-0000000000c1'
where id = '00000000-0000-4000-8000-000000000302';

select throws_ok(
  $$ select pg_temp.say('00000000-0000-4000-8000-000000000406',
       '00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000c1', 'borrower', 'Skade') $$,
  '23001',
  null,
  'a cancelled loan cannot get a report'
);

select * from finish();
rollback;
