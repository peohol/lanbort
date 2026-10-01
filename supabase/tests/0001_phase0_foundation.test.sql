begin;

select plan(5);

select has_schema('app', 'private application schema exists');

select ok(
  not has_schema_privilege('anon', 'app', 'USAGE'),
  'anonymous clients cannot use the private application schema'
);

select ok(
  not has_schema_privilege('authenticated', 'app', 'USAGE'),
  'authenticated clients cannot use the private application schema directly'
);

select ok(
  not has_schema_privilege('service_role', 'app', 'USAGE'),
  'Data API service role cannot bypass the backend boundary into the private schema'
);

-- Schemas exposed through the Supabase Data API ([api] schemas in
-- supabase/config.toml; packages/database checks that the lists match).
select is_empty(
  $$
    select c.oid::regclass::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'graphql_public')
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  $$,
  'every table exposed through the Data API has row-level security enabled'
);

select * from finish();

rollback;
