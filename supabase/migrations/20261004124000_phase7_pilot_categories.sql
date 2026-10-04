-- WP-74: the pilot's categories (PS-OBJ-018, OD-0006).
--
-- One flat list of main categories, as data. "Annet" stays last as the
-- safety valve for ordinary, harmless things. What the pilot keeps out
-- (PS-OBJ-019) deliberately has no category. Subcategories and retirements
-- arrive in later migrations when pilot content shows the need.

insert into app.object_categories (id, label, position)
values
  ('verktoy', 'Verktøy', 10),
  ('hage', 'Hage og uteområde', 20),
  ('friluft', 'Friluftsliv og tur', 30),
  ('sport', 'Sport og trening', 40),
  ('sykkel', 'Sykler og sykkelutstyr', 50),
  ('barn', 'Barn og baby', 60),
  ('kjokken', 'Kjøkken og husholdning', 70),
  ('elektronikk', 'Elektronikk og foto', 80),
  ('fest', 'Fest og selskap', 90),
  ('hobby', 'Hobby og musikk', 100),
  ('boker_spill', 'Bøker, spill og leker', 110),
  ('klaer', 'Klær og kostymer', 120);

-- A choice is never ambiguous: two selectable categories under the same
-- parent cannot share a name. A retired one may (PS-OBJ-018).
create unique index object_categories_selectable_label
  on app.object_categories (coalesce(parent_id, ''), lower(label))
  where retired_at is null;

comment on table app.object_categories is
  'Shared object category structure (PS-OBJ-002); the pilot categories are PS-OBJ-018.';
