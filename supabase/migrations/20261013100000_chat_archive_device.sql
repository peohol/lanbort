-- Which device started a history archive (ADR-0010 §5, §8). A device's
-- new archive replaces only its own unfinished one, so a backup another
-- device of the account is still storing is never removed under it.
alter table app.chat_archives
  add column device_id uuid references app.chat_devices (id) on delete set null;

comment on column app.chat_archives.device_id is
  'The device that started the archive; its next archive replaces its own unfinished one only.';

create index chat_archives_device_idx on app.chat_archives (device_id)
  where device_id is not null;
