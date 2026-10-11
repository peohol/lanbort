-- PS-COM-023: before an account turns private chat on, its owner confirms
-- having read that the encryption is tested internally but not yet reviewed
-- independently. Kept once per account, with the notice it answered, so the
-- server can refuse an account key to anyone who has not confirmed.
create table app.chat_notice_acknowledgements (
  user_id uuid primary key references app.users (id),
  notice text not null check (notice ~ '^[a-z0-9_]{1,64}$'),
  acknowledged_at timestamptz not null default clock_timestamp()
);

comment on table app.chat_notice_acknowledgements is
  'That the user confirmed the notice about private chat before turning it on, and which notice (PS-COM-023).';
