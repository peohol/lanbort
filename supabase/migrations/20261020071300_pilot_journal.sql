-- The closed pilot's own journal (docs/implementation/pilot-ui.md): who
-- leads the pilot and who takes part, the campaign and its phase, every
-- test run, the defects found, the tasks given to participants and what
-- they reported, and a record of every change. It is kept apart from
-- Lånbort's ordinary data: nothing here is read by the product, and
-- nothing in the product points here. Participants appear by pseudonym;
-- only `pilot_participants` links a pseudonym to an account, and the link
-- goes with the account or after the pilot (`data.purge_expired`).
--
-- Results are never rewritten: a run, a report and a record are only ever
-- added, and a test tried again is a new run. A closed campaign takes
-- nothing new. The server checks who may do what; these tables check it
-- again (pgTAP 0063).

-- Pilot leads. Only the database owner grants the role
-- (`app.grant_pilot_lead`), never the app's own server role, so no request
-- to the app can make anyone a lead. Ending it is open to the server, which
-- ends it when the account is deleted.
create table app.pilot_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  granted_at timestamptz not null default now(),
  grant_reason text not null check (char_length(grant_reason) between 1 and 500),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= granted_at)
);

create unique index pilot_leads_one_active
  on app.pilot_leads (user_id)
  where revoked_at is null;

create function app.guard_pilot_lead()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'lanbort_app' then
      raise exception 'only the database owner grants the pilot lead role'
        using errcode = 'insufficient_privilege';
    end if;
  elsif old.revoked_at is not null
    or new.revoked_at is null
    or (new.id, new.user_id, new.granted_at, new.grant_reason)
      is distinct from (old.id, old.user_id, old.granted_at, old.grant_reason)
  then
    raise exception 'a pilot lead can only be ended, once'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_pilot_lead() from public;

create trigger pilot_leads_guard
  before insert or update on app.pilot_leads
  for each row execute function app.guard_pilot_lead();

create trigger pilot_leads_no_delete
  before delete on app.pilot_leads
  for each row execute function app.reject_append_only_mutation();

-- For the database owner, in Supabase's SQL editor: makes the account with
-- this verified address a pilot lead, with why.
create function app.grant_pilot_lead(email text, reason text)
  returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  target uuid;
  granted uuid;
begin
  select user_id into target
  from app.verified_contacts
  where kind = 'email' and address = lower(trim(email));

  if target is null then
    raise exception 'no account has that address' using errcode = 'no_data_found';
  end if;

  insert into app.pilot_leads (user_id, grant_reason)
  values (target, reason)
  returning id into granted;

  return granted;
end;
$$;

create function app.revoke_pilot_lead(email text)
  returns integer
  language sql
  set search_path = ''
as $$
  with ended as (
    update app.pilot_leads set revoked_at = now()
    where revoked_at is null
      and user_id = (
        select user_id from app.verified_contacts
        where kind = 'email' and address = lower(trim(email))
      )
    returning 1
  )
  select count(*)::integer from ended;
$$;

revoke execute on function app.grant_pilot_lead(text, text) from public;
revoke execute on function app.revoke_pilot_lead(text) from public;

-- Participants, by pseudonym (P-01, P-02, …). A participant who leaves or
-- whose link is no longer kept stays as a pseudonym only.
create table app.pilot_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app.users (id),
  pseudonym text not null unique check (pseudonym ~ '^P-[0-9]{2,3}$'),
  added_at timestamptz not null,
  added_by uuid not null references app.users (id),
  removed_at timestamptz,
  removed_by uuid references app.users (id),
  check (removed_at is not null or user_id is not null),
  check (removed_at is null or removed_at >= added_at)
);

create unique index pilot_participants_one_active
  on app.pilot_participants (user_id)
  where removed_at is null;

create function app.guard_pilot_participant_update()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Removed once, then only the link to the account may go.
  if (new.id, new.pseudonym, new.added_at, new.added_by)
      is distinct from (old.id, old.pseudonym, old.added_at, old.added_by)
    or (old.removed_at is not null
      and (new.removed_at, new.removed_by) is distinct from (old.removed_at, old.removed_by))
    or (new.user_id is distinct from old.user_id and new.user_id is not null)
  then
    raise exception 'a participant can only be removed, and then unlinked'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_pilot_participant_update() from public;

create trigger pilot_participants_guard
  before update on app.pilot_participants
  for each row execute function app.guard_pilot_participant_update();

create trigger pilot_participants_no_delete
  before delete on app.pilot_participants
  for each row execute function app.reject_append_only_mutation();

-- A campaign: the pilot run from start to close, one open at a time. Only
-- its phase changes while it is open; closing it is final.
create table app.pilot_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  phase smallint not null default 0 check (phase between 0 and 5),
  started_at timestamptz not null,
  started_by uuid not null references app.users (id),
  closed_at timestamptz,
  closed_by uuid references app.users (id),
  check ((closed_at is null) = (closed_by is null)),
  check (closed_at is null or closed_at >= started_at)
);

create unique index pilot_campaigns_one_open
  on app.pilot_campaigns ((true))
  where closed_at is null;

create function app.guard_pilot_campaign_update()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.closed_at is not null
    or (new.id, new.name, new.started_at, new.started_by)
      is distinct from (old.id, old.name, old.started_at, old.started_by)
  then
    raise exception 'a closed campaign takes no changes'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_pilot_campaign_update() from public;

create trigger pilot_campaigns_guard
  before update on app.pilot_campaigns
  for each row execute function app.guard_pilot_campaign_update();

create trigger pilot_campaigns_no_delete
  before delete on app.pilot_campaigns
  for each row execute function app.reject_append_only_mutation();

-- Whether the campaign takes new runs, defects, tasks and reports.
create function app.pilot_campaign_open(campaign uuid)
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select exists (
    select 1 from app.pilot_campaigns where id = campaign and closed_at is null
  );
$$;

create function app.pilot_lead_active(candidate uuid)
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select exists (
    select 1 from app.pilot_leads where user_id = candidate and revoked_at is null
  );
$$;

revoke execute on function app.pilot_campaign_open(uuid) from public;
revoke execute on function app.pilot_lead_active(uuid) from public;

-- The wording of a test as it was used: the catalogue in the repository is
-- the source, and each wording gets its own revision (a hash of it), so a
-- run keeps the wording it was tried against.
create table app.pilot_case_revisions (
  test_id text not null check (test_id ~ '^[AMTLKRDS][0-9]{2}$'),
  revision text not null check (revision ~ '^[0-9a-f]{12}$'),
  priority text not null check (priority in ('B', 'O', 'U')),
  action text not null check (char_length(action) between 1 and 500),
  expected text not null check (char_length(expected) between 1 and 500),
  first_used_at timestamptz not null default now(),
  primary key (test_id, revision)
);

create trigger pilot_case_revisions_append_only
  before update or delete on app.pilot_case_revisions
  for each row execute function app.reject_append_only_mutation();

-- Defects found in the pilot: what, how serious and where it stands. Only
-- severity and status change; `pilot_audit` records each change.
create table app.pilot_defects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references app.pilot_campaigns (id),
  number integer not null check (number > 0),
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) between 1 and 2000),
  link text check (link ~ '^https://' and char_length(link) <= 500),
  severity text not null check (severity in ('P0', 'P1', 'P2', 'P3')),
  status text not null default 'open'
    check (status in ('open', 'fixed', 'closed', 'deferred')),
  created_at timestamptz not null,
  created_by uuid not null references app.users (id),
  updated_at timestamptz not null,
  unique (campaign_id, number),
  -- A run that failed names its defect within the same campaign.
  unique (id, campaign_id)
);

create function app.guard_pilot_defect()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if not app.pilot_campaign_open(new.campaign_id) then
    raise exception 'a closed campaign takes no changes'
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'INSERT' then
    if not app.pilot_lead_active(new.created_by) then
      raise exception 'only a pilot lead reports defects'
        using errcode = 'insufficient_privilege';
    end if;
  elsif (new.id, new.campaign_id, new.number, new.title, new.description,
        new.link, new.created_at, new.created_by)
      is distinct from (old.id, old.campaign_id, old.number, old.title,
        old.description, old.link, old.created_at, old.created_by)
  then
    raise exception 'only a defect''s severity and status change'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_pilot_defect() from public;

create trigger pilot_defects_guard
  before insert or update on app.pilot_defects
  for each row execute function app.guard_pilot_defect();

create trigger pilot_defects_no_delete
  before delete on app.pilot_defects
  for each row execute function app.reject_append_only_mutation();

-- Every test run, as the lead recorded it. Append-only: trying a test again
-- is a new run, and the test's standing is its newest run.
create table app.pilot_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references app.pilot_campaigns (id),
  test_id text not null,
  revision text not null,
  status text not null
    check (status in ('passed', 'failed', 'blocked', 'retest', 'not_relevant')),
  recorded_at timestamptz not null,
  recorded_by uuid not null references app.users (id),
  tester_id uuid references app.pilot_participants (id),
  app_version text not null check (app_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  environment text check (environment in ('production', 'isolated')),
  device text check (device in ('mobile', 'tablet', 'desktop')),
  platform text check (char_length(platform) between 1 and 60),
  helped boolean,
  note text check (char_length(note) between 1 and 1000),
  defect_id uuid,
  foreign key (test_id, revision) references app.pilot_case_revisions,
  foreign key (defect_id, campaign_id) references app.pilot_defects (id, campaign_id),
  check (status not in ('failed', 'blocked', 'not_relevant') or note is not null),
  -- Only a test sent back to be tried again was not tried on a device.
  check (status = 'retest' or (environment is not null and device is not null)),
  check ((status = 'failed') = (defect_id is not null))
);

create index pilot_runs_by_test
  on app.pilot_runs (campaign_id, test_id, recorded_at desc);

create function app.guard_new_pilot_run()
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
    raise exception 'only a pilot lead records runs'
      using errcode = 'insufficient_privilege';
  end if;

  if new.tester_id is not null and not exists (
    select 1 from app.pilot_participants
    where id = new.tester_id and removed_at is null
  ) then
    raise exception 'the tester is not a participant'
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_pilot_run() from public;

create trigger pilot_runs_guard
  before insert on app.pilot_runs
  for each row execute function app.guard_new_pilot_run();

create trigger pilot_runs_append_only
  before update or delete on app.pilot_runs
  for each row execute function app.reject_append_only_mutation();

create trigger pilot_runs_no_truncate
  before truncate on app.pilot_runs
  for each statement execute function app.reject_append_only_mutation();

-- Tasks given to participants: a short goal for one test. A task is only
-- ever withdrawn, never changed. It gives no access to anything else.
create table app.pilot_assignments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references app.pilot_campaigns (id),
  test_id text not null check (test_id ~ '^[AMTLKRDS][0-9]{2}$'),
  participant_id uuid not null references app.pilot_participants (id),
  goal text not null check (char_length(goal) between 1 and 200),
  assigned_at timestamptz not null,
  assigned_by uuid not null references app.users (id),
  -- Null when it ended with the participant (removed, or the account deleted).
  withdrawn_by uuid references app.users (id),
  withdrawn_at timestamptz,
  check (withdrawn_by is null or withdrawn_at is not null)
);

create unique index pilot_assignments_one_open
  on app.pilot_assignments (campaign_id, test_id, participant_id)
  where withdrawn_at is null;

create index pilot_assignments_by_participant
  on app.pilot_assignments (participant_id);

create function app.guard_pilot_assignment()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if not app.pilot_campaign_open(new.campaign_id) then
    raise exception 'a closed campaign takes no changes'
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'INSERT' then
    if not app.pilot_lead_active(new.assigned_by) or new.withdrawn_at is not null then
      raise exception 'only a pilot lead gives tasks'
        using errcode = 'insufficient_privilege';
    end if;

    if not exists (
      select 1 from app.pilot_participants
      where id = new.participant_id and removed_at is null
    ) then
      raise exception 'tasks go to participants'
        using errcode = 'foreign_key_violation';
    end if;
  elsif old.withdrawn_at is not null
    or new.withdrawn_at is null
    or (new.id, new.campaign_id, new.test_id, new.participant_id, new.goal,
        new.assigned_at, new.assigned_by)
      is distinct from (old.id, old.campaign_id, old.test_id, old.participant_id,
        old.goal, old.assigned_at, old.assigned_by)
  then
    raise exception 'a task can only be withdrawn, once'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_pilot_assignment() from public;

create trigger pilot_assignments_guard
  before insert or update on app.pilot_assignments
  for each row execute function app.guard_pilot_assignment();

create trigger pilot_assignments_no_delete
  before delete on app.pilot_assignments
  for each row execute function app.reject_append_only_mutation();

-- What a participant reported about their own task: self-reported, never an
-- official result. Only its comment can go, when its time is up.
create table app.pilot_feedback (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references app.pilot_assignments (id),
  outcome text not null check (outcome in ('managed', 'stuck', 'needs_help')),
  comment text check (char_length(comment) between 1 and 500),
  reported_at timestamptz not null
);

create index pilot_feedback_by_assignment
  on app.pilot_feedback (assignment_id, reported_at desc);

create function app.guard_pilot_feedback()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from app.pilot_assignments as task
      join app.pilot_participants as participant on participant.id = task.participant_id
      where task.id = new.assignment_id
        and task.withdrawn_at is null
        and participant.removed_at is null
        and app.pilot_campaign_open(task.campaign_id)
    ) then
      raise exception 'only an open task of an open campaign takes reports'
        using errcode = 'restrict_violation';
    end if;
  elsif new.comment is not null
    or (new.id, new.assignment_id, new.outcome, new.reported_at)
      is distinct from (old.id, old.assignment_id, old.outcome, old.reported_at)
  then
    raise exception 'a report is only ever stripped of its comment'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_pilot_feedback() from public;

create trigger pilot_feedback_guard
  before insert or update on app.pilot_feedback
  for each row execute function app.guard_pilot_feedback();

create trigger pilot_feedback_no_delete
  before delete on app.pilot_feedback
  for each row execute function app.reject_append_only_mutation();

-- Who changed what in the journal, and when: codes and ids only, never
-- free text. Append-only.
create table app.pilot_audit (
  id uuid primary key default gen_random_uuid(),
  position bigint generated always as identity unique,
  at timestamptz not null default clock_timestamp(),
  actor_user_id uuid references app.users (id),
  actor_process text check (actor_process ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  action text not null check (action ~ '^[a-z][a-z_]{0,63}$'),
  campaign_id uuid references app.pilot_campaigns (id),
  subject_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  check ((actor_user_id is null) <> (actor_process is null))
);

create trigger pilot_audit_append_only
  before update or delete on app.pilot_audit
  for each row execute function app.reject_append_only_mutation();

create trigger pilot_audit_no_truncate
  before truncate on app.pilot_audit
  for each statement execute function app.reject_append_only_mutation();
