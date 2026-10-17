-- PS-OBJ-021: a small, rough copy of a thing's main picture, in the square
-- shown on its card (PS-OBJ-002). The outbox makes it again whenever the
-- main picture or its square changes. When the thing is deleted its
-- pictures go, but each of its loans and loan requests keeps a copy of this
-- one, so the parties still see what was lent. The copies go when the owner
-- deletes their account, like the rest of what they have shown
-- (docs/implementation/retention.md).
create table app.thing_thumbnails (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one holder: the thing while it exists, or after it one of its
  -- loans or requests.
  object_id uuid unique references app.objects (id),
  loan_id uuid unique references app.loans (id),
  request_id uuid unique references app.loan_requests (id),
  -- The picture and the square it was made from, in that picture's pixels.
  image_id uuid not null,
  crop_left integer,
  crop_top integer,
  crop_side integer,
  side integer not null check (side between 1 and 256),
  bytes bytea not null check (octet_length(bytes) between 1 and 16384),
  made_at timestamptz not null default clock_timestamp(),
  constraint thing_thumbnails_one_holder
    check (num_nonnulls(object_id, loan_id, request_id) = 1),
  constraint thing_thumbnails_crop_shape
    check (num_nulls(crop_left, crop_top, crop_side) in (0, 3))
);

comment on table app.thing_thumbnails is
  'A rough thumbnail of a thing''s main picture, kept by its loans and requests after the thing is deleted (PS-OBJ-021).';

-- Things that already have pictures get their thumbnail from the outbox,
-- as if their latest picture change had just happened.
insert into app.outbox_messages (event_id, consumer)
select distinct on (event.resource_id) event.id, 'object_images.thumbnail'
from app.audit_events as event
where event.resource_type = 'object'
  and event.event_type in (
    'object.image_added', 'object.image_removed', 'object.image_cropped'
  )
  and exists (
    select 1 from app.object_images as image
    where image.object_id::text = event.resource_id
  )
order by event.resource_id, event.position desc
on conflict (event_id, consumer) do nothing;
