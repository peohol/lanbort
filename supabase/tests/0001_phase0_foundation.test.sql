begin;

select plan(4);

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

select * from finish();

rollback;
