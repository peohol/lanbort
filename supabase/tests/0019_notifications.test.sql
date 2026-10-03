begin;

select plan(15);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array['app.notifications', 'app.notification_preferences'])
    as table_name;

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now());

insert into app.notifications (
  id, recipient_id, kind, level, target_type, target_id, source_key, occurred_at
) values (
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000a1',
  'loan.cancelled', 'required', 'loan', '00000000-0000-4000-8000-000000000301',
  'event:00000000-0000-4000-8000-000000000401/loan.cancelled/00000000-0000-4000-8000-000000000301',
  now()
);

-- A source makes one notification per recipient: a redelivered event
-- cannot add a second.
select throws_ok(
  $$insert into app.notifications (
      recipient_id, kind, level, target_type, target_id, source_key, occurred_at
    ) values (
      '00000000-0000-4000-8000-0000000000a1', 'loan.cancelled', 'required', 'loan',
      '00000000-0000-4000-8000-000000000301',
      'event:00000000-0000-4000-8000-000000000401/loan.cancelled/00000000-0000-4000-8000-000000000301',
      now()
    )$$,
  '23505',
  null,
  'the same source makes the same notification once'
);

select lives_ok(
  $$insert into app.notifications (
      recipient_id, kind, level, target_type, target_id, source_key, occurred_at
    ) values (
      '00000000-0000-4000-8000-0000000000b1', 'loan.cancelled', 'required', 'loan',
      '00000000-0000-4000-8000-000000000301',
      'event:00000000-0000-4000-8000-000000000401/loan.cancelled/00000000-0000-4000-8000-000000000301',
      now()
    )$$,
  'another recipient of the same source gets their own'
);

select throws_ok(
  $$insert into app.notifications (
      recipient_id, kind, level, target_type, target_id, source_key, occurred_at
    ) values (
      '00000000-0000-4000-8000-0000000000a1', 'loan.cancelled', 'urgent', 'loan',
      '00000000-0000-4000-8000-000000000301', 'event:x/loan.cancelled/y', now()
    )$$,
  '23514',
  null,
  'a level outside the three is refused'
);

select throws_ok(
  $$insert into app.notifications (
      recipient_id, kind, level, detail, target_type, target_id, source_key, occurred_at
    ) values (
      '00000000-0000-4000-8000-0000000000a1', 'loan.cancelled', 'required',
      'Anna sier nei', 'loan', '00000000-0000-4000-8000-000000000301',
      'event:z/loan.cancelled/y', now()
    )$$,
  '23514',
  null,
  'the detail is a code, never free text'
);

-- What a notification says never changes; it can only be read, once.
select throws_ok(
  $$update app.notifications set kind = 'loan.approved'
    where id = '00000000-0000-4000-8000-000000000201'$$,
  '23001',
  null,
  'the kind cannot change'
);

select throws_ok(
  $$update app.notifications set recipient_id = '00000000-0000-4000-8000-0000000000b1'
    where id = '00000000-0000-4000-8000-000000000201'$$,
  '23001',
  null,
  'nobody else can be made the recipient'
);

select lives_ok(
  $$update app.notifications set read_at = now()
    where id = '00000000-0000-4000-8000-000000000201'$$,
  'the recipient can read it'
);

select throws_ok(
  $$update app.notifications set read_at = null
    where id = '00000000-0000-4000-8000-000000000201'$$,
  '23001',
  null,
  'read stays read'
);

-- PS-COM-003: required and action notifications are always in the app.
select throws_ok(
  $$insert into app.notification_preferences (user_id, level, channel, enabled)
    values ('00000000-0000-4000-8000-0000000000a1', 'required', 'in_app', false)$$,
  '23514',
  null,
  'required notifications cannot be turned off in the app'
);

select throws_ok(
  $$insert into app.notification_preferences (user_id, level, channel, enabled)
    values ('00000000-0000-4000-8000-0000000000a1', 'action', 'in_app', false)$$,
  '23514',
  null,
  'action notifications cannot be turned off in the app'
);

select lives_ok(
  $$insert into app.notification_preferences (user_id, level, channel, enabled)
    values
      ('00000000-0000-4000-8000-0000000000a1', 'information', 'in_app', false),
      ('00000000-0000-4000-8000-0000000000a1', 'action', 'email', true)$$,
  'information can be turned off, and e-mail chosen for action notifications'
);

select * from finish();
rollback;
