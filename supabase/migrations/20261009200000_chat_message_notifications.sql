-- PS-COM-018: notifications of new messages in private chat, gathered per
-- conversation, and muting one conversation.

-- «Demp samtalen»: only this participant's notifications of new messages
-- in it. Required notifications and those about the loan are never muted.
alter table app.chat_participants add column muted_at timestamptz;

comment on column app.chat_participants.muted_at is
  'When the participant muted notifications of new messages here (PS-COM-018); null when not muted.';

-- New messages before the recipient has opened the conversation update its
-- one unread notification instead of adding more: the count in its detail,
-- when the newest arrived, and a new position so it moves to the top. It
-- stays the same notification, so an e-mail about it still leads to it.
-- The chat command does this under the conversation's lock; the index keeps
-- it to one even so. Every other notification only changes read_at, once.
create unique index notifications_unread_chat_messages
  on app.notifications (recipient_id, target_id)
  where kind = 'chat.new_messages' and read_at is null;

drop trigger notifications_read_once on app.notifications;

create trigger notifications_read_once
  before update on app.notifications
  for each row
  when (old.kind <> 'chat.new_messages' or old.read_at is not null)
  execute function app.guard_history_update('read_at');

create trigger notifications_chat_messages_counted
  before update on app.notifications
  for each row
  when (old.kind = 'chat.new_messages' and old.read_at is null)
  execute function app.guard_history_update(
    'read_at', 'detail', 'occurred_at', 'position'
  );

comment on table app.notifications is
  'In-app notifications. Only read_at changes, once, except that an unread chat.new_messages notification counts the new messages (PS-COM-018); the content is a code and a target.';

-- New chat messages are chosen on their own, in the app and by e-mail
-- (PS-COM-018): such a choice is stored under the kind instead of a level.
alter table app.notification_preferences
  drop constraint notification_preferences_configurable,
  add constraint notification_preferences_configurable check (
    (level, channel) in (
      ('action', 'email'),
      ('information', 'in_app'),
      ('information', 'email'),
      ('chat.new_messages', 'in_app'),
      ('chat.new_messages', 'email')
    )
  );

comment on column app.notification_preferences.level is
  'The level the choice is for, or a kind whose channels are chosen on their own (notificationKindChannelRules).';
