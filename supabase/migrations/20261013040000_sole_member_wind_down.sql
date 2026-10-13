-- PS-ENV-012: an owner who is the environment's only member winds it down
-- for good at once, without the cancellation period. A voluntary wind-down
-- that is final as it starts is refused while anyone else holds an active
-- or passive membership; pending applications and invitations are not
-- memberships yet and end neutrally either way. Commands hold the
-- environment row's lock, as every membership change does.
create function app.guard_wind_down_at_once()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reason = 'voluntary'
    and new.final_at = new.started_at
    and exists (
      select from app.environment_memberships
      where environment_id = new.environment_id
        and user_id <> new.started_by_user_id
        and state in ('active', 'passive')
    )
  then
    raise exception 'environment % has other members, so winding it down needs its cancellation period',
      new.environment_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_wind_down_at_once() from public;

create trigger environment_wind_downs_at_once
  before insert on app.environment_wind_downs
  for each row execute function app.guard_wind_down_at_once();
