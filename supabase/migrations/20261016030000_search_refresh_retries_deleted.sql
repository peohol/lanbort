-- A refresh reads the sources at the start of its statement. A thing or an
-- environment deleted after that, and before its row was written, left the
-- row referring to nothing, and the whole refresh failed (seen with the
-- whole-index rebuild). The refresh now reads the sources again, which no
-- longer have it; it gives up only if that keeps happening.

create or replace function app.refresh_search_objects(scope uuid[] default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removed integer;
  written integer;
  attempts integer := 0;
begin
  perform app.lock_search_entries('object', scope);

  delete from app.search_objects as entry
  where (scope is null or entry.object_id = any(scope))
    and not exists (
      select 1 from app.search_object_sources as source
      where source.object_id = entry.object_id
    );
  get diagnostics removed = row_count;

  loop
    begin
      insert into app.search_objects as entry (object_id, document)
      select source.object_id, source.document
      from app.search_object_sources as source
      where scope is null or source.object_id = any(scope)
      on conflict (object_id) do update
        set document = excluded.document, indexed_at = clock_timestamp()
        where entry.document is distinct from excluded.document;
      get diagnostics written = row_count;
      exit;
    exception when foreign_key_violation then
      attempts := attempts + 1;
      if attempts >= 3 then
        raise;
      end if;
    end;
  end loop;

  return removed + written;
end;
$$;

create or replace function app.refresh_search_environments(scope uuid[] default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removed integer;
  written integer;
  attempts integer := 0;
begin
  perform app.lock_search_entries('environment', scope);

  delete from app.search_environments as entry
  where (scope is null or entry.environment_id = any(scope))
    and not exists (
      select 1 from app.search_environment_sources as source
      where source.environment_id = entry.environment_id
    );
  get diagnostics removed = row_count;

  loop
    begin
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
      exit;
    exception when foreign_key_violation then
      attempts := attempts + 1;
      if attempts >= 3 then
        raise;
      end if;
    end;
  end loop;

  return removed + written;
end;
$$;
