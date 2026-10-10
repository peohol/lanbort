-- History archives for private chat (ADR-0010 §5, §8). A device encrypts
-- its history with a key of its own and stores the ciphertext here, in
-- parts; the key reaches only the account's other device, sealed in the
-- link package. The server never holds anything it could read.

create table app.chat_archives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  -- Moving history to a device being linked. Short-lived.
  purpose text not null check (purpose in ('link')),
  -- chatLimits.archiveParts.
  part_count integer not null check (part_count between 1 and 16),
  created_at timestamptz not null default clock_timestamp(),
  -- Set once every part is stored; only then can it be read.
  completed_at timestamptz,
  expires_at timestamptz not null check (expires_at > created_at)
);

comment on table app.chat_archives is
  'Encrypted chat history moved between an account''s devices, as ciphertext in parts (ADR-0010 §5, §8).';

create index chat_archives_user_idx on app.chat_archives (user_id, created_at);
create index chat_archives_expires_idx on app.chat_archives (expires_at);

create table app.chat_archive_parts (
  archive_id uuid not null references app.chat_archives (id) on delete cascade,
  part integer not null check (part between 0 and 15),
  -- chatLimits.archivePartBytes of plaintext and the AES-GCM tag.
  data bytea not null check (octet_length(data) between 16 and 524304),
  primary key (archive_id, part)
);

comment on table app.chat_archive_parts is
  'One AES-256-GCM part of a chat history archive. Written once.';

-- A part is written once; an archive changes only by being completed, once.
create trigger chat_archives_complete_once
  before update on app.chat_archives
  for each row execute function app.guard_history_update('completed_at');

create trigger chat_archive_parts_write_once
  before update on app.chat_archive_parts
  for each row execute function app.reject_append_only_mutation();
