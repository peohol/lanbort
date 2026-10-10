begin;

select plan(6);

-- PS-ENV-019: the administrators' question lives with the application only
-- while it waits on the applicant.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b2', 'active', now());

insert into app.environments (id, type, name, created_by_user_id)
values (
  '00000000-0000-4000-8000-0000000000e1', 'closed', 'Borettslaget',
  '00000000-0000-4000-8000-0000000000b1'
);

insert into app.environment_memberships (id, environment_id, user_id, state, origin, review_stage)
values (
  '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000b2',
  'pending', 'application', 'submitted'
);

select throws_ok(
  $$
    update app.environment_memberships
    set information_question = 'Hvilken oppgang bor du i?'
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  '23514',
  null,
  'no question while the application does not wait on the applicant'
);

select throws_ok(
  $$
    update app.environment_memberships
    set review_stage = 'information_requested', information_question = repeat('x', 301)
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  '23514',
  null,
  'the question is short'
);

select throws_ok(
  $$
    update app.environment_memberships
    set review_stage = 'information_requested', information_question = ' Hvilken oppgang? '
    where id = '00000000-0000-4000-8000-0000000000f1'
  $$,
  '23514',
  null,
  'the question is stored trimmed, never blank'
);

update app.environment_memberships
set review_stage = 'information_requested', information_question = 'Hvilken oppgang bor du i?'
where id = '00000000-0000-4000-8000-0000000000f1';

select is(
  (select information_question from app.environment_memberships
    where id = '00000000-0000-4000-8000-0000000000f1'),
  'Hvilken oppgang bor du i?',
  'the question is kept while the application waits on the applicant'
);

-- Another update leaves it while the stage holds.
update app.environment_memberships set updated_at = now()
where id = '00000000-0000-4000-8000-0000000000f1';

select is(
  (select information_question from app.environment_memberships
    where id = '00000000-0000-4000-8000-0000000000f1'),
  'Hvilken oppgang bor du i?',
  'it stays while the stage does'
);

update app.environment_memberships set review_stage = 'submitted'
where id = '00000000-0000-4000-8000-0000000000f1';

select is(
  (select information_question from app.environment_memberships
    where id = '00000000-0000-4000-8000-0000000000f1'),
  null,
  'it goes as soon as the application moves on'
);

select * from finish();
rollback;
