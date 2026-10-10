-- The recovery key for private chat (ADR-0010 §8, PS-COM-019). Only the
-- user has the key. The server keeps the backup it opens, the account key
-- and the history archive's key under a key derived from it, and the
-- archive itself: ciphertext, nothing it could read.

-- A backup's history archive is kept for as long as the backup points to
-- it, so it outlives its expiry; an unfinished one expires as usual.
alter table app.chat_archives
  drop constraint chat_archives_purpose_check,
  add constraint chat_archives_purpose_check
    check (purpose in ('link', 'backup'));

create table app.chat_recovery_keys (
  user_id uuid primary key references app.users (id),
  -- The account key the backup holds; a reset replaces it, and the backup
  -- goes with the old key.
  account_key_id uuid not null references app.chat_account_keys (id),
  -- Public, derived from the key: a device under an older key cannot
  -- overwrite the backup.
  key_id bytea not null check (octet_length(key_id) = 16),
  -- A nonce, the sealed account key and archive key, and the tag.
  backup bytea not null check (octet_length(backup) between 29 and 4096),
  archive_id uuid references app.chat_archives (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  backed_up_at timestamptz not null default clock_timestamp()
);

comment on table app.chat_recovery_keys is
  'The recovery key''s backup of the account key and history, as ciphertext (ADR-0010 §8, PS-COM-019).';

create unique index chat_recovery_keys_archive_idx
  on app.chat_recovery_keys (archive_id);

-- PS-COM-019: the key is offered once after chat is turned on, and someone
-- who said «Ikke nå» is reminded once. Each is answered once.
create table app.chat_recovery_prompts (
  user_id uuid primary key references app.users (id),
  declined_at timestamptz,
  reminded_at timestamptz
);

comment on table app.chat_recovery_prompts is
  'Whether the user said «Ikke nå» to the recovery key, and whether the one reminder has been answered (PS-COM-019).';
