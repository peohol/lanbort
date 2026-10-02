-- Phase 1 platform role (WP-12, PS-USR-008, PS-NFR-001).
--
-- Platform steward is an explicit global product role. It is only ever
-- granted through this table: never derived from auth metadata, database
-- access or developer status. A grant is revoked by stamping it, so the
-- history of who held the role, and why, is never rewritten.

create table app.platform_role_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  role text not null check (role in ('platform_steward')),
  granted_at timestamptz not null default clock_timestamp(),
  -- Exactly one of a user or a system process granted the role.
  granted_by_user_id uuid references app.users (id),
  granted_by_process text check (granted_by_process ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  grant_reason text not null
    check (grant_reason = btrim(grant_reason) and char_length(grant_reason) between 1 and 500),
  revoked_at timestamptz,
  revoked_by_user_id uuid references app.users (id),
  revoked_by_process text check (revoked_by_process ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  revoke_reason text
    check (revoke_reason = btrim(revoke_reason) and char_length(revoke_reason) between 1 and 500),
  constraint platform_role_grants_granted_by check (
    num_nonnulls(granted_by_user_id, granted_by_process) = 1
  ),
  constraint platform_role_grants_revocation_shape check (
    (revoked_at is null
      and revoke_reason is null
      and num_nonnulls(revoked_by_user_id, revoked_by_process) = 0)
    or (revoked_at is not null
      and revoke_reason is not null
      and num_nonnulls(revoked_by_user_id, revoked_by_process) = 1)
  )
);

comment on table app.platform_role_grants is
  'Explicit grants of global product roles (PS-USR-008). Revoked, never deleted.';

-- At most one active grant of a role per user.
create unique index platform_role_grants_active_key
  on app.platform_role_grants (user_id, role)
  where revoked_at is null;

-- A grant can only change once: from active to revoked. Everything else about
-- it, and every revoked grant, is fixed history.
create function app.guard_platform_role_grant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null
    or new.revoked_at is null
    or (new.id, new.user_id, new.role, new.granted_at, new.granted_by_user_id,
        new.granted_by_process, new.grant_reason)
      is distinct from
       (old.id, old.user_id, old.role, old.granted_at, old.granted_by_user_id,
        old.granted_by_process, old.grant_reason)
  then
    raise exception 'platform role grants can only be revoked'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_platform_role_grant_update() from public;

create trigger platform_role_grants_update_only_revokes
  before update on app.platform_role_grants
  for each row execute function app.guard_platform_role_grant_update();

create trigger platform_role_grants_no_delete
  before delete on app.platform_role_grants
  for each row execute function app.reject_append_only_mutation();

create trigger platform_role_grants_no_truncate
  before truncate on app.platform_role_grants
  for each statement execute function app.reject_append_only_mutation();
