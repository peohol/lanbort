begin;

select plan(3);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

select has_column('app', 'chat_archives', 'device_id', 'an archive names its device');

select fk_ok(
  'app', 'chat_archives', 'device_id',
  'app', 'chat_devices', 'id',
  'the device is one of the chat devices'
);

select throws_ok(
  $$
    insert into app.chat_archives
      (user_id, purpose, link_request_id, part_count, expires_at, device_id)
    values
      ('00000000-0000-4000-8000-0000000000a1', 'link', gen_random_uuid(), 1,
       now() + interval '1 hour', gen_random_uuid())
  $$,
  '23503',
  null,
  'only a known device can start an archive'
);

select * from finish();

rollback;
