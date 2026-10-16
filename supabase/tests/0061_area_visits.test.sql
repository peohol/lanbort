begin;

select plan(5);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

-- One visit per user and area (UX-IA-022), as the newest notification then.
select lives_ok(
  $$
    insert into app.area_visits (user_id, area, seen_through)
    values ('00000000-0000-4000-8000-0000000000a1', 'conversations', 12)
  $$,
  'a visit to an area is kept'
);

select throws_ok(
  $$
    insert into app.area_visits (user_id, area, seen_through)
    values ('00000000-0000-4000-8000-0000000000a1', 'conversations', 13)
  $$,
  '23505',
  null,
  'an area has one visit per user, the latest'
);

select throws_ok(
  $$
    insert into app.area_visits (user_id, area, seen_through)
    values ('00000000-0000-4000-8000-0000000000a1', 'Samtaler!', 0)
  $$,
  '23514',
  null,
  'an area is a short identifier, never free text'
);

select throws_ok(
  $$
    insert into app.area_visits (user_id, area, seen_through)
    values ('00000000-0000-4000-8000-0000000000a1', 'home', -1)
  $$,
  '23514',
  null,
  'a visit is never before the first notification'
);

select throws_ok(
  $$
    insert into app.area_visits (user_id, area, seen_through)
    values (gen_random_uuid(), 'home', 0)
  $$,
  '23503',
  null,
  'only an account has visits'
);

select * from finish();

rollback;
