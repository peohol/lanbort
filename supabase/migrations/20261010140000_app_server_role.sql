-- The server's own database role, with the least it needs: it reads and
-- writes the app's data and runs the app's functions, but owns nothing and
-- reaches no other schema. So it cannot change the schema, turn off the
-- guards on append-only tables or read the sign-in provider's tables, as the
-- owner can. Each environment gives it a login and password; neither is in
-- the repository (docs/implementation/local-development.md).
do $$
begin
  if not exists (select from pg_roles where rolname = 'lanbort_app') then
    create role lanbort_app nologin;
  end if;
end
$$;

grant usage on schema app, extensions to lanbort_app;
grant select, insert, update, delete on all tables in schema app to lanbort_app;
grant usage, select on all sequences in schema app to lanbort_app;
grant execute on all functions in schema app to lanbort_app;

-- What later migrations add, the role gets too (pgTAP 0053 holds them to it).
alter default privileges for role postgres in schema app
  grant select, insert, update, delete on tables to lanbort_app;
alter default privileges for role postgres in schema app
  grant usage, select on sequences to lanbort_app;
alter default privileges for role postgres in schema app
  grant execute on functions to lanbort_app;

-- `pnpm ops:restore` checks the migration history before a restore opens.
grant usage on schema supabase_migrations to lanbort_app;
grant select on supabase_migrations.schema_migrations to lanbort_app;
