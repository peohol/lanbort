begin;

select plan(16);

select has_table('app', 'search_objects', 'app.search_objects exists');
select has_table('app', 'search_environments', 'app.search_environments exists');

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array['app.search_objects', 'app.search_environments']) as table_name;

-- Anna (a1) owns the ladder (f1, published) and the drill (f2, not
-- published). The open environment (e1) and the closed one (e2) may be
-- found; the hidden one (e3) never.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

insert into app.objects (id, title, category_id, description, created_by_user_id) values
  ('00000000-0000-4000-8000-0000000000f1', 'Stige', 'annet', 'Lang aluminiumsstige',
    '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f2', 'Drill', 'annet', 'Slagdrill',
    '00000000-0000-4000-8000-0000000000a1');
insert into app.object_owners (object_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a1');

insert into app.environments (id, type, name, location, created_by_user_id) values
  ('00000000-0000-4000-8000-0000000000e1', 'open', 'Borettslaget', 'Torshov',
    '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e2', 'closed', 'Verkstedet', null,
    '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e3', 'hidden', 'Hemmelig klubb', null,
    '00000000-0000-4000-8000-0000000000a1');
insert into app.environment_memberships (
  environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'active', 'founder', now(), 0);
insert into app.environment_publications (
  object_id, environment_id, published_by_user_id, status
) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a1', 'active');

select ok(
  app.reconcile_search_index() > 0,
  'the whole index is built from the authoritative tables'
);

select results_eq(
  $$
    select object_id from app.search_objects
    where object_id in ('00000000-0000-4000-8000-0000000000f1',
      '00000000-0000-4000-8000-0000000000f2')
  $$,
  $$ values ('00000000-0000-4000-8000-0000000000f1'::uuid) $$,
  'only actively published objects are indexed'
);

select results_eq(
  $$
    select environment_id from app.search_environments
    where environment_id in ('00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e3')
    order by environment_id
  $$,
  $$
    values ('00000000-0000-4000-8000-0000000000e1'::uuid),
      ('00000000-0000-4000-8000-0000000000e2'::uuid)
  $$,
  'open and closed environments are indexed, a hidden one never'
);

select is(
  app.refresh_search_objects(array['00000000-0000-4000-8000-0000000000f1'::uuid]),
  0,
  'a repeated refresh changes nothing'
);

select ok(
  (select document @@ app.search_query('stiger') from app.search_objects
    where object_id = '00000000-0000-4000-8000-0000000000f1')
  and (select document @@ app.search_query('alumin') from app.search_objects
    where object_id = '00000000-0000-4000-8000-0000000000f1')
  and not (select document @@ app.search_query('drill') from app.search_objects
    where object_id = '00000000-0000-4000-8000-0000000000f1'),
  'a word matches by its stem or its beginning, and nothing else'
);

select ok(
  (select document @@ app.search_query('torshov') from app.search_environments
    where environment_id = '00000000-0000-4000-8000-0000000000e1'),
  'an environment is found by its location'
);

select lives_ok(
  $$ select app.search_query(E'\'); drop table app.objects; -- & | ! :* \\') $$,
  'any text is a safe query'
);

update app.objects
set title = 'Trappestige', version = version + 1
where id = '00000000-0000-4000-8000-0000000000f1';
select app.refresh_search_objects(array['00000000-0000-4000-8000-0000000000f1'::uuid]);

select ok(
  (select document @@ app.search_query('trappestige') from app.search_objects
    where object_id = '00000000-0000-4000-8000-0000000000f1'),
  'a refresh follows the content'
);

update app.objects
set status = 'archived', archived_at = now(), version = version + 1
where id = '00000000-0000-4000-8000-0000000000f1';

select is(
  app.refresh_search_objects(array['00000000-0000-4000-8000-0000000000f1'::uuid]),
  1,
  'an archived object leaves the index'
);

update app.environments
set type = 'hidden'
where id = '00000000-0000-4000-8000-0000000000e2';
select app.refresh_search_environments(array['00000000-0000-4000-8000-0000000000e2'::uuid]);

select ok(
  not exists (
    select 1 from app.search_environments
    where environment_id = '00000000-0000-4000-8000-0000000000e2'
  ),
  'an environment that becomes hidden leaves the index'
);

select finish();
rollback;
