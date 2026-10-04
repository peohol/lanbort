-- WP-62: Geographic discovery (PS-NFR-008, ADR-0005, ADR-0008).
--
-- An environment may have an approximate area: a centre and a radius, never
-- an address. The centre is kept in hundredths of a degree, about a
-- kilometre, so a more precise point can never be stored, whatever a client
-- sends: the column type rounds it. The smallest radius is a kilometre.
--
-- The area is discovery data like the name: the search index copies it only
-- for open and closed environments that take new members (the same source
-- view as the text), so a hidden environment's area is never found. Searches
-- verify type, state and access restrictions against the environment in the
-- same query, exactly as for text (WP-61).

alter table app.environments
  add column area_latitude numeric(4, 2)
    check (area_latitude between -90 and 90),
  add column area_longitude numeric(5, 2)
    check (area_longitude between -180 and 180),
  -- The sizes in `areaRadiusKmOptions` (packages/contracts/src/geo.ts).
  add column area_radius_km smallint
    check (area_radius_km in (1, 2, 5, 10, 25, 50, 100)),
  add constraint environments_area_complete
    check (num_nulls(area_latitude, area_longitude, area_radius_km) in (0, 3));

comment on column app.environments.area_latitude is
  'Centre of the approximate area (PS-NFR-008), rounded to hundredths of a degree.';

-- Great-circle distance in kilometres between two points (haversine).
create function app.geo_distance_km(
  latitude_a numeric, longitude_a numeric,
  latitude_b numeric, longitude_b numeric
)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 2 * 6371.0088 * asin(least(1, sqrt(
    power(sin(radians((latitude_b - latitude_a)::double precision) / 2), 2)
    + cos(radians(latitude_a::double precision))
      * cos(radians(latitude_b::double precision))
      * power(sin(radians((longitude_b - longitude_a)::double precision) / 2), 2)
  )));
$$;

revoke execute on function app.geo_distance_km(numeric, numeric, numeric, numeric)
  from public;

-- Whether two areas (centre and radius) touch or overlap. An area that is
-- not there overlaps nothing.
create function app.geo_areas_overlap(
  latitude_a numeric, longitude_a numeric, radius_km_a numeric,
  latitude_b numeric, longitude_b numeric, radius_km_b numeric
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    app.geo_distance_km(latitude_a, longitude_a, latitude_b, longitude_b)
      <= radius_km_a + radius_km_b,
    false
  );
$$;

revoke execute on function
  app.geo_areas_overlap(numeric, numeric, numeric, numeric, numeric, numeric)
  from public;

alter table app.search_environments
  add column area_latitude numeric(4, 2),
  add column area_longitude numeric(5, 2),
  add column area_radius_km smallint;

comment on table app.search_environments is
  'Derived search text and approximate area of open and closed environments (ADR-0005). Hidden ones are never indexed.';

create or replace view app.search_environment_sources as
select
  environment.id as environment_id,
  app.search_document(
    environment.name,
    concat_ws(' ', environment.object_focus, environment.audience, environment.location),
    environment.description
  ) as document,
  environment.area_latitude,
  environment.area_longitude,
  environment.area_radius_km
from app.environments as environment
where environment.type in ('open', 'closed')
  and environment.state = 'active';

create or replace function app.refresh_search_environments(scope uuid[] default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removed integer;
  written integer;
begin
  perform app.lock_search_entries('environment', scope);

  delete from app.search_environments as entry
  where (scope is null or entry.environment_id = any(scope))
    and not exists (
      select 1 from app.search_environment_sources as source
      where source.environment_id = entry.environment_id
    );
  get diagnostics removed = row_count;

  insert into app.search_environments as entry (
    environment_id, document, area_latitude, area_longitude, area_radius_km
  )
  select
    source.environment_id, source.document,
    source.area_latitude, source.area_longitude, source.area_radius_km
  from app.search_environment_sources as source
  where scope is null or source.environment_id = any(scope)
  on conflict (environment_id) do update
    set document = excluded.document,
      area_latitude = excluded.area_latitude,
      area_longitude = excluded.area_longitude,
      area_radius_km = excluded.area_radius_km,
      indexed_at = clock_timestamp()
    where (entry.document, entry.area_latitude, entry.area_longitude, entry.area_radius_km)
      is distinct from
      (excluded.document, excluded.area_latitude, excluded.area_longitude, excluded.area_radius_km);
  get diagnostics written = row_count;

  return removed + written;
end;
$$;

revoke execute on function app.refresh_search_environments(uuid[]) from public;
