-- WP-61: Finn and the derived search index (ADR-0005, UX-P20).
--
-- The index is derived, never a source of truth for access or availability.
-- It holds only what can be discovered: the searchable text of active
-- objects that are actively published somewhere, and of open and closed
-- environments that take new members. Hidden environments are never indexed
-- (PS-ENV-001), and no row says where an object is published or who owns
-- it. A search uses the index only to match text; who finds what, and what
-- is actually available, is decided against the domain core in the same
-- query (`discoverablePublications`, `app.environments`).
--
-- The rows are rebuilt from the authoritative tables by the outbox consumer
-- `search_index.refresh` after each relevant change, and the scheduled job
-- reconciles the whole index for changes that record no event (such as a
-- publication ended by losing access). Deleting an object or an environment
-- deletes its row at once.

-- Searchable text of one field: Norwegian stems for whole words, and the
-- plain words, so a search also finds what begins with what was typed.
create function app.search_terms(content text)
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select to_tsvector('pg_catalog.norwegian', coalesce(content, ''))
    || to_tsvector('pg_catalog.simple', coalesce(content, ''));
$$;

revoke execute on function app.search_terms(text) from public;

-- A document from its most to its least important text.
create function app.search_document(primary_text text, secondary_text text, body text)
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select setweight(app.search_terms(primary_text), 'A')
    || setweight(app.search_terms(secondary_text), 'B')
    || setweight(app.search_terms(body), 'C');
$$;

revoke execute on function app.search_document(text, text, text) from public;

-- What the user typed, as a query: the words as Norwegian stems
-- («sykler» finds «sykkel»), or every word as the beginning of a word
-- («bor» finds «bormaskin»). Never parsed as query syntax, so any text is
-- safe; text without words matches nothing.
create function app.search_query(search text)
returns tsquery
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when prefixes.query is null then stems.query
    else stems.query || prefixes.query
  end
  from (select websearch_to_tsquery('pg_catalog.norwegian', search) as query) as stems,
    (
      select to_tsquery(
        'pg_catalog.simple',
        string_agg(quote_literal(term.lexeme) || ':*', ' & ')
      ) as query
      from unnest(to_tsvector('pg_catalog.simple', search)) as term
      where char_length(term.lexeme) >= 2 and term.lexeme !~ '[''\\]'
    ) as prefixes;
$$;

revoke execute on function app.search_query(text) from public;

-- A category and every category below it (PS-OBJ-002).
create function app.object_category_subtree(root text)
returns setof text
language sql
stable
set search_path = ''
as $$
  with recursive tree (id) as (
    select id from app.object_categories where id = root
    union
    select category.id
    from app.object_categories as category
    join tree on category.parent_id = tree.id
  )
  select id from tree;
$$;

revoke execute on function app.object_category_subtree(text) from public;

create table app.search_objects (
  object_id uuid primary key references app.objects (id) on delete cascade,
  document tsvector not null,
  indexed_at timestamptz not null default clock_timestamp()
);

comment on table app.search_objects is
  'Derived search text of discoverable objects (ADR-0005). Never a source of access or availability.';

create index search_objects_document_idx on app.search_objects using gin (document);

create table app.search_environments (
  environment_id uuid primary key references app.environments (id) on delete cascade,
  document tsvector not null,
  indexed_at timestamptz not null default clock_timestamp()
);

comment on table app.search_environments is
  'Derived search text of open and closed environments (ADR-0005). Hidden ones are never indexed.';

create index search_environments_document_idx
  on app.search_environments using gin (document);

-- What the index should hold, derived from the authoritative tables. These
-- two views are the only definition of what is indexed.
create view app.search_object_sources as
select
  object.id as object_id,
  app.search_document(object.title, category.label, object.description) as document
from app.objects as object
join app.object_categories as category on category.id = object.category_id
where object.status = 'active'
  and exists (
    select 1 from app.environment_publications as publication
    where publication.object_id = object.id and publication.status = 'active'
  );

create view app.search_environment_sources as
select
  environment.id as environment_id,
  app.search_document(
    environment.name,
    concat_ws(' ', environment.object_focus, environment.audience, environment.location),
    environment.description
  ) as document
from app.environments as environment
where environment.type in ('open', 'closed')
  and environment.state = 'active';

-- Serializes refreshes: one of the given rows at a time, in a fixed order,
-- so the refresh that runs last always reads the latest committed state. A
-- whole-index refresh (no scope) excludes every other refresh of that table.
create function app.lock_search_entries(kind text, scope uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if scope is null then
    perform pg_advisory_xact_lock(hashtextextended('search:' || kind, 0));
    return;
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('search:' || kind, 0));
  perform pg_advisory_xact_lock(hashtextextended('search:' || kind || ':' || id, 0))
  from (select distinct unnest(scope)::text as id order by 1) as entry;
end;
$$;

revoke execute on function app.lock_search_entries(text, uuid[]) from public;

-- Brings the index rows of the given objects (all, without scope) in line
-- with their sources. Returns how many rows it changed; a repeated call
-- changes nothing.
create function app.refresh_search_objects(scope uuid[] default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removed integer;
  written integer;
begin
  perform app.lock_search_entries('object', scope);

  delete from app.search_objects as entry
  where (scope is null or entry.object_id = any(scope))
    and not exists (
      select 1 from app.search_object_sources as source
      where source.object_id = entry.object_id
    );
  get diagnostics removed = row_count;

  insert into app.search_objects as entry (object_id, document)
  select source.object_id, source.document
  from app.search_object_sources as source
  where scope is null or source.object_id = any(scope)
  on conflict (object_id) do update
    set document = excluded.document, indexed_at = clock_timestamp()
    where entry.document is distinct from excluded.document;
  get diagnostics written = row_count;

  return removed + written;
end;
$$;

revoke execute on function app.refresh_search_objects(uuid[]) from public;

create function app.refresh_search_environments(scope uuid[] default null)
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

  insert into app.search_environments as entry (environment_id, document)
  select source.environment_id, source.document
  from app.search_environment_sources as source
  where scope is null or source.environment_id = any(scope)
  on conflict (environment_id) do update
    set document = excluded.document, indexed_at = clock_timestamp()
    where entry.document is distinct from excluded.document;
  get diagnostics written = row_count;

  return removed + written;
end;
$$;

revoke execute on function app.refresh_search_environments(uuid[]) from public;

-- Builds the whole index from the authoritative tables. Also how the index
-- is rebuilt after a restore (WP-72).
create function app.reconcile_search_index()
returns integer
language sql
set search_path = ''
as $$
  select app.refresh_search_objects(null) + app.refresh_search_environments(null);
$$;

revoke execute on function app.reconcile_search_index() from public;

-- What exists already.
select app.reconcile_search_index();
