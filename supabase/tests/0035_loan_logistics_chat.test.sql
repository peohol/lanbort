begin;

select plan(12);

-- Anna (a1) owns the trailer (f1) and approves Bo's (b1) loan (301) and
-- Cia's (c1) loan (302). Dag (d1) is someone else.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000d1', 'active', now());

insert into app.objects (id, title, category_id, description, loan_terms, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000f1', 'Tilhenger', 'annet', 'Liten tilhenger',
  'Vaskes etter bruk', '00000000-0000-4000-8000-0000000000a1');
insert into app.object_revisions (
  object_id, version, change, actor_user_id, title, category_id, description,
  loan_terms, status, availability, image_ids
)
values ('00000000-0000-4000-8000-0000000000f1', 1, 'created',
  '00000000-0000-4000-8000-0000000000a1', 'Tilhenger', 'annet', 'Liten tilhenger',
  'Vaskes etter bruk', 'active', '[]', '{}');
insert into app.object_owners (object_id, user_id)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1');
insert into app.object_availability_intervals (object_id, period)
values ('00000000-0000-4000-8000-0000000000f1', daterange('2026-11-01', null));

insert into app.environments (id, type, name, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000e1', 'open', 'Borettslaget',
  '00000000-0000-4000-8000-0000000000a1');
insert into app.environment_memberships (
  id, environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000b1', 'active', 'self_service', now(), 0),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000c1', 'active', 'self_service', now(), 0);
insert into app.environment_publications (
  id, object_id, environment_id, published_by_user_id, status
)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'active');

insert into app.loan_requests (
  id, object_id, borrower_user_id, origin, environment_id, publication_id,
  desired_start, desired_end, message, terms_version
) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000b1', 'environment',
    '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000101',
    '2026-11-02', '2026-11-04', 'Kan jeg låne den?', 1),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000c1', 'environment',
    '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000101',
    '2026-11-12', '2026-11-14', 'Kan jeg låne den?', 1);

create function pg_temp.approve(
  loan uuid, request uuid, borrower uuid, period daterange
)
returns void
language plpgsql
as $$
begin
  insert into app.loans (id, request_id, object_id, borrower_user_id, responsible_lender_id,
    owner_ids_at_approval)
  values (loan, request, '00000000-0000-4000-8000-0000000000f1', borrower,
    '00000000-0000-4000-8000-0000000000a1',
    array['00000000-0000-4000-8000-0000000000a1']::uuid[]);
  insert into app.loan_agreements (
    loan_id, version, object_version, terms_version, title, category_id,
    description, loan_terms, period, lender_user_id
  )
  values (loan, 1, 1, 1, 'Tilhenger', 'annet', 'Liten tilhenger',
    'Vaskes etter bruk', period, '00000000-0000-4000-8000-0000000000a1');
  insert into app.loan_reservations (loan_id, object_id, period)
  values (loan, '00000000-0000-4000-8000-0000000000f1', period);
  update app.loan_requests set status = 'approved', status_changed_at = now()
  where id = request;
end;
$$;

select pg_temp.approve('00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1',
  daterange('2026-11-02', '2026-11-04', '[]'));
select pg_temp.approve('00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1',
  daterange('2026-11-12', '2026-11-14', '[]'));

-- WP-44 on WP-43's delivery service: a logistics channel's conversation.
-- Bo blocks Anna, which opens loan 301's channel; Cia blocks Anna, and
-- loan 302's channel closes when Cia cancels the loan.
insert into app.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1');
update app.loans set status = 'ended', status_changed_at = now(),
  end_reason = 'cancelled', ended_at = now(),
  ended_by_user_id = '00000000-0000-4000-8000-0000000000c1'
where id = '00000000-0000-4000-8000-000000000302';
delete from app.loan_reservations where loan_id = '00000000-0000-4000-8000-000000000302';

create function pg_temp.channel(loan uuid)
returns uuid
language sql
as $$ select id from app.loan_logistics_channels where loan_id = loan $$;

create function pg_temp.start(loan uuid, by_user uuid)
returns void
language sql
as $$
  insert into app.chat_conversations (
    kind, loan_logistics_channel_id, opened_via, created_by_user_id
  ) values ('loan_logistics', pg_temp.channel(loan), 'loan_logistics', by_user)
$$;

select throws_ok(
  $$ insert into app.chat_conversations (kind, opened_via, created_by_user_id)
     values ('loan_logistics', 'loan_logistics', '00000000-0000-4000-8000-0000000000b1') $$,
  null,
  null,
  'a logistics conversation belongs to a channel'
);

select throws_ok(
  $$ insert into app.chat_conversations (
       kind, user_low_id, user_high_id, opened_via, created_by_user_id,
       loan_logistics_channel_id
     ) values ('private', '00000000-0000-4000-8000-0000000000a1',
       '00000000-0000-4000-8000-0000000000d1', 'friendship',
       '00000000-0000-4000-8000-0000000000a1',
       pg_temp.channel('00000000-0000-4000-8000-000000000301')) $$,
  '23514',
  null,
  'a private conversation belongs to no channel'
);

select throws_ok(
  $$ select pg_temp.start('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000d1') $$,
  '23001',
  null,
  'only the channel''s parties start its conversation'
);

select throws_ok(
  $$ select pg_temp.start('00000000-0000-4000-8000-000000000302',
       '00000000-0000-4000-8000-0000000000c1') $$,
  '23001',
  null,
  'a closed channel starts no conversation'
);

select lives_ok(
  $$ select pg_temp.start('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000b1') $$,
  'a party starts the conversation of an open channel, despite the block'
);

create function pg_temp.conversation()
returns uuid
language sql
as $$
  select id from app.chat_conversations
  where loan_logistics_channel_id = pg_temp.channel('00000000-0000-4000-8000-000000000301')
$$;

select throws_ok(
  $$ select pg_temp.start('00000000-0000-4000-8000-000000000301',
       '00000000-0000-4000-8000-0000000000a1') $$,
  '23505',
  null,
  'a channel has one conversation'
);

select throws_ok(
  $$ insert into app.chat_participants (conversation_id, user_id)
     values (pg_temp.conversation(), '00000000-0000-4000-8000-0000000000d1') $$,
  '23001',
  null,
  'nobody but the channel''s parties takes part'
);

select lives_ok(
  $$ insert into app.chat_participants (conversation_id, user_id)
     values (pg_temp.conversation(), '00000000-0000-4000-8000-0000000000a1'),
       (pg_temp.conversation(), '00000000-0000-4000-8000-0000000000b1') $$,
  'the channel''s two parties take part'
);

select throws_ok(
  $$ update app.chat_conversations
     set loan_logistics_channel_id = pg_temp.channel('00000000-0000-4000-8000-000000000302')
     where id = pg_temp.conversation() $$,
  '23001',
  null,
  'a conversation never moves to another channel'
);

create function pg_temp.deliver()
returns void
language sql
as $$
  insert into app.chat_messages (conversation_id, generation, epoch, content_type, ciphertext)
  values (pg_temp.conversation(), 1, 0, 'application', '\x01')
$$;

select lives_ok(
  $$ select pg_temp.deliver() $$,
  'an open channel''s conversation is delivered messages'
);

-- The loan is cancelled, which closes its channel.
update app.loans set status = 'ended', status_changed_at = now(),
  end_reason = 'cancelled', ended_at = now(),
  ended_by_user_id = '00000000-0000-4000-8000-0000000000b1'
where id = '00000000-0000-4000-8000-000000000301';
delete from app.loan_reservations where loan_id = '00000000-0000-4000-8000-000000000301';

select throws_ok(
  $$ select pg_temp.deliver() $$,
  '23001',
  null,
  'a closed channel''s conversation is delivered nothing more'
);

select ok(
  (select count(*) = 1 from app.chat_messages where conversation_id = pg_temp.conversation()),
  'what was delivered before the channel closed stays until it is fetched'
);

select * from finish();
rollback;
