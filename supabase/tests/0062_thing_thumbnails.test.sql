begin;

select plan(5);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000d1', 'active', now());

insert into app.objects (id, title, category_id, description, created_by_user_id)
values (
  '00000000-0000-4000-8000-0000000000e1', 'Stige', 'annet', 'Lang stige',
  '00000000-0000-4000-8000-0000000000d1'
);

-- PS-OBJ-021: one rough thumbnail per thing, small, held by one holder.
select lives_ok(
  $$
    insert into app.thing_thumbnails (object_id, image_id, side, bytes)
    values (
      '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000f1', 96, '\x52494646'
    )
  $$,
  'a thing keeps a thumbnail of its main picture'
);

select throws_ok(
  $$
    insert into app.thing_thumbnails (object_id, image_id, side, bytes)
    values (
      '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000f2', 96, '\x52494646'
    )
  $$,
  '23505',
  null,
  'a thing has one thumbnail'
);

select throws_ok(
  $$
    insert into app.thing_thumbnails (image_id, side, bytes)
    values ('00000000-0000-4000-8000-0000000000f3', 96, '\x52494646')
  $$,
  '23514',
  null,
  'a thumbnail always has a holder'
);

select throws_ok(
  $$
    insert into app.thing_thumbnails (object_id, image_id, side, bytes)
    values (
      '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000f4', 96,
      decode(repeat('00', 16385), 'hex')
    )
  $$,
  '23514',
  null,
  'a thumbnail is a few kilobytes at most'
);

select throws_ok(
  $$
    insert into app.thing_thumbnails (object_id, image_id, crop_left, side, bytes)
    values (
      '00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000f5', 0, 96, '\x52494646'
    )
  $$,
  '23514',
  null,
  'a square is all of its edges or none'
);

select * from finish();
rollback;
