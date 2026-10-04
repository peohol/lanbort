begin;

select plan(5);

-- WP-74: the pilot's flat list of main categories, Annet last (PS-OBJ-018).
select results_eq(
  $$
    select id from app.object_categories
    where parent_id is null and retired_at is null
    order by position, label
  $$,
  $$
    values ('verktoy'), ('hage'), ('friluft'), ('sport'), ('sykkel'),
      ('barn'), ('kjokken'), ('elektronikk'), ('fest'), ('hobby'),
      ('boker_spill'), ('klaer'), ('annet')
  $$,
  'the pilot categories, in order'
);

select throws_ok(
  $$ insert into app.object_categories (id, label) values ('pgtap_tools', 'verktøy') $$,
  '23505',
  null,
  'two selectable main categories cannot share a name'
);

select lives_ok(
  $$ insert into app.object_categories (id, parent_id, label) values ('pgtap_other', 'verktoy', 'Annet') $$,
  'the same name under another parent is a different choice'
);

select lives_ok(
  $$
    insert into app.object_categories (id, label, retired_at)
    values ('pgtap_retired', 'Verktøy', now())
  $$,
  'a retired category may share a name'
);

select throws_ok(
  $$ update app.object_categories set retired_at = null where id = 'pgtap_retired' $$,
  '23505',
  null,
  'and cannot come back while the name is taken'
);

select * from finish();
rollback;
