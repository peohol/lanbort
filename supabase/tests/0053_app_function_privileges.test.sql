begin;

select plan(8);

-- Only the owner and the server's own role may run the app's functions.
select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as grant_
    where p.pronamespace = 'app'::regnamespace
      and grant_.privilege_type = 'EXECUTE'
      and grant_.grantee not in (p.proowner, 'lanbort_app'::regrole)
  $$,
  'no app function can be run by anyone but its owner and the server'
);

-- The server's role reaches all of the app, also what later migrations add.
select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_proc p
    where p.pronamespace = 'app'::regnamespace
      and not has_function_privilege('lanbort_app', p.oid, 'EXECUTE')
  $$,
  'the server can run every app function'
);

select is_empty(
  $$
    select c.oid::regclass::text
    from pg_class c
    where c.relnamespace = 'app'::regnamespace
      and c.relkind in ('r', 'p', 'v')
      and not (
        has_table_privilege('lanbort_app', c.oid, 'SELECT')
        and has_table_privilege('lanbort_app', c.oid, 'INSERT')
        and has_table_privilege('lanbort_app', c.oid, 'UPDATE')
        and has_table_privilege('lanbort_app', c.oid, 'DELETE')
      )
  $$,
  'the server can read and write every app table'
);

-- ...and nothing more: it owns nothing, so it cannot change the schema or
-- turn off a guard, and it cannot read the sign-in provider's tables.
select is_empty(
  $$
    select c.oid::regclass::text from pg_class c
    where c.relowner = 'lanbort_app'::regrole
    union all
    select p.oid::regprocedure::text from pg_proc p
    where p.proowner = 'lanbort_app'::regrole
  $$,
  'the server owns no table or function'
);

select ok(
  not has_schema_privilege('lanbort_app', 'app', 'CREATE'),
  'the server cannot create anything in the app schema'
);

select ok(
  not has_schema_privilege('lanbort_app', schema_name, 'USAGE'),
  format('the server cannot use the %s schema', schema_name)
)
from unnest(array['auth', 'storage']) as schema_name;

select is(
  (
    select array[rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication]
    from pg_roles
    where rolname = 'lanbort_app'
  ),
  array[false, false, false, false, false],
  'the server has no special powers'
);

select * from finish();

rollback;
