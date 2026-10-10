begin;

select plan(5);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

insert into app.chat_account_keys (id, user_id, public_key) values (
  '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1',
  decode(repeat('01', 32), 'hex')
);

insert into app.chat_devices (
  id, user_id, account_key_id, session_id, device_key, certificate_signature
) values (
  '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000c1', 'old-session',
  decode(repeat('02', 32), 'hex'), decode(repeat('03', 64), 'hex')
);

-- WP-12 / ADR-0010 §5: after a re-authentication the live device moves to
-- the browser's new session.
select lives_ok(
  $$
    update app.chat_devices set session_id = 'new-session'
    where id = '00000000-0000-4000-8000-0000000000d1'
  $$,
  'a live device moves to a new session'
);

select throws_ok(
  $$
    update app.chat_devices
    set session_id = 'other-session', device_key = decode(repeat('04', 32), 'hex')
    where id = '00000000-0000-4000-8000-0000000000d1'
  $$,
  '23001',
  null,
  'nothing else about the device changes with it'
);

select lives_ok(
  $$
    update app.chat_devices set revoked_at = now()
    where id = '00000000-0000-4000-8000-0000000000d1'
  $$,
  'the device is still revoked once'
);

select throws_ok(
  $$
    update app.chat_devices set session_id = 'later-session'
    where id = '00000000-0000-4000-8000-0000000000d1'
  $$,
  '23001',
  null,
  'a revoked device never moves'
);

select throws_ok(
  $$
    update app.chat_devices set revoked_at = null
    where id = '00000000-0000-4000-8000-0000000000d1'
  $$,
  '23001',
  null,
  'nor comes back'
);

select * from finish();
rollback;
