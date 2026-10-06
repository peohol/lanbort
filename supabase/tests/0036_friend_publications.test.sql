begin;

select plan(14);

select ok(
  not has_table_privilege(role_name, 'app.object_friend_publications', 'SELECT'),
  format('%s cannot read app.object_friend_publications', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

-- Anna (a1) owns the ladder (f1) and the archived drill (f2). Bo (b1) is
-- her friend; Cia (c1) is not.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now());

insert into app.objects (id, title, category_id, description, created_by_user_id, status)
values
  ('00000000-0000-4000-8000-0000000000f1', 'Stige', 'annet', 'Lang stige',
    '00000000-0000-4000-8000-0000000000a1', 'active'),
  ('00000000-0000-4000-8000-0000000000f2', 'Drill', 'annet', 'Slagdrill',
    '00000000-0000-4000-8000-0000000000a1', 'active');
insert into app.object_revisions (
  object_id, version, change, actor_user_id, title, category_id, description,
  loan_terms, status, availability, image_ids
)
values
  ('00000000-0000-4000-8000-0000000000f1', 1, 'created',
    '00000000-0000-4000-8000-0000000000a1', 'Stige', 'annet', 'Lang stige',
    null, 'active', '[]', '{}'),
  ('00000000-0000-4000-8000-0000000000f2', 1, 'created',
    '00000000-0000-4000-8000-0000000000a1', 'Drill', 'annet', 'Slagdrill',
    null, 'active', '[]', '{}');
insert into app.object_owners (object_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a1');
update app.objects set status = 'archived', archived_at = now()
where id = '00000000-0000-4000-8000-0000000000f2';

insert into app.friendships (requester_id, addressee_id, status, accepted_at)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
  'active', now());

select throws_ok(
  $$
    insert into app.object_friend_publications (object_id, published_by_user_id)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1')
  $$,
  '23001',
  null,
  'only an owner makes an object visible to friends (PS-OBJ-020)'
);

select throws_ok(
  $$
    insert into app.object_friend_publications (object_id, published_by_user_id)
    values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a1')
  $$,
  '23001',
  null,
  'an archived object is not made visible to friends (PS-OBJ-016)'
);

select ok(
  not exists (
    select 1 from app.search_object_sources
    where object_id = '00000000-0000-4000-8000-0000000000f1'
  ),
  'an object that is neither published nor visible to friends is not indexed'
);

insert into app.object_friend_publications (id, object_id, published_by_user_id)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000a1');

select ok(
  app.object_visible_to_friends('00000000-0000-4000-8000-0000000000f1'),
  'an owner makes the ladder visible to friends'
);

select ok(
  exists (
    select 1 from app.search_object_sources
    where object_id = '00000000-0000-4000-8000-0000000000f1'
  ),
  'an object visible to friends is indexed for Finn'
);

select throws_ok(
  $$
    insert into app.object_friend_publications (object_id, published_by_user_id)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1')
  $$,
  '23505',
  null,
  'an object has at most one current friend publication'
);

select throws_ok(
  $$
    update app.object_friend_publications set published_at = now() - interval '1 day'
    where id = '00000000-0000-4000-8000-000000000101'
  $$,
  '23001',
  null,
  'a friend publication only changes when it is withdrawn'
);

-- Bo asks directly.
select lives_ok(
  $$
    insert into app.loan_requests (
      id, object_id, borrower_user_id, origin, desired_days, message, terms_version
    )
    values ('00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1',
      'direct', 3, 'Kan jeg låne den?', 1)
  $$,
  'a friend asks directly for an object visible to friends'
);

-- Anna takes it back from friends.
update app.object_friend_publications
set withdrawn_at = clock_timestamp(), withdrawn_by_user_id = '00000000-0000-4000-8000-0000000000a1'
where id = '00000000-0000-4000-8000-000000000101';

select results_eq(
  $$ select status, end_reason from app.loan_requests
     where id = '00000000-0000-4000-8000-000000000201' $$,
  $$ values ('ended'::text, 'publication_ended'::text) $$,
  'taking it back ends open direct requests neutrally (PS-OBJ-020)'
);

select ok(
  not app.object_visible_to_friends('00000000-0000-4000-8000-0000000000f1'),
  'a withdrawn friend publication is history'
);

select throws_ok(
  $$
    update app.object_friend_publications
    set withdrawn_at = now() + interval '1 day'
    where id = '00000000-0000-4000-8000-000000000101'
  $$,
  '23001',
  null,
  'a withdrawn friend publication never changes again'
);

select throws_ok(
  $$
    insert into app.loan_requests (
      object_id, borrower_user_id, origin, desired_days, message, terms_version
    )
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1',
      'direct', 3, 'Kan jeg låne den?', 1)
  $$,
  '23001',
  null,
  'no new direct request once it is no longer visible to friends'
);

select * from finish();
rollback;
