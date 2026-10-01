create schema if not exists app;

comment on schema app is
  'Private Lånbort application schema. Core domain data is not exposed through the Data API.';

revoke all on schema app from public;
revoke all on schema app from anon, authenticated, service_role;

alter default privileges in schema app
  revoke all on tables from public, anon, authenticated, service_role;

alter default privileges in schema app
  revoke all on sequences from public, anon, authenticated, service_role;

alter default privileges in schema app
  revoke execute on functions from public, anon, authenticated, service_role;
