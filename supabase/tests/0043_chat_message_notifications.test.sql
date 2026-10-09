begin;

select plan(9);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

select has_column(
  'app', 'chat_participants', 'muted_at',
  'a participant can mute a conversation for themselves'
);

-- PS-COM-018: one unread notification of new messages per conversation.
insert into app.notifications
  (recipient_id, kind, level, detail, target_type, target_id, source_key, occurred_at)
values (
  '00000000-0000-4000-8000-0000000000a1', 'chat.new_messages', 'information',
  'messages_1', 'chat_conversation', '00000000-0000-4000-8000-0000000000c1',
  'chat/00000000-0000-4000-8000-0000000000c1/1', now()
);

select throws_ok(
  $$
    insert into app.notifications
      (recipient_id, kind, level, detail, target_type, target_id, source_key, occurred_at)
    values (
      '00000000-0000-4000-8000-0000000000a1', 'chat.new_messages', 'information',
      'messages_2', 'chat_conversation', '00000000-0000-4000-8000-0000000000c1',
      'chat/00000000-0000-4000-8000-0000000000c1/2', now()
    )
  $$,
  '23505',
  null,
  'a second unread notification for the same conversation is refused'
);

-- The unread one counts the new messages and moves to the top.
select lives_ok(
  $$
    update app.notifications
    set detail = 'messages_2', occurred_at = now(), position = default
    where recipient_id = '00000000-0000-4000-8000-0000000000a1'
  $$,
  'an unread notification of new messages can count another'
);

select throws_ok(
  $$
    update app.notifications
    set target_id = '00000000-0000-4000-8000-0000000000c9'
    where recipient_id = '00000000-0000-4000-8000-0000000000a1'
  $$,
  '23001',
  null,
  'what it is about never changes'
);

update app.notifications set read_at = now()
where recipient_id = '00000000-0000-4000-8000-0000000000a1';

select throws_ok(
  $$
    update app.notifications set detail = 'messages_3'
    where recipient_id = '00000000-0000-4000-8000-0000000000a1'
  $$,
  '23001',
  null,
  'once read, it never changes again'
);

select lives_ok(
  $$
    insert into app.notifications
      (recipient_id, kind, level, detail, target_type, target_id, source_key, occurred_at)
    values (
      '00000000-0000-4000-8000-0000000000a1', 'chat.new_messages', 'information',
      'messages_1', 'chat_conversation', '00000000-0000-4000-8000-0000000000c1',
      'chat/00000000-0000-4000-8000-0000000000c1/3', now()
    )
  $$,
  'once it is read, new messages make a new one'
);

select lives_ok(
  $$
    insert into app.notifications
      (recipient_id, kind, level, detail, target_type, target_id, source_key, occurred_at)
    values (
      '00000000-0000-4000-8000-0000000000a1', 'chat.new_messages', 'information',
      'messages_1', 'chat_conversation', '00000000-0000-4000-8000-0000000000c2',
      'chat/00000000-0000-4000-8000-0000000000c2/1', now()
    )
  $$,
  'another conversation has its own'
);

-- New messages have choices of their own; other kinds still have none.
select lives_ok(
  $$
    insert into app.notification_preferences (user_id, level, channel, enabled)
    values ('00000000-0000-4000-8000-0000000000a1', 'chat.new_messages', 'email', true)
  $$,
  'e-mail about new messages can be chosen on its own'
);

select throws_ok(
  $$
    insert into app.notification_preferences (user_id, level, channel, enabled)
    values ('00000000-0000-4000-8000-0000000000a1', 'chat.device_linked', 'email', false)
  $$,
  '23514',
  null,
  'no other kind has choices of its own'
);

select * from finish();
rollback;
