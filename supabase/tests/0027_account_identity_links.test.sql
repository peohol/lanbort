begin;

select plan(23);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array[
    'app.account_links', 'app.account_identity_findings', 'app.account_object_transfers'
  ]) as table_name;

-- Anna (a1) is retired as a duplicate of Bo (b1); Cia (c1) is a steward;
-- Dag (d1) is someone else; Eva (e1) is suspended.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000d1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000e1', 'active', now());

-- Anna's trailer (f1), which Bo joins; Dag's bike (f2).
insert into app.objects (id, title, category_id, description, created_by_user_id) values
  ('00000000-0000-4000-8000-0000000000f1', 'Tilhenger', 'annet', 'Liten tilhenger',
    '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f2', 'Sykkel', 'annet', 'Blå sykkel',
    '00000000-0000-4000-8000-0000000000d1');
insert into app.object_owners (object_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000d1');

create function pg_temp.intervene(account uuid, target text)
returns void
language sql
as $$
  insert into app.account_status_changes (
    user_id, from_status, to_status, reason, changed_at, changed_by_user_id, basis
  ) values (account, 'active', target, 'platform', '2026-10-03 12:00:00+00',
    '00000000-0000-4000-8000-0000000000c1', 'Grunnlag');
  update app.users
  set status = target, status_reason = 'platform',
    status_changed_at = '2026-10-03 12:00:00+00'
  where id = account;
$$;

create function pg_temp.link(retired uuid, continued uuid)
returns void
language sql
as $$
  insert into app.account_links (
    kind, user_id, linked_user_id, basis, recorded_by_user_id, recorded_at
  ) values ('duplicate', retired, continued, 'Samme person',
    '00000000-0000-4000-8000-0000000000c1', now());
$$;

select throws_ok(
  $$select pg_temp.link('00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000b1')$$,
  '23001', null,
  'a duplicate is retired only once it is under controlled closure'
);

select pg_temp.intervene('00000000-0000-4000-8000-0000000000a1', 'closing');
select pg_temp.intervene('00000000-0000-4000-8000-0000000000e1', 'suspended');

select throws_ok(
  $$select pg_temp.link('00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000e1')$$,
  '23001', null,
  'the account that continues must be active'
);

select lives_ok(
  $$select pg_temp.link('00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000b1')$$,
  'a steward retires a duplicate under closure into an active account'
);

select throws_ok(
  $$select pg_temp.link('00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000d1')$$,
  '23505', null,
  'an account is retired as a duplicate once'
);

select throws_ok(
  $$insert into app.account_links (
    kind, user_id, linked_user_id, basis, recorded_by_user_id, recorded_at
  ) values ('same_person', '00000000-0000-4000-8000-0000000000d1',
    '00000000-0000-4000-8000-0000000000b1', 'Samme person',
    '00000000-0000-4000-8000-0000000000c1', now())$$,
  '23514', null,
  'a same-person pair is stored once, lower id first'
);

select throws_ok(
  $$insert into app.account_links (
    kind, user_id, linked_user_id, basis, recorded_by_user_id, recorded_at
  ) values ('same_person', '00000000-0000-4000-8000-0000000000b1',
    '00000000-0000-4000-8000-0000000000c1', 'Samme person',
    '00000000-0000-4000-8000-0000000000c1', now())$$,
  '23514', null,
  'a steward never links their own account'
);

select lives_ok(
  $$insert into app.account_links (
    kind, user_id, linked_user_id, basis, recorded_by_user_id, recorded_at
  ) values ('same_person', '00000000-0000-4000-8000-0000000000d1',
    '00000000-0000-4000-8000-0000000000e1', 'Samme person',
    '00000000-0000-4000-8000-0000000000c1', now())$$,
  'any two accounts can be linked as the same person, a suspended one too'
);

select throws_ok(
  $$update app.account_links set basis = 'Endret'$$,
  '23001', null,
  'links are append-only'
);

select throws_ok(
  $$delete from app.account_links$$,
  '23001', null,
  'links are never removed'
);

insert into app.account_identity_findings (
  user_id, finding, basis, recorded_by_user_id, recorded_at
) values ('00000000-0000-4000-8000-0000000000e1', 'false_identity', 'Falsk navn',
  '00000000-0000-4000-8000-0000000000c1', now());

select throws_ok(
  $$insert into app.account_identity_findings (
    user_id, finding, basis, recorded_by_user_id, recorded_at
  ) values ('00000000-0000-4000-8000-0000000000c1', 'false_identity', 'Selv',
    '00000000-0000-4000-8000-0000000000c1', now())$$,
  '23514', null,
  'a steward records no finding about their own account'
);

select throws_ok(
  $$update app.account_identity_findings set basis = 'Endret'$$,
  '23001', null,
  'findings are append-only'
);

create function pg_temp.transfer(object uuid, from_user uuid, to_user uuid)
returns void
language sql
as $$
  insert into app.account_object_transfers (
    link_id, object_id, from_user_id, to_user_id, basis, moved_by_user_id, moved_at
  ) values (
    (select id from app.account_links where kind = 'duplicate'
      and user_id = '00000000-0000-4000-8000-0000000000a1'),
    object, from_user, to_user, 'Overført', '00000000-0000-4000-8000-0000000000c1', now()
  );
$$;

select throws_ok(
  $$select pg_temp.transfer('00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')$$,
  '23001', null,
  'an object moves only once the continuing account owns it'
);

insert into app.object_owners (object_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1');

select throws_ok(
  $$select pg_temp.transfer('00000000-0000-4000-8000-0000000000f2',
    '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')$$,
  '23001', null,
  'never someone else''s object'
);

select throws_ok(
  $$select pg_temp.transfer('00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1')$$,
  '23001', null,
  'an object moves only along its duplicate link'
);

select lives_ok(
  $$select pg_temp.transfer('00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')$$,
  'a duplicate''s object moves to the account that continues'
);

select throws_ok(
  $$update app.account_object_transfers set basis = 'Endret'$$,
  '23001', null,
  'transfers are append-only'
);

select throws_ok(
  $$delete from app.account_object_transfers$$,
  '23001', null,
  'transfers are never removed, not even with their object'
);

select * from finish();
rollback;
