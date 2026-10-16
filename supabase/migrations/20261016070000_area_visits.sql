-- UX-IA-022: the main navigation shows how much has happened in an area
-- since the user last opened it, the same on every device of theirs. What
-- happened is the user's own notifications (`@lanbort/contracts`
-- newsAreaKinds); this only remembers the newest notification there was
-- when the user last opened each area's own page. Nobody else ever sees it.

create table app.area_visits (
  user_id uuid not null references app.users (id),
  -- The areas are listed in @lanbort/contracts (newsAreas).
  area text not null check (area ~ '^[a-z][a-z_]{0,31}$'),
  -- The newest notification position there was, so anything after it is
  -- new. Only grows: an older visit arriving late changes nothing.
  seen_through bigint not null check (seen_through >= 0),
  visited_at timestamptz not null default clock_timestamp(),
  primary key (user_id, area)
);

comment on table app.area_visits is
  'When each user last opened each main area, as the newest notification position then (UX-IA-022). Private to the user.';

-- Accounts from before start with nothing new: only what happens from now
-- on is news, not every notification they have left unread.
insert into app.area_visits (user_id, area, seen_through)
select users.id, areas.area, coalesce(
  (select max(position) from app.notifications), 0
)
from app.users
cross join (values ('home'), ('loans'), ('things'), ('conversations'))
  as areas (area)
where users.status <> 'deleted';
