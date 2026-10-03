begin;

select plan(21);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array[
    'app.loan_requests',
    'app.loan_request_responsibility_acceptances'
  ]) as table_name;

-- Anna (a1) owns the ladder (f1) and publishes it in the environment (e1),
-- where Bo (b1) is a member too. Cia (c1) is a member of nothing; Dag (d1)
-- is a stranger to all of them.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000d1', 'active', now());

insert into app.objects (id, title, category_id, description, loan_terms, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000f1', 'Stige', 'annet', 'Lang stige',
  'Vaskes etter bruk', '00000000-0000-4000-8000-0000000000a1');
insert into app.object_revisions (
  object_id, version, change, actor_user_id, title, category_id, description,
  loan_terms, status, availability, image_ids
)
values ('00000000-0000-4000-8000-0000000000f1', 1, 'created',
  '00000000-0000-4000-8000-0000000000a1', 'Stige', 'annet', 'Lang stige',
  'Vaskes etter bruk', 'active', '[]', '{}');
insert into app.object_owners (object_id, user_id)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1');

insert into app.environments (id, type, name, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000e1', 'open', 'Borettslaget',
  '00000000-0000-4000-8000-0000000000a1');
insert into app.environment_memberships (
  id, environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000b1', 'active', 'self_service', now(), 0);
insert into app.environment_publications (
  id, object_id, environment_id, published_by_user_id, status
)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'active');

select throws_ok(
  $$
    insert into app.loan_requests (
      object_id, borrower_user_id, origin, environment_id, publication_id,
      desired_days, message, terms_version
    )
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1',
      'environment', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-000000000101', 3, 'Kan jeg låne den?', 1)
  $$,
  '23001',
  null,
  'no request through an environment the borrower is not an active member of'
);

select throws_ok(
  $$
    insert into app.loan_requests (
      object_id, borrower_user_id, origin, desired_days, message, terms_version
    )
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1',
      'direct', 3, 'Kan jeg låne den?', 1)
  $$,
  '23001',
  null,
  'no direct request without a friendship with an owner (PS-LOAN-001)'
);

select throws_ok(
  $$
    insert into app.loan_requests (
      object_id, borrower_user_id, origin, environment_id, publication_id,
      desired_days, message, terms_version
    )
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1',
      'environment', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-000000000101', 3, 'Kan jeg låne den?', 1)
  $$,
  '23001',
  null,
  'an owner does not request their own object'
);

select throws_ok(
  $$
    insert into app.loan_requests (
      object_id, borrower_user_id, origin, environment_id, publication_id,
      desired_days, message, terms_version
    )
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1',
      'environment', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-000000000101', 3, 'Kan jeg låne den?', 2)
  $$,
  '23503',
  null,
  'the confirmed terms are a revision of the object (PS-LOAN-005)'
);

select lives_ok(
  $$
    insert into app.loan_requests (
      id, object_id, borrower_user_id, origin, environment_id, publication_id,
      desired_start, desired_end, message, terms_version
    )
    values ('00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1',
      'environment', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-000000000101', '2026-11-01', '2026-11-03',
      'Kan jeg låne den?', 1)
  $$,
  'an active member requests a published object'
);

select isnt(
  (select position from app.loan_requests
   where id = '00000000-0000-4000-8000-000000000201'),
  null,
  'an environment request has its place in the history (PS-ENV-009)'
);

-- Anna and Cia become friends.
insert into app.friendships (id, requester_id, addressee_id, status, accepted_at)
values ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000c1',
  '00000000-0000-4000-8000-0000000000a1', 'active', now());

select lives_ok(
  $$
    insert into app.loan_requests (
      id, object_id, borrower_user_id, origin, desired_days, message, terms_version
    )
    values ('00000000-0000-4000-8000-000000000202',
      '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1',
      'direct', 3, 'Kan jeg låne den?', 1)
  $$,
  'a friend of an owner requests directly'
);

select lives_ok(
  $$
    insert into app.loan_request_responsibility_acceptances
      (request_id, user_id, role, declaration_version)
    values
      ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
        'borrower', 1),
      ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000a1',
        'lender', 1)
  $$,
  'both parties accept the declaration for a direct request (PS-LOAN-003)'
);

select throws_ok(
  $$
    insert into app.loan_request_responsibility_acceptances
      (request_id, user_id, role, declaration_version)
    values ('00000000-0000-4000-8000-000000000202',
      '00000000-0000-4000-8000-0000000000d1', 'lender', 1)
  $$,
  '23001',
  null,
  'only an owner accepts as lender'
);

select throws_ok(
  $$
    insert into app.loan_request_responsibility_acceptances
      (request_id, user_id, role, declaration_version)
    values ('00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-0000000000a1', 'lender', 1)
  $$,
  '23503',
  null,
  'a request through an environment has no declaration'
);

select throws_ok(
  $$
    update app.loan_request_responsibility_acceptances
    set declaration_version = 2
    where request_id = '00000000-0000-4000-8000-000000000202'
  $$,
  '23001',
  null,
  'acceptances are never rewritten'
);

-- The terms change in a new version.
insert into app.object_revisions (
  object_id, version, change, actor_user_id, title, category_id, description,
  loan_terms, status, availability, image_ids
)
values ('00000000-0000-4000-8000-0000000000f1', 2, 'updated',
  '00000000-0000-4000-8000-0000000000a1', 'Stige', 'annet', 'Lang stige',
  'Vaskes og tørkes etter bruk', 'active', '[]', '{}');
update app.objects set version = 2, loan_terms = 'Vaskes og tørkes etter bruk'
where id = '00000000-0000-4000-8000-0000000000f1';

select is(
  (select array_agg(status order by id) from app.loan_requests),
  array['awaiting_terms_confirmation', 'awaiting_terms_confirmation'],
  'changed terms wait for the borrower''s confirmation (PS-LOAN-005)'
);

-- The friendship ends.
update app.friendships
set status = 'ended', ended_at = now(), end_reason = 'removed',
  ended_by_user_id = '00000000-0000-4000-8000-0000000000a1'
where id = '00000000-0000-4000-8000-000000000301';

select results_eq(
  $$ select status, end_reason from app.loan_requests
     where id = '00000000-0000-4000-8000-000000000202' $$,
  $$ values ('ended'::text, 'access_lost'::text) $$,
  'a direct request ends neutrally with the friendship (PS-LOAN-002)'
);

-- Bo leaves the environment.
update app.environment_memberships
set state = 'ended', end_reason = 'left', ended_at = now(), transition_deadline = null
where id = '00000000-0000-4000-8000-0000000000d2';

select results_eq(
  $$ select status, end_reason from app.loan_requests
     where id = '00000000-0000-4000-8000-000000000201' $$,
  $$ values ('ended'::text, 'access_lost'::text) $$,
  'an environment request ends neutrally with the membership'
);

select throws_ok(
  $$
    update app.loan_requests
    set status = 'requested', ended_at = null, end_reason = null
    where id = '00000000-0000-4000-8000-000000000201'
  $$,
  '23001',
  null,
  'an ended request never opens again'
);

-- Dag joins and asks on the current terms; then Anna withdraws the
-- publication.
insert into app.environment_memberships (
  id, environment_id, user_id, state, origin, activated_at, activation_revision
) values ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000d1', 'active', 'self_service', now(), 0);
insert into app.loan_requests (
  id, object_id, borrower_user_id, origin, environment_id, publication_id,
  desired_days, message, terms_version
)
values ('00000000-0000-4000-8000-000000000203',
  '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1',
  'environment', '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-000000000101', 3, 'Kan jeg låne den?', 2);
update app.environment_publications
set status = 'unpublished', end_reason = 'withdrawn', status_changed_at = now(),
  ended_at = now(), ended_by_user_id = '00000000-0000-4000-8000-0000000000a1'
where id = '00000000-0000-4000-8000-000000000101';

select results_eq(
  $$ select status, end_reason from app.loan_requests
     where id = '00000000-0000-4000-8000-000000000203' $$,
  $$ values ('ended'::text, 'publication_ended'::text) $$,
  'a request ends when its publication ends'
);

select is(
  (select count(*)::int from app.audit_events where resource_type = 'loan_request'),
  0,
  'ending a request in the database records no events'
);

select * from finish();
rollback;
