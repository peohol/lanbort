-- The square part of a thing's picture that is shown where the picture is
-- shown square, such as on the thing's card (PS-OBJ-002). The owners choose
-- it; without a choice the middle of the picture is shown. The picture
-- itself stays whole, so the choice can be changed later and the thing's
-- page still shows all of it.
--
-- In pixels of the stored picture: the square's left and top edge and its
-- side, inside the picture. All three or none.

alter table app.object_images
  add column crop_left integer,
  add column crop_top integer,
  add column crop_side integer,
  add constraint object_images_crop_shape check (
    num_nulls(crop_left, crop_top, crop_side) = 3
    or (
      num_nulls(crop_left, crop_top, crop_side) = 0
      and crop_left >= 0
      and crop_top >= 0
      and crop_side >= 1
      and crop_left + crop_side <= width
      and crop_top + crop_side <= height
    )
  );

comment on column app.object_images.crop_side is
  'The side of the square shown where the picture is shown square, in pixels; null shows the middle (PS-OBJ-002).';
