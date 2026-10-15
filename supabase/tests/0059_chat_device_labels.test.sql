begin;

select plan(13);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

insert into app.chat_account_keys (id, user_id, public_key) values
  ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000a1',
    decode(repeat('a1', 32), 'hex'));

insert into app.chat_devices
  (id, user_id, account_key_id, session_id, device_key, certificate_signature)
values
  ('00000000-0000-4000-8000-0000000d0a11', '00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-00000000c0a1', 'session-a1-phone',
    decode(repeat('11', 32), 'hex'), decode(repeat('11', 64), 'hex')),
  ('00000000-0000-4000-8000-0000000d0a12', '00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-00000000c0a1', 'session-a1-laptop',
    decode(repeat('12', 32), 'hex'), decode(repeat('12', 64), 'hex'));

-- A label is display only: a name, a kind and what the device detected.
select lives_ok(
  $$
    insert into app.chat_device_labels (device_id, name, kind, system, browser)
    values ('00000000-0000-4000-8000-0000000d0a11', 'Jobbmobilen', 'mobile',
      'android', 'chrome')
  $$,
  'a live device gets a label'
);

select lives_ok(
  $$
    insert into app.chat_device_labels (device_id) values
      ('00000000-0000-4000-8000-0000000d0a12')
  $$,
  'nothing need be known'
);

select throws_ok(
  $$
    insert into app.chat_device_labels (device_id, kind)
    values (gen_random_uuid(), 'mobile')
  $$,
  '23001',
  null,
  'only a known device has a label'
);

select throws_ok(
  $$
    update app.chat_device_labels set kind = 'watch'
    where device_id = '00000000-0000-4000-8000-0000000d0a12'
  $$,
  '23514',
  null,
  'a device is a mobile, a tablet or a computer'
);

select throws_ok(
  $$
    update app.chat_device_labels set browser = 'Mozilla/5.0 (X11)'
    where device_id = '00000000-0000-4000-8000-0000000d0a12'
  $$,
  '23514',
  null,
  'the system and browser are identifiers, never what a browser sent'
);

select throws_ok(
  $$
    update app.chat_device_labels set name = E'Mobil\nny'
    where device_id = '00000000-0000-4000-8000-0000000d0a12'
  $$,
  '23514',
  null,
  'a name is one line'
);

select throws_ok(
  $$
    update app.chat_device_labels set name = repeat('x', 41)
    where device_id = '00000000-0000-4000-8000-0000000d0a12'
  $$,
  '23514',
  null,
  'a name is short'
);

select throws_ok(
  $$
    update app.chat_device_labels set name = E'iPhone\u200b'
    where device_id = '00000000-0000-4000-8000-0000000d0a12'
  $$,
  '23514',
  null,
  'a name has no invisible character'
);

select throws_ok(
  $$
    update app.chat_device_labels set name = E'PC \u202eiraf'
    where device_id = '00000000-0000-4000-8000-0000000d0a12'
  $$,
  '23514',
  null,
  'a name does not turn its direction'
);

-- A revoked device's label goes, and it gets no new one.
update app.chat_devices set revoked_at = now()
where id = '00000000-0000-4000-8000-0000000d0a12';

select throws_ok(
  $$
    update app.chat_device_labels set name = 'Gammel PC'
    where device_id = '00000000-0000-4000-8000-0000000d0a12'
  $$,
  '23001',
  null,
  'a revoked device is not renamed'
);

delete from app.chat_devices where id = '00000000-0000-4000-8000-0000000d0a11';

select is(
  (select count(*)::int from app.chat_device_labels
   where device_id = '00000000-0000-4000-8000-0000000d0a11'),
  0,
  'a deleted device takes its label with it'
);

-- What a waiting device says it is, from the same values.
select has_column('app', 'chat_link_requests', 'kind',
  'a link request says what kind of device asks');

select throws_ok(
  $$
    insert into app.chat_link_requests
      (user_id, session_id, device_id, device_key, link_key, created_at,
       expires_at, kind)
    values
      ('00000000-0000-4000-8000-0000000000a1', 'session-a1-tablet',
       gen_random_uuid(), decode(repeat('13', 32), 'hex'),
       decode(repeat('14', 32), 'hex'), now(), now() + interval '10 minutes',
       'Din gamle iPhone')
  $$,
  '23514',
  null,
  'a waiting device cannot put its own words in the kind'
);

select * from finish();

rollback;
