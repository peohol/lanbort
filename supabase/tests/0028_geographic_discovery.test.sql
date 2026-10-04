begin;

select plan(14);

select ok(
  not has_function_privilege(role_name, function_name, 'EXECUTE'),
  format('%s cannot call %s', role_name, function_name)
)
from unnest(array['anon', 'authenticated']) as role_name,
  unnest(array[
    'app.geo_distance_km(numeric, numeric, numeric, numeric)',
    'app.geo_areas_overlap(numeric, numeric, numeric, numeric, numeric, numeric)'
  ]) as function_name;

insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', now());

-- An open environment on Grünerløkka with a precise point, a hidden one at
-- the same place, and a closed one in Bergen.
insert into app.environments (
  id, type, name, created_by_user_id, area_latitude, area_longitude, area_radius_km
) values
  ('00000000-0000-4000-8000-0000000000e1', 'open', 'Løkka deler',
    '00000000-0000-4000-8000-0000000000a1', 59.92011, 10.75738, 2),
  ('00000000-0000-4000-8000-0000000000e2', 'hidden', 'Hemmelig klubb',
    '00000000-0000-4000-8000-0000000000a1', 59.92, 10.76, 1),
  ('00000000-0000-4000-8000-0000000000e3', 'closed', 'Verkstedet',
    '00000000-0000-4000-8000-0000000000a1', 60.39, 5.32, 10);

select results_eq(
  $$
    select area_latitude, area_longitude from app.environments
    where id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  $$ values (59.92::numeric, 10.76::numeric) $$,
  'a centre is never kept more precisely than hundredths of a degree'
);

select throws_ok(
  $$
    update app.environments set area_radius_km = null
    where id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  '23514',
  null,
  'an area has a centre and a radius, or nothing'
);

select throws_ok(
  $$
    update app.environments set area_radius_km = 0
    where id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  '23514',
  null,
  'the smallest area is a kilometre across the centre'
);

select throws_ok(
  $$
    update app.environments set area_latitude = 91
    where id = '00000000-0000-4000-8000-0000000000e1'
  $$,
  '23514',
  null,
  'a latitude is a latitude'
);

select ok(
  app.geo_distance_km(59.91, 10.75, 60.39, 5.32) between 300 and 310,
  'Oslo to Bergen is about 305 km'
);

select ok(
  app.geo_areas_overlap(59.92, 10.76, 2, 59.93, 10.72, 1)
  and not app.geo_areas_overlap(59.92, 10.76, 2, 60.39, 5.32, 10)
  and not app.geo_areas_overlap(null, null, null, 59.92, 10.76, 100),
  'areas overlap when they touch, and a missing area overlaps nothing'
);

select ok(app.reconcile_search_index() >= 0, 'the index is rebuilt');

select results_eq(
  $$
    select environment_id, area_latitude, area_longitude, area_radius_km
    from app.search_environments
    where environment_id in ('00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e3')
    order by environment_id
  $$,
  $$
    values
      ('00000000-0000-4000-8000-0000000000e1'::uuid, 59.92::numeric, 10.76::numeric, 2::smallint),
      ('00000000-0000-4000-8000-0000000000e3'::uuid, 60.39::numeric, 5.32::numeric, 10::smallint)
  $$,
  'the areas of open and closed environments are indexed, a hidden one never'
);

update app.environments
set area_latitude = null, area_longitude = null, area_radius_km = null
where id = '00000000-0000-4000-8000-0000000000e1';

select is(
  app.refresh_search_environments(array['00000000-0000-4000-8000-0000000000e1'::uuid]),
  1,
  'a removed area leaves the index with the next refresh'
);

select is(
  (select area_latitude from app.search_environments
    where environment_id = '00000000-0000-4000-8000-0000000000e1'),
  null,
  'the indexed environment no longer has an area'
);

select finish();
rollback;
