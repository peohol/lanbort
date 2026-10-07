begin;

select plan(9);

select ok(
  not has_table_privilege(role_name, 'app.profile_pictures', 'SELECT'),
  format('%s cannot read app.profile_pictures', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'profile-pictures' and not public
      and allowed_mime_types = array['image/webp']
      and file_size_limit = 1048576
  ),
  'profile pictures live in a private bucket that only takes small WebP files'
);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now());
insert into app.profiles (user_id, real_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'Anna');

select is(
  (select picture_visibility from app.profiles
    where user_id = '00000000-0000-4000-8000-0000000000a1'),
  'general',
  'a profile picture is shown generally until the person chooses otherwise'
);

select throws_ok(
  $$
    update app.profiles set picture_visibility = 'everyone'
    where user_id = '00000000-0000-4000-8000-0000000000a1'
  $$,
  '23514',
  null,
  'the picture is shown generally, to friends or only to the person'
);

insert into app.profile_pictures (user_id, id, content_type, byte_size, width, height)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000101',
  'image/webp', 2000, 384, 384);

select throws_ok(
  $$
    insert into app.profile_pictures (user_id, id, content_type, byte_size, width, height)
    values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000102',
      'image/webp', 2000, 384, 384)
  $$,
  '23505',
  null,
  'a profile has at most one picture'
);

select throws_ok(
  $$
    insert into app.profile_pictures (user_id, id, content_type, byte_size, width, height)
    values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000103',
      'image/webp', 2000, 384, 384)
  $$,
  '23503',
  null,
  'only a profile has a picture'
);

select throws_ok(
  $$
    update app.profile_pictures set content_type = 'image/svg+xml'
    where user_id = '00000000-0000-4000-8000-0000000000a1'
  $$,
  '23514',
  null,
  'only server re-encoded WebP pictures are stored'
);

select throws_ok(
  $$
    update app.profile_pictures set width = 4000, byte_size = 5000000
    where user_id = '00000000-0000-4000-8000-0000000000a1'
  $$,
  '23514',
  null,
  'a profile picture stays small'
);

select * from finish();
rollback;
