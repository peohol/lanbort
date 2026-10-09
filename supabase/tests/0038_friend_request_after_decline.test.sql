begin;

select plan(11);

-- PS-USR-012: after a declined request, its sender waits for the recipient.
select ok(
  not has_function_privilege(role_name, 'app.friend_request_held_back(uuid, uuid)', 'EXECUTE'),
  format('%s cannot ask whether a request is held back', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now());

-- Every row of the test shares one time: the position alone orders them.
insert into app.friendships (requester_id, addressee_id, requested_at, status, ended_at, ended_by_user_id, end_reason)
values (
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1',
  '2026-10-09 12:00+00', 'ended', '2026-10-09 12:00+00',
  '00000000-0000-4000-8000-0000000000b1', 'declined'
);

select throws_ok(
  $$
    insert into app.friendships (requester_id, addressee_id, requested_at)
    values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', '2026-10-09 12:00+00')
  $$,
  '23001',
  'this friend request cannot be sent now',
  'the sender of a declined request cannot ask again'
);

select ok(
  not app.friend_request_held_back(
    '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1'
  ),
  'the recipient is not held back'
);

-- A block placed and lifted changes nothing.
insert into app.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1');
update app.user_blocks set lifted_at = now()
where blocker_id = '00000000-0000-4000-8000-0000000000b1';

select ok(
  app.friend_request_held_back(
    '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1'
  ),
  'a lifted block does not lift the hold'
);

-- The recipient's request, even withdrawn, lifts it, also when a server's
-- clock gave it an earlier time.
insert into app.friendships (requester_id, addressee_id, requested_at, status, ended_at, ended_by_user_id, end_reason)
values (
  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
  '2026-10-09 11:00+00', 'ended', '2026-10-09 11:00+00',
  '00000000-0000-4000-8000-0000000000b1', 'withdrawn'
);

select lives_ok(
  $$
    insert into app.friendships (requester_id, addressee_id, requested_at)
    values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', '2026-10-09 12:00+00')
  $$,
  'the recipient''s later request lifts the hold, even once withdrawn and whatever its time'
);

-- Withdrawn and removed relations hold nothing back.
insert into app.friendships (requester_id, addressee_id, status, ended_at, ended_by_user_id, end_reason)
values (
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
  'ended', now(), '00000000-0000-4000-8000-0000000000a1', 'withdrawn'
);

select ok(
  not app.friend_request_held_back(
    '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1'
  ),
  'a withdrawn request holds nothing back'
);

insert into app.friendships (requester_id, addressee_id, status, accepted_at, ended_at, ended_by_user_id, end_reason)
values (
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
  'ended', now(), now(), '00000000-0000-4000-8000-0000000000c1', 'removed'
);

select ok(
  not app.friend_request_held_back(
    '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1'
  ),
  'a removed friendship holds nothing back'
);

-- A later decline holds the sender back, also when a server's clock gave
-- the request an earlier time than the history before it.
insert into app.friendships (requester_id, addressee_id, requested_at, status, ended_at, ended_by_user_id, end_reason)
values (
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
  '2000-01-01 12:00+00', 'ended', '2000-01-01 12:00+00',
  '00000000-0000-4000-8000-0000000000c1', 'declined'
);

select ok(
  app.friend_request_held_back(
    '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1'
  ),
  'the latest decline holds the sender back, whatever its time'
);

select ok(
  not app.friend_request_held_back(
    '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1'
  ),
  'a pair without history holds nothing back'
);

select ok(
  not app.friend_request_held_back(
    '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1'
  ),
  'an open request holds nothing back'
);

select * from finish();

rollback;
