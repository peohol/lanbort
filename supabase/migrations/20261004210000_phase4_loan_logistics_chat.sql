-- WP-44: loan logistics messages on the private chat's delivery service
-- (PS-COM-007, ADR-0010 «Hva de neste arbeidspakkene trenger»).
--
-- A loan logistics channel (`app.loan_logistics_channels`) gets at most one
-- conversation of its own kind, `loan_logistics`: its own MLS group, with
-- the same cryptography as private chat, between exactly the channel's two
-- people. It is never ordinary chat: a block does not close it, and a
-- private conversation between the same people stays closed. It takes
-- messages, commits and welcomes only while its channel is open; once the
-- channel closes, the delivery service accepts nothing more in it. Each
-- message must fit in one padding block, which the domain checks on the
-- message's encrypted length without reading it, and it has no attachments.

alter table app.chat_conversations
  drop constraint chat_conversations_kind_check,
  add constraint chat_conversations_kind_check
    check (kind in ('private', 'loan_logistics')),
  drop constraint chat_conversations_opened_via_check,
  add constraint chat_conversations_opened_via_check
    check (opened_via in ('friendship', 'loan_request', 'object_question', 'loan_logistics')),
  add column loan_logistics_channel_id uuid references app.loan_logistics_channels (id),
  -- A private conversation is between a pair and was opened on grounds of
  -- its own; a logistics conversation belongs to its channel, whose two
  -- people are its participants.
  add constraint chat_conversations_kind_shape check (
    case kind
      when 'loan_logistics' then loan_logistics_channel_id is not null
        and opened_via = 'loan_logistics'
        and user_low_id is null and user_high_id is null
      else loan_logistics_channel_id is null
        and opened_via <> 'loan_logistics'
        and user_low_id is not null and user_high_id is not null
    end
  );

-- One conversation per channel.
create unique index chat_conversations_loan_logistics_key
  on app.chat_conversations (loan_logistics_channel_id)
  where loan_logistics_channel_id is not null;

-- A logistics conversation is started by one of its channel's two people,
-- while the channel is open; what it is and whose channel it belongs to
-- never change.
create function app.guard_loan_logistics_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind
      or new.loan_logistics_channel_id is distinct from old.loan_logistics_channel_id
    then
      raise exception 'conversation % cannot change kind or channel', old.id
        using errcode = 'restrict_violation';
    end if;
  elsif new.kind = 'loan_logistics' and not exists (
    select 1 from app.loan_logistics_channels
    where id = new.loan_logistics_channel_id
      and closed_at is null
      and new.created_by_user_id in (borrower_user_id, lender_user_id)
  ) then
    raise exception 'channel % cannot start a conversation', new.loan_logistics_channel_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_loan_logistics_conversation() from public;

create trigger chat_conversations_loan_logistics_guard
  before insert or update of kind, loan_logistics_channel_id on app.chat_conversations
  for each row execute function app.guard_loan_logistics_conversation();

-- Only the channel's two people take part in its conversation.
create function app.guard_loan_logistics_participant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from app.chat_conversations as conversation
    join app.loan_logistics_channels as channel
      on channel.id = conversation.loan_logistics_channel_id
    where conversation.id = new.conversation_id
      and new.user_id not in (channel.borrower_user_id, channel.lender_user_id)
  ) then
    raise exception 'only the channel''s parties take part in conversation %', new.conversation_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_loan_logistics_participant() from public;

create trigger chat_participants_loan_logistics_guard
  before insert on app.chat_participants
  for each row execute function app.guard_loan_logistics_participant();

-- A closed channel's conversation is delivered nothing more: no messages,
-- commits or welcomes (ADR-0010, WP-44). The domain decides this with the
-- channel held, so this only catches what would bypass it.
create function app.guard_loan_logistics_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from app.chat_conversations as conversation
    join app.loan_logistics_channels as channel
      on channel.id = conversation.loan_logistics_channel_id
    where conversation.id = new.conversation_id
      and channel.closed_at is not null
  ) then
    raise exception 'the logistics channel of conversation % is closed', new.conversation_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_loan_logistics_delivery() from public;

create trigger chat_messages_loan_logistics_guard
  before insert on app.chat_messages
  for each row execute function app.guard_loan_logistics_delivery();
