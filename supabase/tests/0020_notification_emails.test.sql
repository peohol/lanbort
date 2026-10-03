begin;

select plan(9);

select ok(
  not has_table_privilege(role_name, 'app.notification_deliveries', 'SELECT'),
  format('%s cannot read app.notification_deliveries', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

insert into app.notifications (
  id, recipient_id, kind, level, target_type, target_id, source_key, occurred_at
) values (
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000a1',
  'loan.cancelled', 'required', 'loan', '00000000-0000-4000-8000-000000000301',
  'event:00000000-0000-4000-8000-000000000401/loan.cancelled/00000000-0000-4000-8000-000000000301',
  now()
);

select lives_ok(
  $$insert into app.notification_deliveries (id, notification_id, channel)
    values ('00000000-0000-4000-8000-000000000501',
      '00000000-0000-4000-8000-000000000201', 'email')$$,
  'a notification can be queued for e-mail'
);

select throws_ok(
  $$insert into app.notification_deliveries (notification_id, channel)
    values ('00000000-0000-4000-8000-000000000201', 'email')$$,
  '23505',
  null,
  'a notification goes out once per channel'
);

-- Web push is not decided (OD-0004).
select throws_ok(
  $$insert into app.notification_deliveries (notification_id, channel)
    values ('00000000-0000-4000-8000-000000000201', 'web_push')$$,
  '23514',
  null,
  'e-mail is the only external channel'
);

select throws_ok(
  $$insert into app.notification_deliveries (notification_id, channel)
    values ('00000000-0000-4000-8000-000000000299', 'email')$$,
  '23503',
  null,
  'only an existing notification can go out'
);

select throws_ok(
  $$update app.notification_deliveries
    set status = 'dead', finished_at = now(), code = 'anna@example.com is invalid'
    where id = '00000000-0000-4000-8000-000000000501'$$,
  '23514',
  null,
  'the reason is a code, never text or an address'
);

select throws_ok(
  $$update app.notification_deliveries set status = 'skipped', finished_at = now()
    where id = '00000000-0000-4000-8000-000000000501'$$,
  '23514',
  null,
  'a skipped or dead delivery says why'
);

select lives_ok(
  $$update app.notification_deliveries set status = 'sent', finished_at = now()
    where id = '00000000-0000-4000-8000-000000000501'$$,
  'a sent delivery is finished'
);

select * from finish();
rollback;
