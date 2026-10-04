begin;

select plan(29);

select ok(
  not has_table_privilege(role_name, 'app.account_status_changes', 'SELECT'),
  format('%s cannot read app.account_status_changes', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

-- Anna (a1) owns the trailer (f1), published in the environment (e1) where
-- Bo (b1) and Cia (c1) are members; Bo and Cia have asked for it. Dag (d1)
-- is a steward. Eva (a2) has not completed registration.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000d1', 'active', now());
insert into app.users (id) values ('00000000-0000-4000-8000-0000000000a2');

insert into app.objects (id, title, category_id, description, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000f1', 'Tilhenger', 'annet', 'Liten tilhenger',
  '00000000-0000-4000-8000-0000000000a1');
insert into app.object_revisions (
  object_id, version, change, actor_user_id, title, category_id, description,
  status, availability, image_ids
)
values ('00000000-0000-4000-8000-0000000000f1', 1, 'created',
  '00000000-0000-4000-8000-0000000000a1', 'Tilhenger', 'annet', 'Liten tilhenger',
  'active', '[]', '{}');
insert into app.object_owners (object_id, user_id)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1');

insert into app.environments (id, type, name, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000e1', 'open', 'Borettslaget',
  '00000000-0000-4000-8000-0000000000a1');
insert into app.environment_memberships (
  environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1',
    'active', 'self_service', now(), 0),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1',
    'active', 'self_service', now(), 0);
insert into app.environment_publications (
  id, object_id, environment_id, published_by_user_id, status
)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'active');

create function pg_temp.ask(request uuid, borrower uuid)
returns void
language sql
as $$
  insert into app.loan_requests (
    id, object_id, borrower_user_id, origin, environment_id, publication_id,
    desired_start, desired_end, message, terms_version
  ) values (request, '00000000-0000-4000-8000-0000000000f1', borrower, 'environment',
    '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000101',
    '2026-11-02', '2026-11-04', 'Kan jeg låne den?', 1);
$$;

select pg_temp.ask('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1');
select pg_temp.ask('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1');

-- Records the change and moves the account, as the domain does.
create function pg_temp.change(
  account uuid, from_status text, to_status text, reason text,
  by_user uuid default null, by_process text default null, basis text default null
)
returns void
language sql
as $$
  insert into app.account_status_changes (
    user_id, from_status, to_status, reason, changed_at,
    changed_by_user_id, changed_by_process, basis
  ) values (account, from_status, to_status, reason, now(), by_user, by_process, basis);
  update app.users
  set status = to_status,
    status_reason = case when to_status = 'active' then null else reason end,
    status_changed_at = now()
  where id = account;
$$;

-- The state never changes on its own.
select throws_ok(
  $$update app.users set status = 'deactivated', status_reason = 'user_request',
      status_changed_at = now()
    where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '23001', null,
  'an account changes state only together with its recorded change'
);

create function pg_temp.deactivate_stating(stated_reason text)
returns void
language sql
as $$
  insert into app.account_status_changes (
    user_id, from_status, to_status, reason, changed_at, changed_by_user_id
  ) values ('00000000-0000-4000-8000-0000000000b1', 'active', 'deactivated',
    'user_request', now(), '00000000-0000-4000-8000-0000000000b1');
  update app.users
  set status = 'deactivated', status_reason = stated_reason, status_changed_at = now()
  where id = '00000000-0000-4000-8000-0000000000b1';
$$;

select throws_ok(
  $$select pg_temp.deactivate_stating('inactivity')$$,
  '23001', null,
  'the stored reason is the recorded change''s'
);

select lives_ok(
  $$update app.users set status = 'active', adult_confirmed_at = now()
    where id = '00000000-0000-4000-8000-0000000000a2'$$,
  'completing registration is not a lifecycle change'
);

-- Only the changes each reason allows, from the current state.
select throws_ok(
  $$select pg_temp.change('00000000-0000-4000-8000-0000000000b1', 'active', 'closing',
      'user_request', '00000000-0000-4000-8000-0000000000b1')$$,
  '23001', null,
  'a user cannot put their own account under closure'
);

select throws_ok(
  $$select pg_temp.change('00000000-0000-4000-8000-0000000000b1', 'deactivated', 'active',
      'user_request', '00000000-0000-4000-8000-0000000000b1')$$,
  '23001', null,
  'a change starts from the current state'
);

select throws_ok(
  $$select pg_temp.change('00000000-0000-4000-8000-0000000000b1', 'active', 'suspended',
      'platform', '00000000-0000-4000-8000-0000000000d1')$$,
  '23514', null,
  'a platform intervention needs its basis (PS-ADM-014)'
);

select throws_ok(
  $$select pg_temp.change('00000000-0000-4000-8000-0000000000b1', 'active', 'suspended',
      'platform', '00000000-0000-4000-8000-0000000000b1', null, 'Selv')$$,
  '23514', null,
  'nobody intervenes on their own account'
);

select throws_ok(
  $$select pg_temp.change('00000000-0000-4000-8000-0000000000b1', 'active', 'deactivated',
      'user_request', '00000000-0000-4000-8000-0000000000d1')$$,
  '23514', null,
  'only the user deactivates their own account'
);

-- Bo deactivates his account: his open request ends neutrally.
select lives_ok(
  $$select pg_temp.change('00000000-0000-4000-8000-0000000000b1', 'active', 'deactivated',
      'user_request', '00000000-0000-4000-8000-0000000000b1')$$,
  'the user deactivates their account'
);

select results_eq(
  $$select status, status_reason from app.users
    where id = '00000000-0000-4000-8000-0000000000b1'$$,
  $$values ('deactivated', 'user_request')$$,
  'the state and its reason are stored apart'
);

select results_eq(
  $$select status, end_reason from app.loan_requests
    where id = '00000000-0000-4000-8000-000000000201'$$,
  $$values ('ended', 'access_lost')$$,
  'the deactivated borrower''s open request ends'
);

select throws_ok(
  $$select pg_temp.ask('00000000-0000-4000-8000-000000000203',
      '00000000-0000-4000-8000-0000000000b1')$$,
  '23001', null,
  'a deactivated account makes no new request'
);

-- Nothing else new binds him either, also when someone else starts it.
select throws_ok(
  $$insert into app.friendships (requester_id, addressee_id)
    values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1')$$,
  '23001', null,
  'nobody befriends a deactivated account'
);

select throws_ok(
  $$insert into app.object_co_owner_invitations (object_id, invited_user_id, invited_by_user_id)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1',
      '00000000-0000-4000-8000-0000000000a1')$$,
  '23001', null,
  'nobody invites a deactivated account to co-own'
);

select throws_ok(
  $$insert into app.environments (type, name, created_by_user_id)
    values ('open', 'Nytt', '00000000-0000-4000-8000-0000000000b1')$$,
  '23001', null,
  'a deactivated account creates no environment'
);

select throws_ok(
  $$insert into app.cases (kind, environment_id, opened_by_user_id, opened_at)
    values ('environment_contact', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000b1', now())$$,
  '23001', 'an account of this cases does not take new activity',
  'a deactivated account opens no case'
);

select lives_ok(
  $$insert into app.friendships (requester_id, addressee_id)
    values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1')$$,
  'active accounts still befriend each other'
);

select throws_ok(
  $$update app.account_status_changes set basis = 'Endret'
    where user_id = '00000000-0000-4000-8000-0000000000b1'$$,
  '23001', null,
  'recorded changes cannot be rewritten'
);

select throws_ok(
  $$delete from app.account_status_changes
    where user_id = '00000000-0000-4000-8000-0000000000b1'$$,
  '23001', null,
  'recorded changes cannot be removed'
);

-- Reactivated, Bo may ask again; inactivity is the process's to record.
select lives_ok(
  $$select pg_temp.change('00000000-0000-4000-8000-0000000000b1', 'deactivated', 'active',
      'user_request', '00000000-0000-4000-8000-0000000000b1')$$,
  'the user takes the account into use again'
);

select results_eq(
  $$select status, status_reason from app.users
    where id = '00000000-0000-4000-8000-0000000000b1'$$,
  $$values ('active', null::text)$$,
  'an active account has no stored reason'
);

select throws_ok(
  $$select pg_temp.change('00000000-0000-4000-8000-0000000000b1', 'active', 'dormant',
      'inactivity', '00000000-0000-4000-8000-0000000000b1')$$,
  '23514', null,
  'only a process records inactivity'
);

-- Anna is suspended: nobody can lend the trailer, so Cia's request ends,
-- and it can neither be asked for nor lent.
select lives_ok(
  $$select pg_temp.change('00000000-0000-4000-8000-0000000000a1', 'active', 'suspended',
      'platform', '00000000-0000-4000-8000-0000000000d1', null, 'Brudd på vilkårene')$$,
  'a steward suspends the account with a basis'
);

select results_eq(
  $$select status, end_reason from app.loan_requests
    where id = '00000000-0000-4000-8000-000000000202'$$,
  $$values ('ended', 'object_unavailable')$$,
  'a request nobody can lend any more ends'
);

select throws_ok(
  $$select pg_temp.ask('00000000-0000-4000-8000-000000000204',
      '00000000-0000-4000-8000-0000000000c1')$$,
  '23001', null,
  'nobody asks for an object none of whose owners can lend'
);

select ok(
  not app.object_has_active_owner('00000000-0000-4000-8000-0000000000f1'),
  'the object has no owner who can lend'
);

-- A stopped loan ended administratively: nobody ended it.
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'loans_stopped_by_nobody') like '%ended_by_user_id IS NULL%',
  'a stopped loan is ended by nobody'
);

select * from finish();
rollback;
