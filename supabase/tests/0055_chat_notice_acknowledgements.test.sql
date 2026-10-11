begin;

select plan(4);

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

-- PS-COM-023: one confirmation per account, naming the notice it answered.
select lives_ok(
  $$
    insert into app.chat_notice_acknowledgements (user_id, notice)
    values ('00000000-0000-4000-8000-0000000000a1', 'unaudited_pilot_v1')
  $$,
  'an account confirms the notice'
);

select throws_ok(
  $$
    insert into app.chat_notice_acknowledgements (user_id, notice)
    values ('00000000-0000-4000-8000-0000000000a1', 'unaudited_pilot_v1')
  $$,
  '23505',
  null,
  'the first confirmation is the one that counts'
);

select throws_ok(
  $$
    insert into app.chat_notice_acknowledgements (user_id, notice)
    values ('00000000-0000-4000-8000-0000000000a2', 'unaudited_pilot_v1')
  $$,
  '23503',
  null,
  'only an account can confirm'
);

select throws_ok(
  $$
    update app.chat_notice_acknowledgements set notice = 'Any Text!'
  $$,
  '23514',
  null,
  'the notice is a short identifier, never free text'
);

select * from finish();

rollback;
