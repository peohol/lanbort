-- The pilot's readiness checklist (pilot-ui.md «Gjennomføring per fase»):
-- what must hold before a phase may end, and how each requirement was
-- found to hold. The requirements themselves are in the catalogue in the
-- repository (`pilotRequirements`), like the tests.
--
-- Four records, all append-only and only for the lead of an open campaign:
-- what the server's automatic checks found, each time they were run, what
-- the lead confirmed by hand (or took back), with how it was checked, the
-- test e-mails the e-mail check sent, and the checklist as it stood when
-- its phase ended. A phase only ends when
-- every requirement of it holds now, which the server decides from these
-- rows (pgTAP 0064). Which check or confirmation is the newest is its
-- `position`, given when the row is written, after the campaign is locked:
-- the one written last stands, whatever time its request began at.

-- One requirement's automatic check, as the server ran it: the outcome in
-- plain words, the technical details behind it and links to the sources.
create table app.pilot_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  position bigint generated always as identity unique,
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
  on app.pilot_readiness_checks (campaign_id, requirement_id, position desc);

-- A requirement the lead checks by hand: confirmed with how it was checked,
-- or a confirmation taken back. The row written last stands.
create table app.pilot_readiness_confirmations (
  id uuid primary key default gen_random_uuid(),
  position bigint generated always as identity unique,
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
  on app.pilot_readiness_confirmations (campaign_id, requirement_id, position desc);

-- A phase's checklist as it stood the moment the phase ended on it: what
-- the lead approved, kept as it was, since an automatic check only counts
-- for an hour and the journal goes on changing. One per phase.
create table app.pilot_readiness_approvals (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references app.pilot_campaigns (id),
  phase smallint not null check (phase between 0 and 5),
  -- The requirements' standings, in the shape the app shows them.
  requirements jsonb not null check (
    jsonb_typeof(requirements) = 'array'
    and jsonb_array_length(requirements) between 1 and 40
    and octet_length(requirements::text) <= 200000
  ),
  checked_at timestamptz,
  recorded_at timestamptz not null,
  recorded_by uuid not null references app.users (id),
  unique (campaign_id, phase)
);

-- A test message the e-mail check sent to the lead, when no e-mail had gone
-- out lately, and whether the provider took it. At most one in a while per
-- campaign; the check reuses the newest within that while.
create table app.pilot_readiness_test_emails (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references app.pilot_campaigns (id),
  accepted boolean not null,
  -- The provider's refusal, as a machine code; never the address.
  code text check (code ~ '^[a-z][a-z0-9_]{0,39}$'),
  recorded_at timestamptz not null,
  recorded_by uuid not null references app.users (id),
  check (accepted = (code is null))
);

create index pilot_readiness_test_emails_latest
  on app.pilot_readiness_test_emails (campaign_id, recorded_at desc);

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

create trigger pilot_readiness_test_emails_guard
  before insert on app.pilot_readiness_test_emails
  for each row execute function app.guard_pilot_readiness();

create trigger pilot_readiness_test_emails_append_only
  before update or delete on app.pilot_readiness_test_emails
  for each row execute function app.reject_append_only_mutation();

create trigger pilot_readiness_approvals_guard
  before insert on app.pilot_readiness_approvals
  for each row execute function app.guard_pilot_readiness();

create trigger pilot_readiness_approvals_append_only
  before update or delete on app.pilot_readiness_approvals
  for each row execute function app.reject_append_only_mutation();

comment on table app.pilot_readiness_checks is
  'The pilot readiness checklist: each automatic check of a requirement, as the server ran it (pilot-ui.md). Append-only.';
comment on table app.pilot_readiness_confirmations is
  'The pilot readiness checklist: requirements the lead confirmed by hand, with how, or took back (pilot-ui.md). Append-only.';
comment on table app.pilot_readiness_approvals is
  'The pilot readiness checklist of a phase as it stood when the phase ended on it (pilot-ui.md). Append-only.';
comment on table app.pilot_readiness_test_emails is
  'The pilot readiness checklist: test e-mails the e-mail check sent to the lead, and whether the provider took them (pilot-ui.md). Append-only.';
