begin;

select plan(25);

select has_table('app', table_name, format('app.%s exists', table_name))
from unnest(array[
  'objects', 'object_owners', 'object_categories',
  'object_availability_intervals', 'object_images'
]) as table_name;

select ok(
  not has_table_privilege(role_name, format('app.%s', table_name), 'SELECT'),
  format('%s cannot read app.%s', role_name, table_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array['objects', 'object_availability_intervals', 'object_images']) as table_name;

-- Actual availability is derived; the object stores no availability status.
select columns_are(
  'app', 'objects',
  array[
    'id', 'title', 'category_id', 'description', 'loan_terms', 'status',
    'archived_at', 'version', 'created_by_user_id', 'created_at', 'updated_at'
  ],
  'objects have no stored availability or loan status'
);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'object-images' and not public
      and allowed_mime_types = array['image/webp']
  ),
  'object images live in a private bucket that only takes WebP'
);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000d1', 'active', now());

-- An object and its first owner are written in the same transaction.
insert into app.objects (id, title, category_id, description, created_by_user_id)
values (
  '00000000-0000-4000-8000-0000000000e1', 'Stige', 'annet', 'Lang stige',
  '00000000-0000-4000-8000-0000000000d1'
);
insert into app.object_owners (object_id, user_id)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1');
-- From here on, deferred checks run at the end of each statement.
set constraints all immediate;

select throws_ok(
  $$
    insert into app.objects (title, category_id, description, created_by_user_id)
    values ('Uten eier', 'annet', 'Ingen eier', '00000000-0000-4000-8000-0000000000d1')
  $$,
  '23000',
  null,
  'an object cannot exist without an owner'
);

select throws_ok(
  $$
    delete from app.object_owners where object_id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  '23000',
  null,
  'the last owner cannot be removed'
);

select throws_ok(
  $$
    insert into app.objects (title, category_id, description, created_by_user_id)
    values ('Ukjent', 'finnes_ikke', 'Beskrivelse', '00000000-0000-4000-8000-0000000000d1')
  $$,
  '23503',
  null,
  'objects use the shared category structure'
);

select throws_ok(
  $$
    insert into app.objects (title, category_id, description, created_by_user_id)
    values (' Stige', 'annet', 'Beskrivelse', '00000000-0000-4000-8000-0000000000d1')
  $$,
  '23514',
  null,
  'titles are stored trimmed'
);

select throws_ok(
  $$
    update app.objects set status = 'archived'
    where id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  '23514',
  null,
  'an archived object records when it was archived'
);

insert into app.object_availability_intervals (object_id, period) values
  ('00000000-0000-4000-8000-0000000000e1', daterange('2030-01-01', '2030-02-01')),
  ('00000000-0000-4000-8000-0000000000e1', daterange('2030-03-01', null));

select throws_ok(
  $$
    insert into app.object_availability_intervals (object_id, period)
    values ('00000000-0000-4000-8000-0000000000e1', daterange('2030-01-15', '2030-01-20'))
  $$,
  '23P01',
  null,
  'availability intervals of an object never overlap'
);

select throws_ok(
  $$
    insert into app.object_availability_intervals (object_id, period)
    values ('00000000-0000-4000-8000-0000000000e1', daterange('2030-02-01', '2030-02-10'))
  $$,
  '23P01',
  null,
  'touching intervals are stored merged, never side by side'
);

select throws_ok(
  $$
    insert into app.object_availability_intervals (object_id, period)
    values ('00000000-0000-4000-8000-0000000000e1', daterange(null, '2029-01-01'))
  $$,
  '23514',
  null,
  'availability always has a start date'
);

select lives_ok(
  $$
    insert into app.object_availability_intervals (object_id, period)
    values ('00000000-0000-4000-8000-0000000000e1', daterange('2030-02-02', '2030-02-10'))
  $$,
  'separate intervals are allowed'
);

insert into app.object_images (id, object_id, position, content_type, byte_size, width, height, uploaded_by_user_id)
select gen_random_uuid(), '00000000-0000-4000-8000-0000000000e1', position, 'image/webp', 100, 10, 10,
  '00000000-0000-4000-8000-0000000000d1'
from generate_series(0, 4) as position;

select throws_ok(
  $$
    insert into app.object_images (id, object_id, position, content_type, byte_size, width, height, uploaded_by_user_id)
    values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000e1', 5, 'image/webp', 100, 10, 10,
      '00000000-0000-4000-8000-0000000000d1')
  $$,
  '23514',
  null,
  'an object has at most five images'
);

select throws_ok(
  $$
    insert into app.object_images (id, object_id, position, content_type, byte_size, width, height, uploaded_by_user_id)
    values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000e1', 0, 'image/webp', 100, 10, 10,
      '00000000-0000-4000-8000-0000000000d1')
  $$,
  '23505',
  null,
  'two images cannot share a position'
);

select throws_ok(
  $$
    update app.object_images set content_type = 'image/svg+xml'
    where object_id = '00000000-0000-4000-8000-0000000000e1' and position = 0
  $$,
  '23514',
  null,
  'only server re-encoded WebP images are stored'
);

select * from finish();
rollback;
