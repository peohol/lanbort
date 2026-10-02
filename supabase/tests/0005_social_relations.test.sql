begin;

select plan(16);

select has_table('app', table_name, format('app.%s exists', table_name))
from unnest(array['friendships', 'user_blocks']) as table_name;

-- Social relations are only reachable through the backend.
select ok(
  not has_table_privilege(role_name, 'app.' || table_name, 'SELECT'),
  format('%s cannot read app.%s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array['friendships', 'user_blocks']) as table_name;

insert into app.users (id) values
  ('00000000-0000-4000-8000-0000000000d1'),
  ('00000000-0000-4000-8000-0000000000d2'),
  ('00000000-0000-4000-8000-0000000000d3');

insert into app.friendships (id, requester_id, addressee_id)
values (
  '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000d1',
  '00000000-0000-4000-8000-0000000000d2'
);

select throws_ok(
  $$
    insert into app.friendships (requester_id, addressee_id)
    values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d1')
  $$,
  '23505',
  null,
  'crossing requests cannot open a second relation for the same pair'
);

select throws_ok(
  $$
    insert into app.friendships (requester_id, addressee_id)
    values ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d3')
  $$,
  '23514',
  null,
  'nobody can befriend themselves'
);

select throws_ok(
  $$
    update app.friendships
    set status = 'ended', ended_at = now(), end_reason = 'removed',
      ended_by_user_id = '00000000-0000-4000-8000-0000000000d1'
    where id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  '23514',
  null,
  'a request that was never accepted cannot be removed as a friendship'
);

select throws_ok(
  $$
    update app.friendships
    set status = 'ended', ended_at = now(), end_reason = 'declined',
      ended_by_user_id = '00000000-0000-4000-8000-0000000000d3'
    where id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  '23514',
  null,
  'only one of the two users can end their relation'
);

select lives_ok(
  $$
    update app.friendships
    set status = 'active', accepted_at = now()
    where id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  'a pending request can be accepted'
);

select throws_ok(
  $$
    update app.friendships
    set addressee_id = '00000000-0000-4000-8000-0000000000d3'
    where id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  '23001',
  null,
  'who a friendship is between cannot be changed'
);

select throws_ok(
  $$
    update app.friendships set status = 'pending', accepted_at = null
    where id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  '23001',
  null,
  'a friendship cannot go back to a request'
);

insert into app.user_blocks (id, blocker_id, blocked_id)
values (
  '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000d1',
  '00000000-0000-4000-8000-0000000000d3'
);

select throws_ok(
  $$
    insert into app.friendships (requester_id, addressee_id)
    values ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d1')
  $$,
  '23001',
  null,
  'no request can be opened while either user blocks the other'
);

select throws_ok(
  $$
    insert into app.user_blocks (blocker_id, blocked_id)
    values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d3')
  $$,
  '23505',
  null,
  'a user blocks another at most once at a time'
);

update app.user_blocks set lifted_at = now()
where id = '00000000-0000-4000-8000-0000000000f1';

select throws_ok(
  $$
    update app.user_blocks set lifted_at = null
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  '23001',
  null,
  'a lifted block stays lifted history'
);

select * from finish();

rollback;
