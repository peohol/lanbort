begin;

select plan(10);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

insert into app.chat_archives (id, user_id, purpose, link_request_id, part_count, expires_at)
values (
  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
  'link', '00000000-0000-4000-8000-0000000000c1', 2, now() + interval '1 hour'
);

-- ADR-0010 §5: a history archive is ciphertext in at most 16 parts.
select throws_ok(
  $$
    insert into app.chat_archives (user_id, purpose, link_request_id, part_count, expires_at)
    values ('00000000-0000-4000-8000-0000000000a1', 'link', gen_random_uuid(), 17, now() + interval '1 hour')
  $$,
  '23514',
  null,
  'an archive has at most 16 parts'
);

select throws_ok(
  $$
    insert into app.chat_archives (user_id, purpose, part_count, expires_at)
    values ('00000000-0000-4000-8000-0000000000a1', 'link', 1, now() + interval '1 hour')
  $$,
  '23514',
  null,
  'a link''s archive names the link request it is for'
);

select throws_ok(
  $$
    insert into app.chat_archives (user_id, purpose, part_count, expires_at)
    values ('00000000-0000-4000-8000-0000000000a1', 'other', 1, now() + interval '1 hour')
  $$,
  '23514',
  null,
  'an archive is only for a linked device or the recovery key''s backup'
);

select throws_ok(
  $$
    insert into app.chat_archive_parts (archive_id, part, data)
    values ('00000000-0000-4000-8000-0000000000b1', 0, '\x00'::bytea)
  $$,
  '23514',
  null,
  'a part is at least an AES-GCM tag long'
);

select lives_ok(
  $$
    insert into app.chat_archive_parts (archive_id, part, data)
    values ('00000000-0000-4000-8000-0000000000b1', 0, decode(repeat('00', 32), 'hex'))
  $$,
  'a part is stored'
);

select throws_ok(
  $$
    update app.chat_archive_parts set data = decode(repeat('01', 32), 'hex')
    where archive_id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  '23001',
  null,
  'a stored part never changes'
);

select throws_ok(
  $$
    update app.chat_archives set part_count = 1
    where id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  '23001',
  null,
  'an archive does not change before it is complete, other than by completing'
);

select lives_ok(
  $$
    update app.chat_archives set completed_at = now()
    where id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  'an archive is completed'
);

select throws_ok(
  $$
    update app.chat_archives set completed_at = now() + interval '1 minute'
    where id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  '23001',
  null,
  'it is completed once'
);

delete from app.chat_archives where id = '00000000-0000-4000-8000-0000000000b1';

select is(
  (select count(*) from app.chat_archive_parts
   where archive_id = '00000000-0000-4000-8000-0000000000b1'),
  0::bigint,
  'its parts go with it'
);

select * from finish();
rollback;
