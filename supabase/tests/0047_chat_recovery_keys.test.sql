begin;

select plan(8);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

insert into app.chat_account_keys (id, user_id, public_key) values (
  '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1',
  decode(repeat('01', 32), 'hex')
);

insert into app.chat_archives (id, user_id, purpose, part_count, expires_at)
values (
  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
  'backup', 1, now() + interval '1 hour'
);

-- ADR-0010 §8: the server keeps the backup only as ciphertext, under an id
-- derived from the key.
select throws_ok(
  $$
    insert into app.chat_recovery_keys (user_id, account_key_id, key_id, backup)
    values (
      '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
      decode(repeat('00', 15), 'hex'), decode(repeat('00', 64), 'hex')
    )
  $$,
  '23514',
  null,
  'the key id is 128 bits'
);

select throws_ok(
  $$
    insert into app.chat_recovery_keys (user_id, account_key_id, key_id, backup)
    values (
      '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
      decode(repeat('00', 16), 'hex'), decode(repeat('00', 28), 'hex')
    )
  $$,
  '23514',
  null,
  'a backup is at least a nonce and a tag long'
);

select throws_ok(
  $$
    insert into app.chat_recovery_keys (user_id, account_key_id, key_id, backup)
    values (
      '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
      decode(repeat('00', 16), 'hex'), decode(repeat('00', 131073), 'hex')
    )
  $$,
  '23514',
  null,
  'a backup holds keys and pinned contact keys, not a history'
);

select lives_ok(
  $$
    insert into app.chat_recovery_keys
      (user_id, account_key_id, key_id, backup, archive_id)
    values (
      '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
      decode(repeat('00', 16), 'hex'), decode(repeat('00', 64), 'hex'),
      '00000000-0000-4000-8000-0000000000b1'
    )
  $$,
  'a backup points to its history archive'
);

select throws_ok(
  $$
    insert into app.chat_recovery_keys (user_id, account_key_id, key_id, backup)
    values (
      '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1',
      decode(repeat('02', 16), 'hex'), decode(repeat('00', 64), 'hex')
    )
  $$,
  '23505',
  null,
  'an account has one recovery key'
);

delete from app.chat_archives where id = '00000000-0000-4000-8000-0000000000b1';

select is(
  (select archive_id from app.chat_recovery_keys
   where user_id = '00000000-0000-4000-8000-0000000000a1'),
  null::uuid,
  'the backup outlives its archive, without history'
);

-- PS-COM-019: «Ikke nå» and the one reminder, one row per account.
select lives_ok(
  $$
    insert into app.chat_recovery_prompts (user_id, declined_at)
    values ('00000000-0000-4000-8000-0000000000a1', now())
  $$,
  'the answer to the offer is kept'
);

select throws_ok(
  $$
    insert into app.chat_recovery_prompts (user_id, reminded_at)
    values ('00000000-0000-4000-8000-0000000000a1', now())
  $$,
  '23505',
  null,
  'an account is asked once'
);

select * from finish();
rollback;
