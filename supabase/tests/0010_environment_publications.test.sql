begin;

select plan(19);

select has_table('app', 'environment_publications', 'app.environment_publications exists');
select has_column(
  'app', 'environments', 'requires_object_approval',
  'environments can require approval of objects'
);

select ok(
  not has_table_privilege(role_name, 'app.environment_publications', 'SELECT'),
  format('%s cannot read app.environment_publications', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

-- Anna (a1) and Bo (b1) own the ladder (f1); Cia (c1) owns the drill (f2).
-- Anna and Bo are active members of the environment (e1); Cia is a member of
-- no environment.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now());

insert into app.objects (id, title, category_id, description, created_by_user_id) values
  ('00000000-0000-4000-8000-0000000000f1', 'Stige', 'annet', 'Lang stige',
    '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f2', 'Drill', 'annet', 'Slagdrill',
    '00000000-0000-4000-8000-0000000000c1');
insert into app.object_owners (object_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000c1');

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

select lives_ok(
  $$
    insert into app.environment_publications (
      id, object_id, environment_id, published_by_user_id, status
    )
    values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1',
      '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'active')
  $$,
  'an owner with active access publishes'
);

select throws_ok(
  $$
    insert into app.environment_publications (
      object_id, environment_id, published_by_user_id, status
    )
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000b1', 'pending')
  $$,
  '23505',
  null,
  'an object has one current publication per environment'
);

select throws_ok(
  $$
    insert into app.environment_publications (
      object_id, environment_id, published_by_user_id, status
    )
    values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000c1', 'active')
  $$,
  '23001',
  null,
  'no publication without an owner with active access'
);

select throws_ok(
  $$
    update app.environment_publications
    set status = 'unpublished', status_changed_at = now(), ended_at = now()
    where id = '00000000-0000-4000-8000-000000000101'
  $$,
  '23514',
  null,
  'an unpublished publication says why'
);

-- Anna becomes passive; Bo still has access, so the ladder stays published.
update app.environment_memberships
set state = 'passive', passive_reason = 'requirements_not_met', passive_since = now()
where id = '00000000-0000-4000-8000-0000000000d1';

select is(
  (select status from app.environment_publications
   where id = '00000000-0000-4000-8000-000000000101'),
  'active',
  'the publication stays while another owner has access'
);

-- Bo leaves the ladder: nobody with access is left.
delete from app.object_owners
where object_id = '00000000-0000-4000-8000-0000000000f1'
  and user_id = '00000000-0000-4000-8000-0000000000b1';

select results_eq(
  $$
    select status, end_reason from app.environment_publications
    where id = '00000000-0000-4000-8000-000000000101'
  $$,
  $$ values ('unpublished'::text, 'access_lost'::text) $$,
  'the publication ends when the last owner with access is gone'
);

select is(
  (select version from app.objects where id = '00000000-0000-4000-8000-0000000000f1'),
  1,
  'the object itself is untouched'
);

select throws_ok(
  $$
    update app.environment_publications
    set status = 'active', ended_at = null, end_reason = null
    where id = '00000000-0000-4000-8000-000000000101'
  $$,
  '23001',
  null,
  'an unpublished publication is history'
);

-- Anna is active again and publishes anew: a new row.
update app.environment_memberships
set state = 'active', passive_reason = null, passive_since = null
where id = '00000000-0000-4000-8000-0000000000d1';

select lives_ok(
  $$
    insert into app.environment_publications (
      id, object_id, environment_id, published_by_user_id, status
    )
    values ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000f1',
      '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'pending')
  $$,
  'publishing again after it ended is a new publication'
);

select is(
  (select count(*)::int from app.environment_publications
   where object_id = '00000000-0000-4000-8000-0000000000f1'),
  2,
  'the earlier period stays as history'
);

-- A rejection is a standing local decision, even when access is lost.
update app.environment_publications
set status = 'rejected', status_changed_at = now()
where id = '00000000-0000-4000-8000-000000000102';

update app.environment_memberships
set state = 'ended', end_reason = 'left', ended_at = now(), transition_deadline = null
where id = '00000000-0000-4000-8000-0000000000d1';

select is(
  (select status from app.environment_publications
   where id = '00000000-0000-4000-8000-000000000102'),
  'rejected',
  'a rejection stands when access is lost'
);

select throws_ok(
  $$
    update app.environment_publications
    set status = 'active', status_changed_at = now()
    where id = '00000000-0000-4000-8000-000000000102'
  $$,
  '23001',
  null,
  'a rejected publication cannot become active without access'
);

-- Cia joins; the environment winds down: nothing new is published there.
insert into app.environment_memberships (
  environment_id, user_id, state, origin, activated_at, activation_revision
)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1',
  'active', 'self_service', now(), 0);
update app.environments set state = 'winding_down'
where id = '00000000-0000-4000-8000-0000000000e1';

select throws_ok(
  $$
    insert into app.environment_publications (
      object_id, environment_id, published_by_user_id, status
    )
    values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000c1', 'active')
  $$,
  '23001',
  null,
  'a winding-down environment takes no new publications'
);

update app.environments set state = 'active'
where id = '00000000-0000-4000-8000-0000000000e1';

select lives_ok(
  $$
    insert into app.environment_publications (
      object_id, environment_id, published_by_user_id, status
    )
    values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000c1', 'active')
  $$,
  'the same rules let Cia publish once she has access'
);

select is(
  (select count(*)::int from app.environment_publications
   where object_id = '00000000-0000-4000-8000-0000000000f1' and status = 'rejected'),
  1,
  'one object''s publications do not affect another''s'
);

select * from finish();
rollback;
