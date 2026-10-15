begin;

select plan(7);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000d1', 'active', now());

insert into app.objects (id, title, category_id, description, created_by_user_id)
values (
  '00000000-0000-4000-8000-0000000000e1', 'Stige', 'annet', 'Lang stige',
  '00000000-0000-4000-8000-0000000000d1'
);
insert into app.object_owners (object_id, user_id)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1');
insert into app.object_revisions (
  object_id, version, change, actor_user_id, title, category_id, description,
  status, availability, image_ids
)
values (
  '00000000-0000-4000-8000-0000000000e1', 1, 'created',
  '00000000-0000-4000-8000-0000000000d1', 'Stige', 'annet', 'Lang stige',
  'active', '[]', '{}'
);
set constraints all immediate;

-- A picture 300 wide and 200 high.
insert into app.object_images
  (id, object_id, position, content_type, byte_size, width, height, uploaded_by_user_id)
values (
  '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1',
  0, 'image/webp', 100, 300, 200, '00000000-0000-4000-8000-0000000000d1'
);

select is(
  (select num_nulls(crop_left, crop_top, crop_side) from app.object_images),
  3,
  'a picture shows its middle until the owners choose otherwise'
);

select lives_ok(
  $$
    update app.object_images set crop_left = 100, crop_top = 0, crop_side = 200
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  'a square inside the picture can be chosen'
);

select lives_ok(
  $$
    update app.object_images set crop_left = null, crop_top = null, crop_side = null
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  'and the middle chosen again'
);

select throws_ok(
  $$
    update app.object_images set crop_left = 0, crop_top = 0
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  '23514',
  null,
  'a square has its edges and its side, or none of them'
);

select throws_ok(
  $$
    update app.object_images set crop_left = 101, crop_top = 0, crop_side = 200
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  '23514',
  null,
  'the square stays inside the picture''s width'
);

select throws_ok(
  $$
    update app.object_images set crop_left = 0, crop_top = 1, crop_side = 200
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  '23514',
  null,
  'and inside its height'
);

select throws_ok(
  $$
    update app.object_images set crop_left = -1, crop_top = 0, crop_side = 0
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  '23514',
  null,
  'and is never empty or outside the picture'
);

select * from finish();
rollback;
