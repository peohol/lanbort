-- WP-46 (PS-COM-013, ADR-0010): a party may submit a readable copy of
-- private messages they chose in their own history, decrypted on their
-- device, with what they write in a case. The copy is case data from then
-- on. Nothing here reaches private chat: the server holds no key, and a
-- case never opens a conversation. The party vouches for the copy; nothing
-- proves that the text, the sender or the time is as it was in the chat.
create table app.case_entry_private_messages (
  entry_id uuid not null references app.case_entries (id),
  ordinal smallint not null check (ordinal between 1 and 50),
  conversation_id uuid not null,
  message_id uuid not null,
  sender_user_id uuid not null references app.users (id),
  sent_at timestamptz not null,
  body text not null check (body = btrim(body) and char_length(body) between 1 and 4000),
  primary key (entry_id, ordinal),
  unique (entry_id, message_id)
);

comment on table app.case_entry_private_messages is
  'Copies of private messages a party submitted with a case entry, append-only (PS-COM-013).';

create trigger case_entry_private_messages_immutable
  before update or delete on app.case_entry_private_messages
  for each row execute function app.reject_append_only_mutation();

-- A copy belongs to what a participant wrote, and comes with it: the entry
-- is still the latest in its case, so nothing can be added to an entry
-- already written. No message was sent after the entry.
create function app.guard_new_case_entry_private_message()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entry app.case_entries;
begin
  select * into entry from app.case_entries where id = new.entry_id;

  if entry.capacity <> 'party'
    or new.sent_at > entry.created_at
    or exists (
      select 1 from app.case_entries
      where case_id = entry.case_id and position > entry.position
    )
    or exists (
      select 1 from app.case_actions
      where case_id = entry.case_id and position > entry.position
    )
  then
    raise exception 'case entry % cannot get this copy', new.entry_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_case_entry_private_message() from public;

create trigger case_entry_private_messages_guard
  before insert on app.case_entry_private_messages
  for each row execute function app.guard_new_case_entry_private_message();
