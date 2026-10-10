begin;

select plan(17);

-- PS-COM-020: a report or a mediation is closed with a closing message.
-- PS-COM-021: a member closes their own contact, a reporter withdraws their
-- report, and nobody else who takes part closes a case.
--
-- Anna (a1) founded and administers the environment (e1). Bo (b1) reports
-- Cia (c1), a member there too, and contacts the administrators.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now());

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
insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'owner', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
    'administrator', '00000000-0000-4000-8000-0000000000a1');

-- Runs the deferred checks now, as a commit would.
create function pg_temp.check_now()
returns void
language plpgsql
as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end;
$$;

-- A handler's entry to the parties; `closing` when it is the closing message.
create function pg_temp.entry(c uuid, closing boolean)
returns void
language sql
as $$
  insert into app.case_entries (case_id, author_user_id, capacity, audience, body,
    created_at, closing)
  values (c, '00000000-0000-4000-8000-0000000000a1', 'handler', 'parties',
    'Saken er avsluttet.', now(), closing);
$$;

create function pg_temp.close(c uuid)
returns void
language sql
as $$
  insert into app.case_actions (case_id, kind, actor_user_id, at)
  values (c, 'closed', '00000000-0000-4000-8000-0000000000a1', now());
  update app.cases set status = 'closed', closed_at = now() where id = c;
$$;

insert into app.cases (id, kind, environment_id, report_target, subject_user_id,
  opened_by_user_id, opened_at)
values ('00000000-0000-4000-8000-000000000501', 'environment_report',
  '00000000-0000-4000-8000-0000000000e1', 'user',
  '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', now());
insert into app.cases (id, kind, environment_id, opened_by_user_id, opened_at)
values ('00000000-0000-4000-8000-000000000502', 'environment_contact',
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', now());
insert into app.case_participants (case_id, user_id, role, may_write, joined_at) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-0000000000b1',
    'reporter', true, now()),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-0000000000b1',
    'requester', true, now());
insert into app.case_actions (case_id, kind, actor_user_id, target_user_id, at)
select id, 'assigned', '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1', now()
from unnest(array[
  '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000502'
]::uuid[]) as id;
update app.cases set assignee_user_id = '00000000-0000-4000-8000-0000000000a1'
where id in ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000502');
select pg_temp.check_now();

select throws_ok(
  $$ select pg_temp.close('00000000-0000-4000-8000-000000000501') $$,
  '23001',
  null,
  'a report is not closed without a closing message'
);

select throws_ok(
  $$ insert into app.case_entries (case_id, author_user_id, capacity, audience, body,
       created_at, closing)
     values ('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-0000000000a1', 'handler', 'handlers', 'Notat', now(), true) $$,
  '23514',
  null,
  'a closing message goes to the parties, never as an internal note'
);

select throws_ok(
  $$ insert into app.case_entries (case_id, author_user_id, capacity, audience, body,
       created_at, closing)
     values ('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-0000000000b1', 'party', 'parties', 'Ferdig', now(), true) $$,
  '23514',
  null,
  'a party never writes a closing message'
);

select throws_ok(
  $$ select pg_temp.entry('00000000-0000-4000-8000-000000000502', true) $$,
  '23001',
  null,
  'a contact has no closing message'
);

savepoint left_open;
select pg_temp.entry('00000000-0000-4000-8000-000000000501', true);
select throws_ok(
  $$ select pg_temp.check_now() $$,
  '23001',
  null,
  'a closing message is never left in a case that stays open'
);
rollback to left_open;

select lives_ok(
  $$ select pg_temp.entry('00000000-0000-4000-8000-000000000501', true);
     select pg_temp.close('00000000-0000-4000-8000-000000000501');
     select pg_temp.check_now() $$,
  'a report is closed with its closing message'
);

select is(
  (select status from app.cases where id = '00000000-0000-4000-8000-000000000501'),
  'closed',
  'the report is closed'
);

select throws_ok(
  $$ select pg_temp.entry('00000000-0000-4000-8000-000000000501', true) $$,
  '23001',
  null,
  'a closed case gets no second closing message'
);

select lives_ok(
  $$ select pg_temp.close('00000000-0000-4000-8000-000000000502');
     select pg_temp.check_now() $$,
  'a contact is closed without one'
);

-- Bo contacts the administrators again and reports Cia again.
insert into app.cases (id, kind, environment_id, opened_by_user_id, opened_at)
values ('00000000-0000-4000-8000-000000000503', 'environment_contact',
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', now());
insert into app.cases (id, kind, environment_id, report_target, subject_user_id,
  opened_by_user_id, opened_at)
values ('00000000-0000-4000-8000-000000000504', 'environment_report',
  '00000000-0000-4000-8000-0000000000e1', 'user',
  '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', now());
insert into app.case_participants (case_id, user_id, role, may_write, joined_at) values
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-0000000000b1',
    'requester', true, now()),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-0000000000b1',
    'reporter', true, now());

-- `who` takes the participant's step `kind` in case `c`.
create function pg_temp.act(c uuid, kind text, who uuid)
returns void
language sql
as $$
  insert into app.case_actions (case_id, kind, actor_user_id, at)
  values (c, kind, who, now());
$$;

select throws_ok(
  $$ select pg_temp.act('00000000-0000-4000-8000-000000000503', 'closed',
       '00000000-0000-4000-8000-0000000000c1') $$,
  '23001',
  null,
  'nobody else closes a member''s contact'
);

select throws_ok(
  $$ select pg_temp.act('00000000-0000-4000-8000-000000000504', 'closed',
       '00000000-0000-4000-8000-0000000000b1') $$,
  '23001',
  null,
  'a reporter does not close their report'
);

select throws_ok(
  $$ select pg_temp.act('00000000-0000-4000-8000-000000000503', 'withdrawn',
       '00000000-0000-4000-8000-0000000000b1') $$,
  '23001',
  null,
  'a contact is not withdrawn'
);

select lives_ok(
  $$ select pg_temp.act('00000000-0000-4000-8000-000000000503', 'closed',
       '00000000-0000-4000-8000-0000000000b1');
     update app.cases set status = 'closed', closed_at = now()
     where id = '00000000-0000-4000-8000-000000000503';
     select pg_temp.check_now() $$,
  'the member closes their own contact'
);

select throws_ok(
  $$ select pg_temp.act('00000000-0000-4000-8000-000000000504', 'withdrawn',
       '00000000-0000-4000-8000-0000000000a1') $$,
  '23001',
  null,
  'only the reporter withdraws a report'
);

select lives_ok(
  $$ select pg_temp.act('00000000-0000-4000-8000-000000000504', 'withdrawn',
       '00000000-0000-4000-8000-0000000000b1');
     select pg_temp.check_now() $$,
  'the reporter withdraws their report'
);

select is(
  (select status from app.cases where id = '00000000-0000-4000-8000-000000000504'),
  'open',
  'a withdrawn report stays open for its assessment'
);

select throws_ok(
  $$ select pg_temp.act('00000000-0000-4000-8000-000000000504', 'withdrawn',
       '00000000-0000-4000-8000-0000000000b1') $$,
  '23001',
  null,
  'a report is withdrawn once'
);

select * from finish();
rollback;
