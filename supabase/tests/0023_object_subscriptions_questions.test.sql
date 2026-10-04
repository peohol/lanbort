begin;

select plan(17);

select ok(
  not has_table_privilege(role_name, table_name, 'SELECT'),
  format('%s cannot read %s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array[
    'app.object_subscriptions', 'app.object_questions', 'app.object_question_posts'
  ]) as table_name;

-- Anna (a1) owns the ladder (f1) and publishes it in the environment (e1),
-- where Bo (b1) is a member too.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now());

insert into app.objects (id, title, category_id, description, created_by_user_id) values
  ('00000000-0000-4000-8000-0000000000f1', 'Stige', 'annet', 'Lang stige',
    '00000000-0000-4000-8000-0000000000a1');
insert into app.object_owners (object_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1');

insert into app.environments (id, type, name, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000e1', 'open', 'Borettslaget',
  '00000000-0000-4000-8000-0000000000a1');
insert into app.environment_memberships (
  id, environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000b1', 'active', 'self_service', now(), 0);

insert into app.environment_publications (
  id, object_id, environment_id, published_by_user_id, status
) values (
  '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'active'
);

-- Subscriptions

insert into app.object_subscriptions (id, user_id, object_id, available) values (
  '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000f1', true
);

select throws_ok(
  $$insert into app.object_subscriptions (user_id, object_id, available) values (
      '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000f1', false
    )$$,
  '23505',
  null,
  'a user subscribes to an object once'
);

select lives_ok(
  $$update app.object_subscriptions
    set available = false, available_checked_at = now()
    where id = '00000000-0000-4000-8000-000000000301'$$,
  'the last look at availability is updated'
);

select throws_ok(
  $$update app.object_subscriptions
    set user_id = '00000000-0000-4000-8000-0000000000a1'
    where id = '00000000-0000-4000-8000-000000000301'$$,
  '23001',
  null,
  'who subscribed to what never changes'
);

-- Questions

select lives_ok(
  $$insert into app.object_questions (
      id, publication_id, object_id, environment_id, asked_by_user_id
    ) values (
      '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000b1'
    )$$,
  'a question is asked through an active publication'
);

select throws_ok(
  $$insert into app.object_questions (
      publication_id, object_id, environment_id, asked_by_user_id
    ) values (
      '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1',
      gen_random_uuid(), '00000000-0000-4000-8000-0000000000b1'
    )$$,
  '23001',
  null,
  'a question belongs to the environment of its publication'
);

select lives_ok(
  $$insert into app.object_question_posts (question_id, author_user_id, by_owner, body)
    values ('00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-0000000000b1', false, 'Er den lang nok til taket?')$$,
  'the asker posts the question'
);

select throws_ok(
  $$insert into app.object_question_posts (question_id, author_user_id, by_owner, body)
    values ('00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-0000000000b1', true, 'Jeg eier den')$$,
  '23514',
  null,
  'a post cannot claim to be from an owner'
);

select throws_ok(
  $$insert into app.object_question_posts (question_id, author_user_id, by_owner, body)
    values ('00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-0000000000a1', true, '  Ja  ')$$,
  '23514',
  null,
  'a post is trimmed text'
);

select throws_ok(
  $$update app.object_question_posts set body = 'Endret'
    where question_id = '00000000-0000-4000-8000-000000000401'$$,
  '23001',
  null,
  'a post is never edited'
);

-- The publication ends: nothing more can be asked or answered through it.
update app.environment_publications
set status = 'unpublished', ended_at = now(), status_changed_at = now(),
  end_reason = 'withdrawn', ended_by_user_id = '00000000-0000-4000-8000-0000000000a1'
where id = '00000000-0000-4000-8000-000000000101';

select throws_ok(
  $$insert into app.object_question_posts (question_id, author_user_id, by_owner, body)
    values ('00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-0000000000a1', true, 'Ja, fire meter.')$$,
  '23001',
  null,
  'no post after the publication ended'
);

select throws_ok(
  $$insert into app.object_questions (
      publication_id, object_id, environment_id, asked_by_user_id
    ) values (
      '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1',
      '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1'
    )$$,
  '23001',
  null,
  'no question through an ended publication'
);

select * from finish();

rollback;
