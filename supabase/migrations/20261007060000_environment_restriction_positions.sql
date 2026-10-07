-- Barring someone from new attempts happens in the environment's privacy
-- context (PS-ENV-009): who was barred under a stricter type is not shown
-- to members who arrived after the type became weaker, whatever their role.
-- So a restriction gets a position like the other events historical privacy
-- compares.
alter table app.environment_access_restrictions add column position bigint;

-- Existing restrictions take the position of the type period they were
-- imposed in. Clock time decides only this one-off backfill; every new
-- restriction gets the next position as it is written. The history guard
-- would refuse the new column, so it steps aside for the backfill alone.
alter table app.environment_access_restrictions
  disable trigger environment_access_restrictions_history;

update app.environment_access_restrictions as restriction
set position = coalesce(
  (
    select period.position
    from app.environment_type_periods as period
    where period.environment_id = restriction.environment_id
      and period.started_at <= restriction.imposed_at
    order by period.position desc
    limit 1
  ),
  (
    select min(period.position)
    from app.environment_type_periods as period
    where period.environment_id = restriction.environment_id
  ),
  nextval('app.history_positions')
);

alter table app.environment_access_restrictions
  enable trigger environment_access_restrictions_history;

alter table app.environment_access_restrictions
  alter column position set default nextval('app.history_positions'),
  alter column position set not null;

create trigger environment_access_restrictions_position
  before insert on app.environment_access_restrictions
  for each row execute function app.assign_history_position();
