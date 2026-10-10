begin;

select plan(1);

-- Only the server, which owns the app schema, may run its functions.
select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as grant_
    where p.pronamespace = 'app'::regnamespace
      and grant_.privilege_type = 'EXECUTE'
      and grant_.grantee <> p.proowner
  $$,
  'no app function can be run by anyone but its owner'
);

select * from finish();

rollback;
