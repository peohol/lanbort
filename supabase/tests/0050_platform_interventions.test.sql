begin;

select plan(17);

-- PS-ADM-014–015: a steward's intervention is taken from a platform case the
-- steward holds, toward what the case is about, and recorded with its basis.
-- Without a report, the steward first opens an inquiry of their own.
--
-- Siv (a1) and Tor (a2) are platform stewards; Siv owns a trailer (f1). Bo
-- (b1) is the one Siv looks into, Cia (c1) has nothing to do with it, and Per
-- (d1) never completed registration.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now());
insert into app.users (id, status) values
  ('00000000-0000-4000-8000-0000000000d1', 'pending_registration');

insert into app.platform_role_grants (user_id, role, grant_reason, granted_by_process)
values
  ('00000000-0000-4000-8000-0000000000a1', 'platform_steward', 'Pilot', 'ops.platform_roles'),
  ('00000000-0000-4000-8000-0000000000a2', 'platform_steward', 'Pilot', 'ops.platform_roles');

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

-- An inquiry `opener` opens about an account or a thing.
create function pg_temp.inquiry(id uuid, opener uuid, subject uuid, object uuid)
returns void
language sql
as $$
  insert into app.cases (id, kind, report_target, subject_user_id, object_id,
    opened_by_user_id, opened_at)
  values (id, 'platform_inquiry', case when object is null then 'user' else 'object' end,
    subject, object, opener, now());
$$;

-- An intervention `decider` takes toward `subject` from case `c`.
create function pg_temp.intervene(c uuid, kind text, subject uuid, decider uuid,
  environment uuid, basis text)
returns void
language sql
as $$
  insert into app.platform_interventions (case_id, kind, user_id, environment_id,
    basis, decided_by_user_id, decided_at)
  values (c, kind, subject, environment, basis, decider, now());
$$;

select throws_ok(
  $$ select pg_temp.inquiry('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', null) $$,
  '23001', null, 'only a steward opens an inquiry'
);

select throws_ok(
  $$ select pg_temp.inquiry('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1', null) $$,
  '23001', null, 'not about an account that never completed registration'
);

select throws_ok(
  $$ select pg_temp.inquiry('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-0000000000a1', null, '00000000-0000-4000-8000-0000000000f1') $$,
  '23001', null, 'not about a thing the steward owns'
);

select throws_ok(
  $$ select pg_temp.inquiry('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', null) $$,
  '23514', null, 'never about the steward themselves'
);

select lives_ok(
  $$ select pg_temp.inquiry('00000000-0000-4000-8000-000000000501',
       '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', null) $$,
  'a steward opens an inquiry about someone else'
);

select ok(
  not app.case_involved(c, '00000000-0000-4000-8000-0000000000a1')
    and app.case_involved(c, '00000000-0000-4000-8000-0000000000b1')
    and app.case_platform_kind(c.kind),
  'the steward who opened it may handle it; whoever it is about is involved'
)
from app.cases as c where c.id = '00000000-0000-4000-8000-000000000501';

select throws_ok(
  $$ select pg_temp.intervene('00000000-0000-4000-8000-000000000501', 'account_suspended',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
       null, 'Truer andre medlemmer') $$,
  '23001', null, 'nobody intervenes from a case nobody holds'
);

insert into app.case_actions (case_id, kind, actor_user_id, target_user_id, at)
values ('00000000-0000-4000-8000-000000000501', 'assigned',
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', now());
update app.cases set assignee_user_id = '00000000-0000-4000-8000-0000000000a1'
where id = '00000000-0000-4000-8000-000000000501';

select throws_ok(
  $$ select pg_temp.intervene('00000000-0000-4000-8000-000000000501', 'account_suspended',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a2',
       null, 'Truer andre medlemmer') $$,
  '23001', null, 'another steward does not hold the case'
);

select throws_ok(
  $$ select pg_temp.intervene('00000000-0000-4000-8000-000000000501', 'account_suspended',
       '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1',
       null, 'Truer andre medlemmer') $$,
  '23001', null, 'nobody the case is not about'
);

select throws_ok(
  $$ select pg_temp.intervene('00000000-0000-4000-8000-000000000501', 'account_suspended',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
       null, '  ') $$,
  '23514', null, 'never without a basis'
);

select throws_ok(
  $$ select pg_temp.intervene('00000000-0000-4000-8000-000000000501', 'environment_roles_ended',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
       null, 'Misbruker administratorrollen') $$,
  '23514', null, 'ending roles names the environment'
);

select lives_ok(
  $$ select pg_temp.intervene('00000000-0000-4000-8000-000000000501', 'account_suspended',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
       null, 'Truer andre medlemmer') $$,
  'the steward who holds the case intervenes toward whom it is about'
);

select throws_ok(
  $$ update app.platform_interventions set basis = 'Noe annet' $$,
  null, null, 'an intervention is never rewritten'
);

select throws_ok(
  $$ delete from app.platform_interventions $$,
  null, null, 'nor removed'
);

insert into app.case_actions (case_id, kind, actor_user_id, at)
values ('00000000-0000-4000-8000-000000000501', 'closed',
  '00000000-0000-4000-8000-0000000000a1', now());
update app.cases set status = 'closed', closed_at = now()
where id = '00000000-0000-4000-8000-000000000501';

select throws_ok(
  $$ select pg_temp.intervene('00000000-0000-4000-8000-000000000501', 'account_reinstated',
       '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
       null, 'Saken er avklart') $$,
  '23001', null, 'nobody intervenes from a closed case'
);

select ok(
  not has_table_privilege(role_name, 'app.platform_interventions', 'SELECT'),
  format('%s cannot read the interventions', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

select * from finish();
rollback;
