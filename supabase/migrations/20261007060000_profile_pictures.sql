-- Profile pictures (PS-USR-002).
--
-- A profile has at most one picture. The person crops it in the browser to
-- the app's picture shape; the server re-encodes it without metadata and
-- stores it in the private `profile-pictures` bucket under
-- people/<user id>/<picture id>.webp, which the browser never reaches. A new
-- picture replaces the old one under a new id, so an address of the old one
-- names nothing afterwards.
--
-- Who sees the picture is the person's own choice for this profile field:
-- generally (everyone who may see their profile), friends, or only
-- themselves. The choice stays when the picture is replaced or removed.

alter table app.profiles
  add column picture_visibility text not null default 'general'
    constraint profiles_picture_visibility_check
    check (picture_visibility in ('general', 'friends', 'only_me'));

create table app.profile_pictures (
  user_id uuid primary key references app.profiles (user_id),
  id uuid not null unique,
  content_type text not null check (content_type in ('image/webp')),
  byte_size integer not null check (byte_size between 1 and 1048576),
  width integer not null check (width between 1 and 1024),
  height integer not null check (height between 1 and 1024),
  created_at timestamptz not null default clock_timestamp()
);

comment on table app.profile_pictures is
  'The current profile picture of a profile (PS-USR-002); the file is in the private profile-pictures bucket.';

-- Private bucket for profile pictures. The server uploads after validation
-- and streams a picture out only to those its owner lets see it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-pictures', 'profile-pictures', false, 1048576, array['image/webp']);
