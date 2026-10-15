begin;

select plan(9);

-- PS-USR-013–015: invitations by e-mail address, hidden requests and
-- friend codes keep their shape whatever writes them.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'active', now());

insert into app.friendships (id, requester_id, addressee_id, hidden_from_requester) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000a2', true);

select lives_ok(
  $$
    update app.friendships set hidden_from_requester = false
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  'a hidden request can be shown to its sender'
);

select throws_ok(
  $$
    update app.friendships set hidden_from_requester = true
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  '23001',
  null,
  'a shown request is never hidden again'
);

insert into app.friend_invitations (id, inviter_id, address, befriend, expires_at) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
    'ny@example.test', true, now() + interval '14 days');

select throws_ok(
  $$
    insert into app.friend_invitations (inviter_id, address, befriend, expires_at)
    values ('00000000-0000-4000-8000-0000000000a1', 'ny@example.test', false,
      now() + interval '14 days')
  $$,
  '23505',
  null,
  'one open invitation per sender and address'
);

select throws_ok(
  $$
    insert into app.friend_invitations (inviter_id, address, befriend, expires_at)
    values ('00000000-0000-4000-8000-0000000000a2', 'Stor@example.test', false,
      now() + interval '14 days')
  $$,
  '23514',
  null,
  'addresses are stored in lower case'
);

select throws_ok(
  $$
    update app.friend_invitations set address = 'annen@example.test'
    where id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  '23001',
  null,
  'what an invitation was sent to never changes'
);

update app.friend_invitations set ended_at = now(), end_reason = 'withdrawn'
where id = '00000000-0000-4000-8000-0000000000b1';

select throws_ok(
  $$
    update app.friend_invitations set end_reason = 'expired'
    where id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  '23001',
  null,
  'an invitation ends only once'
);

select lives_ok(
  $$
    insert into app.friend_invitations (inviter_id, address, befriend, expires_at)
    values ('00000000-0000-4000-8000-0000000000a1', 'ny@example.test', false,
      now() + interval '14 days')
  $$,
  'a new invitation can follow one that ended'
);

select throws_ok(
  $$
    insert into app.friend_codes (user_id, code_hash, expires_at)
    values ('00000000-0000-4000-8000-0000000000a1', '\x00', now() + interval '5 minutes')
  $$,
  '23514',
  null,
  'only a code''s hash is kept'
);

insert into app.users (id, status, status_reason, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a3', 'deactivated', 'user_request', now());

select throws_ok(
  $$
    insert into app.friend_codes (user_id, code_hash, expires_at)
    values ('00000000-0000-4000-8000-0000000000a3', sha256('kode'),
      now() + interval '5 minutes')
  $$,
  '23001',
  null,
  'an account that takes no new activity shows no friend code'
);

select * from finish();
rollback;
