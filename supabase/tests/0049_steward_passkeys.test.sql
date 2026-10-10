begin;

select plan(12);

-- ADR-0011, OD-0023: stewards' passkeys and enrollment codes are a record of
-- who could act as a steward, and when. They are stamped, never deleted.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

insert into app.steward_passkeys
  (id, user_id, credential_id, public_key, name, enrolled_with)
values (
  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
  decode(repeat('01', 32), 'hex'), decode(repeat('02', 77), 'hex'),
  'Nøkkel i skuffen', 'enrollment_code'
);

insert into app.steward_enrollment_codes
  (id, user_id, code_hash, issued_by_process, reason, expires_at)
values (
  '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1',
  decode(repeat('03', 32), 'hex'), 'ops.steward_passkeys', 'Første nøkkel',
  now() + interval '1 hour'
);

select lives_ok(
  $$
    update app.steward_passkeys
    set sign_count = 3, last_used_at = now()
    where id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  'a passkey records its use'
);

select throws_ok(
  $$
    update app.steward_passkeys set sign_count = 2
    where id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  '23001', null, 'its counter never goes back'
);

select throws_ok(
  $$
    update app.steward_passkeys set public_key = decode(repeat('09', 77), 'hex')
    where id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  '23001', null, 'its key never changes'
);

select throws_ok(
  $$
    update app.steward_passkeys set removed_at = now()
    where id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  '23514', null, 'a removal names who removed it'
);

select lives_ok(
  $$
    update app.steward_passkeys
    set removed_at = now(), removed_by_process = 'ops.steward_passkeys'
    where id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  'a passkey can be removed'
);

select throws_ok(
  $$
    update app.steward_passkeys set removed_at = null, removed_by_process = null
    where id = '00000000-0000-4000-8000-0000000000b1'
  $$,
  '23001', null, 'a removed passkey stays removed'
);

select throws_ok(
  $$ delete from app.steward_passkeys $$,
  null, null, 'passkeys are never deleted'
);

select throws_ok(
  $$
    insert into app.steward_enrollment_codes
      (user_id, code_hash, issued_by_process, reason, expires_at)
    values (
      '00000000-0000-4000-8000-0000000000a1', decode(repeat('04', 32), 'hex'),
      'ops.steward_passkeys', 'Ny kode', now() + interval '1 hour'
    )
  $$,
  '23505', null, 'a steward has at most one open code'
);

select lives_ok(
  $$
    update app.steward_enrollment_codes set used_at = now()
    where id = '00000000-0000-4000-8000-0000000000c1'
  $$,
  'a code is used'
);

select throws_ok(
  $$
    update app.steward_enrollment_codes set used_at = null
    where id = '00000000-0000-4000-8000-0000000000c1'
  $$,
  '23001', null, 'once'
);

select throws_ok(
  $$ delete from app.steward_enrollment_codes $$,
  null, null, 'codes are never deleted'
);

select throws_ok(
  $$
    insert into app.steward_passkey_challenges
      (user_id, session_id, purpose, challenge, enrollment_code_id, expires_at)
    values (
      '00000000-0000-4000-8000-0000000000a1', 'session', 'confirmation',
      decode(repeat('05', 32), 'hex'), '00000000-0000-4000-8000-0000000000c1',
      now() + interval '5 minutes'
    )
  $$,
  '23514', null, 'an enrollment code only ever starts a registration'
);

select * from finish();

rollback;
