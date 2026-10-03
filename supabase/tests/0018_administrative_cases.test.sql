begin;

select plan(40);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array[
    'app.cases', 'app.case_participants', 'app.case_actions', 'app.case_entries',
    'app.loan_control_confirmations'
  ]) as table_name;

-- As in 0017: Anna (a1) owns the trailer (f1) with Dag (d1) and approves
-- Bo's (b1) loan and Cia's (c1), both through the environment (e1) Anna
-- founded. Eva (a2) administers it with Anna. Siv (a3) is a platform
-- steward; Hans (a4) is a member nobody has made anything.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000d1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a3', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a4', 'active', now());

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
    '00000000-0000-4000-8000-0000000000c1', 'active', 'self_service', now(), 0),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a2', 'active', 'self_service', now(), 0);
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

insert into app.environment_memberships (
  id, environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a4', 'active', 'self_service', now(), 0);
insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'owner', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'administrator', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a2',
    'administrator', '00000000-0000-4000-8000-0000000000a1');
insert into app.platform_role_grants (user_id, role, grant_reason, granted_by_process)
values ('00000000-0000-4000-8000-0000000000a3', 'platform_steward', 'Pilot', 'ops.platform_roles');

select pg_temp.approve('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
  '[2026-11-02,2026-11-05)');
select pg_temp.approve('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
  '[2026-11-12,2026-11-15)');
-- Bo's handover is disputed.
insert into app.loan_handover_reports (
  loan_id, agreement_version, reported_by_user_id, reporter_role, outcome, answer_due_at
) values
  ('00000000-0000-4000-8000-000000000301', 1, '00000000-0000-4000-8000-0000000000b1',
    'borrower', 'not_handed_over', clock_timestamp() + interval '72 hours'),
  ('00000000-0000-4000-8000-000000000301', 1, '00000000-0000-4000-8000-0000000000a1',
    'lender', 'handed_over', null);
update app.loans set status = 'disputed', status_changed_at = clock_timestamp()
where id = '00000000-0000-4000-8000-000000000301';

-- Runs the deferred checks now, as a commit would.
create function pg_temp.check_now()
returns void
language plpgsql
as $$
begin
  set constraints app.loans_complete, app.loans_consistent,
    app.loan_reservations_consistent, app.loan_handover_reports_consistent,
    app.cases_consistent, app.case_actions_consistent
    immediate;
  set constraints app.loans_complete, app.loans_consistent,
    app.loan_reservations_consistent, app.loan_handover_reports_consistent,
    app.cases_consistent, app.case_actions_consistent
    deferred;
end;
$$;

create function pg_temp.open_case(
  id uuid, kind text, environment uuid, loan uuid, subject uuid, opener uuid
)
returns void
language sql
as $$
  insert into app.cases (id, kind, environment_id, loan_id, subject_user_id,
    opened_by_user_id, opened_at)
  values (id, kind, environment, loan, subject, opener, now());
$$;

create function pg_temp.act(c uuid, action text, actor uuid, target uuid)
returns void
language sql
as $$
  insert into app.case_actions (case_id, kind, actor_user_id, target_user_id, at)
  values (c, action, actor, target, now());
  update app.cases set assignee_user_id = case action
      when 'assigned' then target
      when 'released' then null
      else assignee_user_id
    end
  where id = c;
$$;

create function pg_temp.write(c uuid, author uuid, capacity text, audience text, corrects uuid)
returns uuid
language sql
as $$
  insert into app.case_entries (case_id, author_user_id, capacity, audience, body,
    corrects_entry_id, created_at)
  values (c, author, capacity, audience, 'Forklaring', corrects, now())
  returning id;
$$;

select pg_temp.check_now();

-- Opening a case.

select throws_ok(
  $$ select pg_temp.open_case('00000000-0000-4000-8000-000000000601',
       'environment_contact', '00000000-0000-4000-8000-0000000000e1', null, null,
       '00000000-0000-4000-8000-0000000000d1') $$,
  '23001',
  null,
  'only an active member contacts the administrators'
);

select lives_ok(
  $$ select pg_temp.open_case('00000000-0000-4000-8000-000000000601',
       'environment_contact', '00000000-0000-4000-8000-0000000000e1', null, null,
       '00000000-0000-4000-8000-0000000000a4');
     insert into app.case_participants (case_id, user_id, role, may_write, joined_at)
     values ('00000000-0000-4000-8000-000000000601',
       '00000000-0000-4000-8000-0000000000a4', 'requester', true, now()) $$,
  'an active member contacts the administrators'
);

select throws_ok(
  $$ select pg_temp.open_case('00000000-0000-4000-8000-000000000602',
       'environment_contact', '00000000-0000-4000-8000-0000000000e1', null, null,
       '00000000-0000-4000-8000-0000000000a4') $$,
  '23505',
  null,
  'a member has one open contact with the environment'
);

select throws_ok(
  $$ select pg_temp.open_case('00000000-0000-4000-8000-000000000603',
       'loan_mediation', '00000000-0000-4000-8000-0000000000e1',
       '00000000-0000-4000-8000-000000000302', null,
       '00000000-0000-4000-8000-0000000000c1') $$,
  '23001',
  null,
  'nothing is in question about a reserved loan'
);

select throws_ok(
  $$ select pg_temp.open_case('00000000-0000-4000-8000-000000000603',
       'loan_mediation', '00000000-0000-4000-8000-0000000000e1',
       '00000000-0000-4000-8000-000000000301', null,
       '00000000-0000-4000-8000-0000000000d1') $$,
  '23001',
  null,
  'only a party asks for mediation'
);

select lives_ok(
  $$ select pg_temp.open_case('00000000-0000-4000-8000-000000000603',
       'loan_mediation', '00000000-0000-4000-8000-0000000000e1',
       '00000000-0000-4000-8000-000000000301', null,
       '00000000-0000-4000-8000-0000000000b1');
     insert into app.case_participants (case_id, user_id, role, may_write, joined_at)
     values
       ('00000000-0000-4000-8000-000000000603',
         '00000000-0000-4000-8000-0000000000b1', 'borrower', true, now()),
       ('00000000-0000-4000-8000-000000000603',
         '00000000-0000-4000-8000-0000000000a1', 'lender', true, now()) $$,
  'a party of a disputed loan asks for mediation'
);

select throws_ok(
  $$ insert into app.case_participants (case_id, user_id, role, may_write, joined_at)
     values ('00000000-0000-4000-8000-000000000603',
       '00000000-0000-4000-8000-0000000000d1', 'lender', true, now()) $$,
  '23001',
  null,
  'a co-owner who is not the lender is no party of the mediation'
);

insert into app.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a4');

select throws_ok(
  $$ select pg_temp.open_case('00000000-0000-4000-8000-000000000604',
       'unavailability_report', null, null, '00000000-0000-4000-8000-0000000000c1',
       '00000000-0000-4000-8000-0000000000a4') $$,
  '23001',
  null,
  'no report across a block'
);

select lives_ok(
  $$ select pg_temp.open_case('00000000-0000-4000-8000-000000000604',
       'unavailability_report', null, null, '00000000-0000-4000-8000-0000000000c1',
       '00000000-0000-4000-8000-0000000000b1');
     insert into app.case_participants (case_id, user_id, role, may_write, joined_at)
     values ('00000000-0000-4000-8000-000000000604',
       '00000000-0000-4000-8000-0000000000b1', 'reporter', true, now()) $$,
  'a report about another user'
);

select pg_temp.check_now();

-- Who handles it.

select is(
  array(
    select candidate::text from unnest(array[
      '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2',
      '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a4'
    ]::uuid[]) as candidate
    where app.case_handler(
      (select c from app.cases as c where c.id = '00000000-0000-4000-8000-000000000603'),
      candidate, now())
  ),
  array['00000000-0000-4000-8000-0000000000a2'],
  'the mediation is for the administrator without a stake in the loan'
);

select is(
  array(
    select candidate::text from unnest(array[
      '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3',
      '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1'
    ]::uuid[]) as candidate
    where app.case_handler(
      (select c from app.cases as c where c.id = '00000000-0000-4000-8000-000000000604'),
      candidate, now())
  ),
  array['00000000-0000-4000-8000-0000000000a3'],
  'the report is for platform stewards only'
);

select throws_ok(
  $$ select pg_temp.act('00000000-0000-4000-8000-000000000603', 'assigned',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1') $$,
  '23001',
  null,
  'the lender cannot take the mediation of their own loan'
);

select lives_ok(
  $$ select pg_temp.act('00000000-0000-4000-8000-000000000601', 'assigned',
       '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a2') $$,
  'an administrator takes the contact'
);

select throws_ok(
  $$ select pg_temp.act('00000000-0000-4000-8000-000000000601', 'assigned',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1') $$,
  '23001',
  null,
  'nobody takes a case someone else has'
);

select throws_ok(
  $$ select pg_temp.write('00000000-0000-4000-8000-000000000601',
       '00000000-0000-4000-8000-0000000000a1', 'handler', 'parties', null) $$,
  '23001',
  null,
  'only the handler who has it writes as handler'
);

select throws_ok(
  $$ update app.cases set assignee_user_id = '00000000-0000-4000-8000-0000000000a1'
     where id = '00000000-0000-4000-8000-000000000601';
     select pg_temp.check_now() $$,
  '23001',
  null,
  'the responsible handler is what the actions say'
);

-- The handler loses the role: the case goes back to the queue.
update app.environment_role_grants
set revoked_at = now(), revoked_by_user_id = '00000000-0000-4000-8000-0000000000a1',
  revoke_reason = 'removed'
where user_id = '00000000-0000-4000-8000-0000000000a2';

select is(
  (select row(assignee_user_id, (
     select reason from app.case_actions
     where case_id = c.id order by position desc limit 1
   ))::text from app.cases as c where id = '00000000-0000-4000-8000-000000000601'),
  row(null::uuid, 'role_ended')::text,
  'the case went back to the queue, saying why'
);

-- Writing in it.

select lives_ok(
  $$ select pg_temp.write('00000000-0000-4000-8000-000000000603',
       '00000000-0000-4000-8000-0000000000b1', 'party', 'parties', null);
     update app.case_participants set may_write = false
     where user_id = '00000000-0000-4000-8000-0000000000b1' $$,
  'a party writes their statement'
);

select throws_ok(
  $$ select pg_temp.write('00000000-0000-4000-8000-000000000603',
       '00000000-0000-4000-8000-0000000000b1', 'party', 'parties', null) $$,
  '23001',
  null,
  'a party who has had their turn waits for a new round'
);

select throws_ok(
  $$ select pg_temp.write('00000000-0000-4000-8000-000000000604',
       '00000000-0000-4000-8000-0000000000a3', 'party', 'parties', null) $$,
  '23001',
  null,
  'a handler does not write as a party'
);

select throws_ok(
  $$ update app.case_entries set body = 'Endret' $$,
  '23001',
  null,
  'entries are never rewritten'
);

select throws_ok(
  $$ delete from app.case_actions $$,
  '23001',
  null,
  'the history is never deleted'
);

select throws_ok(
  $$ delete from app.cases $$,
  '23001',
  null,
  'cases are kept'
);

-- An administratively unresolved ending (PS-LOAN-018–019).

select throws_ok(
  $$ update app.loans set status = 'ended', end_reason = 'unresolved',
       ended_at = now(), ended_by_user_id = '00000000-0000-4000-8000-0000000000a1'
     where id = '00000000-0000-4000-8000-000000000301';
     select pg_temp.check_now() $$,
  '23514',
  null,
  'no party ends a loan as unresolved'
);

select lives_ok(
  $$ update app.loans set status = 'ended', end_reason = 'unresolved',
       ended_at = now(), ended_by_user_id = null, status_changed_at = clock_timestamp()
     where id = '00000000-0000-4000-8000-000000000301';
     delete from app.loan_reservations
     where loan_id = '00000000-0000-4000-8000-000000000301';
     select pg_temp.check_now() $$,
  'a disputed loan ends unresolved, by no party'
);

select ok(
  app.possession_uncertain('00000000-0000-4000-8000-0000000000f1',
    datemultirange(daterange('2026-11-20', '2026-11-22')),
    '00000000-0000-4000-8000-000000000302'),
  'its object takes no new loans until an owner has it back'
);

select throws_ok(
  $$ insert into app.loan_control_confirmations (loan_id, confirmed_by_user_id, confirmed_at)
     values ('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1', now()) $$,
  '23001',
  null,
  'the borrower never confirms having the object back'
);

select throws_ok(
  $$ insert into app.loan_control_confirmations (loan_id, confirmed_by_user_id, confirmed_at)
     values ('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000a1', now()) $$,
  '23001',
  null,
  'a loan that did not end unresolved needs no confirmation'
);

select lives_ok(
  $$ insert into app.loan_control_confirmations (loan_id, confirmed_by_user_id, confirmed_at)
     values ('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000d1', now()) $$,
  'a co-owner confirms having the object back'
);

select ok(
  not app.possession_uncertain('00000000-0000-4000-8000-0000000000f1',
    datemultirange(daterange('2026-11-20', '2026-11-22')),
    '00000000-0000-4000-8000-000000000302'),
  'then it takes new loans again'
);

select * from finish();
rollback;
