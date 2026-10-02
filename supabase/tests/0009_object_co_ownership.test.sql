begin;

select plan(26);

select has_table('app', table_name, format('app.%s exists', table_name))
from unnest(array[
  'object_revisions', 'object_co_owner_invitations', 'object_restrictions',
  'object_freezes', 'object_deletion_consents'
]) as table_name;

select ok(
  not has_table_privilege(role_name, format('app.%s', table_name), 'SELECT'),
  format('%s cannot read app.%s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array['object_revisions', 'object_co_owner_invitations']) as table_name;

-- Anna (a1), Bo (b1), Cia (c1) and Dag (d1); Anna owns the ladder.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000d1', 'active', now());

insert into app.objects (id, title, category_id, description, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000f1', 'Stige', 'annet', 'Lang stige',
  '00000000-0000-4000-8000-0000000000a1');
insert into app.object_owners (object_id, user_id)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1');

select throws_ok(
  $$ set constraints all immediate $$,
  '23000',
  null,
  'every version of an object has a revision'
);

insert into app.object_revisions (
  object_id, version, change, actor_user_id, title, category_id, description,
  status, availability, image_ids
)
values ('00000000-0000-4000-8000-0000000000f1', 1, 'created',
  '00000000-0000-4000-8000-0000000000a1', 'Stige', 'annet', 'Lang stige',
  'active', '[]', '{}');
set constraints all immediate;

select throws_ok(
  $$ update app.object_revisions set title = 'Annen stige' $$,
  '23001',
  null,
  'revisions are never rewritten'
);

select throws_ok(
  $$
    insert into app.object_revisions (
      object_id, version, change, actor_user_id, title, category_id,
      description, status, availability, image_ids
    )
    values ('00000000-0000-4000-8000-0000000000f1', 2, 'reverted',
      '00000000-0000-4000-8000-0000000000a1', 'Stige', 'annet', 'Lang stige',
      'active', '[]', '{}')
  $$,
  '23514',
  null,
  'a revert names the version it brought back'
);

-- Bo and Cia become co-owners; Dag has a pending invitation.
insert into app.object_owners (object_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1');
insert into app.object_co_owner_invitations (id, object_id, invited_user_id, invited_by_user_id)
values ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1');

select throws_ok(
  $$
    insert into app.object_co_owner_invitations (object_id, invited_user_id, invited_by_user_id)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1',
      '00000000-0000-4000-8000-0000000000b1')
  $$,
  '23505',
  null,
  'a user has at most one pending invitation per object'
);

select throws_ok(
  $$
    update app.object_co_owner_invitations set status = 'accepted', ended_at = now(),
      ended_by_user_id = '00000000-0000-4000-8000-0000000000a1'
    where id = '00000000-0000-4000-8000-00000000e001'
  $$,
  '23514',
  null,
  'only the invited user can accept'
);

select throws_ok(
  $$
    insert into app.object_deletion_consents (object_id, user_id)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1')
  $$,
  '23503',
  null,
  'only current owners can consent to deletion'
);

-- Dag blocks Cia: Dag's invitation from Anna closes, because Cia owns it.
insert into app.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1');

select is(
  (select status from app.object_co_owner_invitations
   where id = '00000000-0000-4000-8000-00000000e001'),
  'closed',
  'a block between the invited user and any owner closes the invitation'
);

select throws_ok(
  $$
    insert into app.object_co_owner_invitations (object_id, invited_user_id, invited_by_user_id)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1',
      '00000000-0000-4000-8000-0000000000a1')
  $$,
  '23001',
  null,
  'no invitation can be opened across a block with an owner'
);

select throws_ok(
  $$
    insert into app.object_owners (object_id, user_id)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1')
  $$,
  '23001',
  null,
  'nobody joins as co-owner across a block with an owner'
);

select throws_ok(
  $$
    update app.object_co_owner_invitations set status = 'pending', ended_at = null
    where id = '00000000-0000-4000-8000-00000000e001'
  $$,
  '23001',
  null,
  'an ended invitation is history'
);

-- Bo blocks Cia: they co-own the ladder, so it freezes.
insert into app.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1');

select is(
  (select count(*)::int from app.object_freezes
   where object_id = '00000000-0000-4000-8000-0000000000f1' and ended_at is null),
  1,
  'a block between two co-owners freezes the object'
);

update app.user_blocks set lifted_at = now()
where blocker_id = '00000000-0000-4000-8000-0000000000b1';

select is(
  (select count(*)::int from app.object_freezes
   where object_id = '00000000-0000-4000-8000-0000000000f1' and ended_at is null),
  1,
  'lifting the block does not end the freeze'
);

-- Cia restricts new loans and gives deletion consent.
insert into app.object_restrictions (id, object_id, set_by_user_id)
values ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000c1');
insert into app.object_deletion_consents (object_id, user_id)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1');

set constraints all deferred;
savepoint before_leaving;
delete from app.object_owners
where object_id = '00000000-0000-4000-8000-0000000000f1'
  and user_id = '00000000-0000-4000-8000-0000000000c1';

select throws_ok(
  $$ set constraints all immediate $$,
  '23000',
  null,
  'a restriction cannot outlive its owner''s co-ownership'
);
rollback to savepoint before_leaving;

set constraints all deferred;
update app.object_restrictions set lifted_at = now(), lift_reason = 'owner_left'
where id = '00000000-0000-4000-8000-00000000e002';
delete from app.object_owners
where object_id = '00000000-0000-4000-8000-0000000000f1'
  and user_id = '00000000-0000-4000-8000-0000000000c1';

select lives_ok(
  $$ set constraints all immediate $$,
  'a co-owner leaves after their restriction ended; two owners stay frozen'
);

select is(
  (select count(*)::int from app.object_deletion_consents
   where object_id = '00000000-0000-4000-8000-0000000000f1'),
  0,
  'a deletion consent leaves with its owner'
);

set constraints all deferred;
savepoint before_clarifying;
delete from app.object_owners
where object_id = '00000000-0000-4000-8000-0000000000f1'
  and user_id = '00000000-0000-4000-8000-0000000000b1';

select throws_ok(
  $$ set constraints all immediate $$,
  '23000',
  null,
  'an object with one owner is not frozen'
);
rollback to savepoint before_clarifying;

select throws_ok(
  $$
    update app.object_restrictions set lifted_at = null, lift_reason = null
    where id = '00000000-0000-4000-8000-00000000e002'
  $$,
  '23001',
  null,
  'a lifted restriction is history'
);

select * from finish();
rollback;
