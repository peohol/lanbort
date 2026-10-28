-- The pilot's readiness checklist (pilot-ui.md «Gjennomføring per fase»):
-- what must hold before a phase may end, and how each requirement was
-- found to hold. The requirements themselves are in the catalogue in the
-- repository (`pilotRequirements`), like the tests.
--
-- Two records, both append-only and only for the lead of an open campaign:
-- what the server's automatic checks found, each time they were run, and
-- what the lead confirmed by hand (or took back), with how it was checked.
-- A phase only ends when every requirement of it holds now, which the
-- server decides from these rows (pgTAP 0064).

-- One requirement's automatic check, as the server ran it: the outcome in
-- plain words, the technical details behind it and links to the sources.
create table app.pilot_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references app.pilot_campaigns (id),
  requirement_id text not null check (requirement_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  status text not null check (status in ('passed', 'failed', 'unchecked')),
  summary text not null check (char_length(summary) between 1 and 300),
  details text[] not null default '{}' check (
    cardinality(details) <= 12
    and char_length(array_to_string(details, '')) <= 3000
  ),
  -- [{ "label": …, "href": "https://…" }], at most a handful.
  links jsonb not null default '[]'::jsonb check (
    jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 6
  ),
  recorded_at timestamptz not null,
  recorded_by uuid not null references app.users (id)
);

create index pilot_readiness_checks_latest
  on app.pilot_readiness_checks (campaign_id, requirement_id, recorded_at desc);

-- A requirement the lead checks by hand: confirmed with how it was checked,
-- or a confirmation taken back. The newest row stands.
create table app.pilot_readiness_confirmations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references app.pilot_campaigns (id),
  requirement_id text not null check (requirement_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  confirmed boolean not null,
  note text check (char_length(note) between 1 and 1000),
  recorded_at timestamptz not null,
  recorded_by uuid not null references app.users (id),
  -- A confirmation says how it was checked; taking one back says nothing.
  check (confirmed = (note is not null))
);

create index pilot_readiness_confirmations_latest
  on app.pilot_readiness_confirmations (campaign_id, requirement_id, recorded_at desc);

create function app.guard_pilot_readiness()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if not app.pilot_campaign_open(new.campaign_id) then
    raise exception 'a closed campaign takes no changes'
      using errcode = 'restrict_violation';
  end if;

  if not app.pilot_lead_active(new.recorded_by) then
    raise exception 'only a pilot lead records readiness'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_pilot_readiness() from public;

create trigger pilot_readiness_checks_guard
  before insert on app.pilot_readiness_checks
  for each row execute function app.guard_pilot_readiness();

create trigger pilot_readiness_checks_append_only
  before update or delete on app.pilot_readiness_checks
  for each row execute function app.reject_append_only_mutation();

create trigger pilot_readiness_confirmations_guard
  before insert on app.pilot_readiness_confirmations
  for each row execute function app.guard_pilot_readiness();

create trigger pilot_readiness_confirmations_append_only
  before update or delete on app.pilot_readiness_confirmations
  for each row execute function app.reject_append_only_mutation();

comment on table app.pilot_readiness_checks is
  'The pilot readiness checklist: each automatic check of a requirement, as the server ran it (pilot-ui.md). Append-only.';
comment on table app.pilot_readiness_confirmations is
  'The pilot readiness checklist: requirements the lead confirmed by hand, with how, or took back (pilot-ui.md). Append-only.';
