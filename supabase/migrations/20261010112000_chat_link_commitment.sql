-- Linking a device binds its keys to a secret only its screen shows
-- (ADR-0010 §5). The new device sends a commitment to its keys under that
-- secret; the server stores it and never learns the secret, so it can
-- neither swap the keys nor seal an account key of its own to the device.
alter table app.chat_link_requests
  add column commitment bytea check (octet_length(commitment) = 32);

-- Requests made before this have none and simply expire; every new one has.
alter table app.chat_link_requests
  add constraint chat_link_requests_commitment_required
  check (commitment is not null) not valid;

comment on column app.chat_link_requests.commitment is
  'HMAC of the request''s keys under a key from the secret on the new device''s screen (ADR-0010 §5).';

-- The link package and the recovery backup also carry the account's pinned
-- contact keys (ADR-0010 §5, §8), so a new or restored device trusts what
-- the account already trusted.
alter table app.chat_link_requests
  drop constraint chat_link_requests_package_check,
  add constraint chat_link_requests_package_check
    check (octet_length(package) between 1 and 163840);

alter table app.chat_recovery_keys
  drop constraint chat_recovery_keys_backup_check,
  add constraint chat_recovery_keys_backup_check
    check (octet_length(backup) between 29 and 131072);
