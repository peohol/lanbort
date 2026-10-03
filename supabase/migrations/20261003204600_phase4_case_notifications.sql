-- WP-45 with WP-40: notifications from administrative cases.

-- Who may handle the case as of `at` (`app.case_handler`), to tell them a
-- case waits in the queue.
create function app.case_handlers(case_id uuid, at timestamptz)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select grant_row.user_id
  from app.cases as c
  cross join lateral (
    select user_id from app.platform_role_grants
    where c.kind = 'unavailability_report'
      and role = 'platform_steward'
      and revoked_at is null
    union
    select user_id from app.environment_role_grants
    where c.kind <> 'unavailability_report'
      and environment_id = c.environment_id
      and role = 'administrator'
      and revoked_at is null
  ) as grant_row
  where c.id = case_id
    and c.status = 'open'
    and app.case_handler(c, grant_row.user_id, at);
$$;

revoke execute on function app.case_handlers(uuid, timestamptz) from public;

-- The case actions the notifications have been made for. The database
-- returns cases to the queue by itself, without a domain event, so the
-- notification job finds those actions here instead of in the outbox. A row
-- is written once, in the same transaction as the notifications.
create table app.case_action_notices (
  action_id uuid primary key references app.case_actions (id),
  noticed_at timestamptz not null
);

comment on table app.case_action_notices is
  'Case actions without a domain event whose notifications were made.';

create trigger case_action_notices_kept
  before update or delete on app.case_action_notices
  for each row execute function app.reject_append_only_mutation();
