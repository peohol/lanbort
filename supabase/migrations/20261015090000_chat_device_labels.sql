-- Names people know their chat devices by: what kind of device it is, its
-- system and browser as the device detected them, and a name the person may
-- give it. Only shown to the account's owner, on every device of theirs,
-- and never trusted for anything: the certificate, approval and revocation
-- stay as they are (ADR-0010 §3, §5, §7), so the device rows themselves do
-- not change.
--
-- The kind, system and browser come from a fixed set of values; the server
-- checks which (`@lanbort/contracts`), the database that they are short
-- identifiers, never free text from a device.

create table app.chat_device_labels (
  device_id uuid primary key references app.chat_devices (id) on delete cascade,
  -- Null: the name suggested from the rest. Nothing invisible or
  -- direction-changing, which could make one name pass for another.
  name text check (
    char_length(name) between 1 and 40
    and name = btrim(name)
    and name !~ '[[:cntrl:]\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]'
  ),
  kind text check (kind in ('mobile', 'tablet', 'computer')),
  system text check (system ~ '^[a-z0-9_]{1,32}$'),
  browser text check (browser ~ '^[a-z0-9_]{1,32}$'),
  updated_at timestamptz not null default clock_timestamp()
);

comment on table app.chat_device_labels is
  'What the account''s owner calls a live chat device and what it said it is; display only, never trusted (ADR-0010 §7).';

-- Only a live device has a label; a revoked device's goes with it.
create function app.guard_chat_device_label()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.chat_devices
    where id = new.device_id and revoked_at is null
  ) then
    raise exception 'only a live chat device has a label'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_chat_device_label() from public;

create trigger chat_device_labels_live_device
  before insert or update on app.chat_device_labels
  for each row execute function app.guard_chat_device_label();

-- What a device waiting to be linked says it is, shown as unconfirmed to
-- the person who approves it, and its label once approved.
alter table app.chat_link_requests
  add column kind text check (kind in ('mobile', 'tablet', 'computer')),
  add column system text check (system ~ '^[a-z0-9_]{1,32}$'),
  add column browser text check (browser ~ '^[a-z0-9_]{1,32}$');

comment on column app.chat_link_requests.kind is
  'The kind of device the waiting device says it is; unconfirmed, display only.';
