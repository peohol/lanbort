begin;

select plan(9);

-- PS-ADM-007–008, OD-0003: access for a representative of a user who has
-- died or is permanently unavailable is not part of the pilot. Until
-- OD-0003 is decided and a policy explicitly allows it, the database has no
-- way to give anyone such access. Building one means changing these tests
-- on purpose, together with OD-0003.

select is_empty(
  $$
    select format('%s %s', kind, name) from (
      select 'relation' as kind, n.nspname || '.' || c.relname as name
      from pg_class as c join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname in ('app', 'public')
      union all
      select 'column', n.nspname || '.' || c.relname || '.' || a.attname
      from pg_attribute as a
      join pg_class as c on c.oid = a.attrelid
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname in ('app', 'public') and a.attnum > 0 and not a.attisdropped
      union all
      select 'function', n.nspname || '.' || p.proname
      from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname in ('app', 'public')
      union all
      select 'constraint', n.nspname || '.' || con.conname
      from pg_constraint as con join pg_namespace as n on n.oid = con.connamespace
      where n.nspname in ('app', 'public')
      union all
      select 'trigger', t.tgname::text
      from pg_trigger as t
      join pg_class as c on c.oid = t.tgrelid
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname in ('app', 'public')
    ) as named
    where name ~* '(represent|deceas|death|on_behalf|impersonat)'
  $$,
  'nothing in the schema is named for representatives or deaths'
);

select is_empty(
  $$
    select n.nspname || '.' || con.conname
    from pg_constraint as con join pg_namespace as n on n.oid = con.connamespace
    where n.nspname in ('app', 'public')
      and pg_get_constraintdef(con.oid) ~* '(represent|deceas|death|on_behalf|impersonat)'
    union all
    select n.nspname || '.' || p.proname
    from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public')
      and p.prosrc ~* '(represent|deceas|death|on_behalf|impersonat)'
  $$,
  'no rule or function allows a representative or acts on a death'
);

-- Anna (a1) is the user reported; Bo (b1), who owns the trailer (f1) with
-- her, reports her; Cia (c1) is someone else; Siv (a3) is a steward.
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000a3', 'active', now());

insert into app.objects (id, title, category_id, description, created_by_user_id) values
  ('00000000-0000-4000-8000-0000000000f1', 'Tilhenger', 'annet', 'Liten tilhenger',
    '00000000-0000-4000-8000-0000000000a1');
insert into app.object_owners (object_id, user_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000b1');

select throws_ok(
  $$ insert into app.platform_role_grants (user_id, role, granted_by_process, grant_reason)
     values ('00000000-0000-4000-8000-0000000000b1', 'representative',
       'ops.platform_roles', 'Representant for Anna') $$,
  '23514',
  null,
  'there is no global role for a representative'
);

select throws_ok(
  $$ insert into app.account_status_changes (
       user_id, from_status, to_status, reason, changed_at, changed_by_user_id, basis
     ) values ('00000000-0000-4000-8000-0000000000a1', 'active', 'closing', 'death',
       now(), '00000000-0000-4000-8000-0000000000a3', 'Dødsannonse') $$,
  '23001',
  null,
  'a death is no reason an account can change state for'
);

insert into app.cases (id, kind, subject_user_id, opened_by_user_id, opened_at)
values ('00000000-0000-4000-8000-000000000601', 'unavailability_report',
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', now());
insert into app.case_participants (case_id, user_id, role, may_write, joined_at)
values ('00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-0000000000b1', 'reporter', false, now());

set constraints app.cases_consistent immediate;
set constraints app.cases_consistent deferred;

-- Nobody joins the report in another role, so nobody acts for Anna through it.
select throws_ok(
  format(
    $$ insert into app.case_participants (case_id, user_id, role, may_write, joined_at)
       values ('00000000-0000-4000-8000-000000000601', %L, %L, true, now()) $$,
    joiner, role
  ),
  '23001',
  null,
  format('%s cannot join the report as %s', joiner_name, role)
)
from (values
  ('00000000-0000-4000-8000-0000000000a1'::uuid, 'the user reported', 'reporter'),
  ('00000000-0000-4000-8000-0000000000c1'::uuid, 'someone else', 'reporter'),
  ('00000000-0000-4000-8000-0000000000a3'::uuid, 'the steward', 'reporter'),
  ('00000000-0000-4000-8000-0000000000c1'::uuid, 'someone else', 'lender'),
  ('00000000-0000-4000-8000-0000000000c1'::uuid, 'someone else', 'borrower')
) as attempt (joiner, joiner_name, role);

select * from finish();
rollback;
