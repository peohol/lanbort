begin;

select plan(6);

select ok(
  not has_table_privilege(role_name, 'app.case_action_notices', 'SELECT'),
  format('%s cannot read app.case_action_notices', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

select ok(
  not has_function_privilege(role_name, 'app.case_handlers(uuid, timestamptz)', 'EXECUTE'),
  format('%s cannot list case handlers', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

-- Anna (a1) contacts the administrators of Borettslaget (e1), whose only
-- administrator is Bo (b1). Bo may handle it; Anna, who opened it, may not.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now());

insert into app.environments (id, type, name, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000e1', 'open', 'Borettslaget',
  '00000000-0000-4000-8000-0000000000b1');
insert into app.environment_memberships (
  id, environment_id, user_id, state, origin, activated_at, activation_revision
) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000b1', 'active', 'founder', now(), 0),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a1', 'active', 'self_service', now(), 0);

insert into app.environment_role_grants (environment_id, user_id, role, granted_by_user_id)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1',
    'owner', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1',
    'administrator', '00000000-0000-4000-8000-0000000000b1');

insert into app.cases (id, kind, environment_id, opened_by_user_id, opened_at)
values ('00000000-0000-4000-8000-0000000000c1', 'environment_contact',
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', now());

insert into app.case_participants (case_id, user_id, role, may_write, joined_at)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1',
  'requester', true, now());

select is(
  array(select app.case_handlers('00000000-0000-4000-8000-0000000000c1', now())),
  array['00000000-0000-4000-8000-0000000000b1'::uuid],
  'the administrator may handle the case, and the member who opened it may not'
);

insert into app.case_actions (case_id, kind, actor_user_id, target_user_id, at)
values ('00000000-0000-4000-8000-0000000000c1', 'assigned',
  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', now());
update app.cases set assignee_user_id = '00000000-0000-4000-8000-0000000000b1'
where id = '00000000-0000-4000-8000-0000000000c1';

insert into app.case_action_notices (action_id, noticed_at)
select id, now() from app.case_actions where case_id = '00000000-0000-4000-8000-0000000000c1';

select throws_ok(
  $$delete from app.case_action_notices$$,
  '23001',
  null,
  'a notice that notifications were made is never removed'
);

select * from finish();
rollback;
