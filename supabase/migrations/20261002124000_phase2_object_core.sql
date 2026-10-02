-- Phase 2 object core (WP-24, PS-OBJ-001–005).
--
-- An object has one global identity and one central truth, independent of
-- environments: title, category, description, terms, images and general
-- availability live here once. Publication in environments (WP-25) and
-- co-ownership (WP-26) build on these tables.
--
-- There is deliberately no "available" flag or status anywhere. Actual
-- availability is derived from the availability intervals minus whatever
-- blocks the object (approved loans, unresolved possession, co-owner
-- restrictions), so it can never become a second, competing truth.

-- Exclusion constraints on (object_id, period) need btree_gist for uuid.
create extension if not exists btree_gist with schema extensions;

-- The shared category structure (PS-OBJ-002). The pilot taxonomy is open
-- (OD-0006), so only "Annet", which the vision requires, exists until it is
-- decided; further categories arrive as data in a later migration.
create table app.object_categories (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{0,62}$'),
  parent_id text references app.object_categories (id),
  label text not null check (
    label = btrim(label)
    and char_length(label) between 1 and 80
    and label !~ '[[:cntrl:]]'
  ),
  position integer not null default 0,
  -- Retired categories stay for existing objects but cannot be chosen.
  retired_at timestamptz,
  constraint object_categories_not_own_parent check (parent_id is distinct from id)
);

comment on table app.object_categories is
  'Shared object category structure (PS-OBJ-002). The pilot taxonomy is open in OD-0006.';

insert into app.object_categories (id, label, position)
values ('annet', 'Annet', 1000);

create table app.objects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (
    title = btrim(title)
    and char_length(title) between 1 and 120
    and title !~ '[[:cntrl:]]'
  ),
  category_id text not null references app.object_categories (id),
  -- Free text in the first version (PS-OBJ-002): make, model, size,
  -- condition and known defects. Line breaks and tabs are allowed.
  description text not null check (
    description = btrim(description)
    and char_length(description) between 1 and 5000
    and description !~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  ),
  -- Optional loan terms, free text for now.
  loan_terms text check (
    loan_terms = btrim(loan_terms)
    and char_length(loan_terms) between 1 and 2000
    and loan_terms !~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  ),
  -- Lifecycle only. Archived is reversible (PS-OBJ-016) and never deletes.
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  -- Optimistic concurrency (docs/architecture/05): every change increments
  -- it, and edits must name the version they were based on.
  version integer not null default 1 check (version > 0),
  created_by_user_id uuid not null references app.users (id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint objects_archived_shape check ((status = 'archived') = (archived_at is not null))
);

comment on table app.objects is
  'Global loan objects (PS-OBJ-001). One truth across all environments.';

-- Ownership is the source of truth for who manages an object
-- (docs/architecture/03). WP-24 creates one owner; WP-26 adds co-owners.
create table app.object_owners (
  object_id uuid not null references app.objects (id),
  user_id uuid not null references app.users (id),
  added_at timestamptz not null default clock_timestamp(),
  primary key (object_id, user_id)
);

create index object_owners_user_idx on app.object_owners (user_id, object_id);

-- An object always has at least one registered owner (PS-DOM invariant 2).
-- Checked at commit, so the object and its first owner are inserted together.
create function app.ensure_object_has_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  checked uuid;
begin
  if tg_table_name = 'objects' then
    checked := new.id;
  else
    checked := old.object_id;
  end if;

  if exists (select 1 from app.objects where id = checked)
    and not exists (select 1 from app.object_owners where object_id = checked)
  then
    raise exception 'object % has no owner', checked
      using errcode = 'integrity_constraint_violation';
  end if;

  return null;
end;
$$;

revoke execute on function app.ensure_object_has_owner() from public;

create constraint trigger objects_have_owner
  after insert on app.objects
  deferrable initially deferred
  for each row execute function app.ensure_object_has_owner();

create constraint trigger object_owners_keep_one
  after delete on app.object_owners
  deferrable initially deferred
  for each row execute function app.ensure_object_has_owner();

-- General availability (PS-OBJ-003): calendar dates when the owners are
-- willing to lend, not a loan status. Stored canonically as [start, end + 1);
-- an open interval has no upper bound. Intervals of one object never overlap
-- and never touch: touching intervals are one logical space and are merged
-- before they are stored.
create table app.object_availability_intervals (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references app.objects (id),
  period daterange not null check (not isempty(period) and not lower_inf(period)),
  constraint object_availability_no_overlap
    exclude using gist (object_id with =, period with &&),
  constraint object_availability_not_adjacent
    exclude using gist (object_id with =, period with -|-)
);

comment on table app.object_availability_intervals is
  'General availability per object (PS-OBJ-003). Actual availability is derived, never stored.';

-- 0–5 images per object (PS-OBJ-002). The bytes live in the private
-- `object-images` bucket under objects/<object id>/<image id>.webp, always
-- re-encoded by the server without metadata. Positions 0–4 make six images
-- impossible at the data layer.
create table app.object_images (
  id uuid primary key,
  object_id uuid not null references app.objects (id),
  position smallint not null check (position between 0 and 4),
  content_type text not null check (content_type in ('image/webp')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  uploaded_by_user_id uuid not null references app.users (id),
  created_at timestamptz not null default clock_timestamp(),
  -- Deferrable so positions can be compacted in one statement.
  constraint object_images_position_key unique (object_id, position)
    deferrable initially immediate
);

-- Private bucket for object images. The browser never reaches it: the server
-- uploads after validation and streams images out after authorization.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('object-images', 'object-images', false, 5242880, array['image/webp']);
