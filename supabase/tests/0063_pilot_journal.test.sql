begin;

select plan(24);

-- Users: a lead (b1), a participant (b2), someone else (b3).
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b2', 'active', now()),
  ('00000000-0000-4000-8000-0000000000b3', 'active', now());

insert into app.verified_contacts (user_id, kind, address, verified_at) values
  ('00000000-0000-4000-8000-0000000000b1', 'email', 'leder@example.no', now());

-- The role is granted only through the owner's function, by verified address.
select throws_ok(
  $$ select app.grant_pilot_lead('ingen@example.no', 'Produkteier') $$,
  'P0002',
  null,
  'the lead role goes only to an account with that verified address'
);

select lives_ok(
  $$ select app.grant_pilot_lead(' Leder@Example.no ', 'Produkteier') $$,
  'the database owner makes an account a pilot lead'
);

select throws_ok(
  $$ select app.grant_pilot_lead('leder@example.no', 'Igjen') $$,
  '23505',
  null,
  'an account is a lead once at a time'
);

select has_trigger('app', 'pilot_leads', 'pilot_leads_guard',
  'the server''s own role cannot make anyone a lead');

select ok(
  not has_function_privilege('authenticated', 'app.grant_pilot_lead(text, text)', 'EXECUTE')
    and not has_function_privilege('anon', 'app.grant_pilot_lead(text, text)', 'EXECUTE'),
  'no client role can grant the lead role'
);

select throws_ok(
  $$ delete from app.pilot_leads $$,
  '23001',
  null,
  'a lead role is never deleted'
);

insert into app.pilot_participants (id, user_id, pseudonym, added_at, added_by) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2',
   'P-01', now(), '00000000-0000-4000-8000-0000000000b1');

select throws_ok(
  $$
    insert into app.pilot_participants (user_id, pseudonym, added_at, added_by)
    values ('00000000-0000-4000-8000-0000000000b3', 'Kari', now(),
      '00000000-0000-4000-8000-0000000000b1')
  $$,
  '23514',
  null,
  'a participant is known by a pseudonym, never a name'
);

insert into app.pilot_campaigns (id, name, started_at, started_by) values
  ('00000000-0000-4000-8000-0000000000d1', 'Lukket pilot', now(),
   '00000000-0000-4000-8000-0000000000b1');

select throws_ok(
  $$
    insert into app.pilot_campaigns (name, started_at, started_by)
    values ('En til', now(), '00000000-0000-4000-8000-0000000000b1')
  $$,
  '23505',
  null,
  'one campaign is open at a time'
);

insert into app.pilot_case_revisions (test_id, revision, priority, action, expected)
values ('A01', 'aaaaaaaaaaaa', 'B', 'Logg inn.', 'Du er logget inn.');

select throws_ok(
  $$ update app.pilot_case_revisions set expected = 'Noe annet.' $$,
  '23001',
  null,
  'a stored wording never changes'
);

-- Runs: only a lead records them, and never rewrites them.
select lives_ok(
  $$
    insert into app.pilot_runs (id, campaign_id, test_id, revision, status,
      recorded_at, recorded_by, tester_id, app_version, environment, device)
    values ('00000000-0000-4000-8000-0000000000e1',
      '00000000-0000-4000-8000-0000000000d1', 'A01', 'aaaaaaaaaaaa', 'passed',
      now(), '00000000-0000-4000-8000-0000000000b1',
      '00000000-0000-4000-8000-0000000000c1', 'abc1234', 'production', 'mobile')
  $$,
  'the lead records a run'
);

select throws_ok(
  $$
    insert into app.pilot_runs (campaign_id, test_id, revision, status,
      recorded_at, recorded_by, app_version, environment, device)
    values ('00000000-0000-4000-8000-0000000000d1', 'A01', 'aaaaaaaaaaaa',
      'passed', now(), '00000000-0000-4000-8000-0000000000b2', 'abc1234',
      'production', 'mobile')
  $$,
  '42501',
  null,
  'a participant records no runs'
);

select throws_ok(
  $$
    insert into app.pilot_runs (campaign_id, test_id, revision, status,
      recorded_at, recorded_by, app_version, environment, device)
    values ('00000000-0000-4000-8000-0000000000d1', 'A01', 'aaaaaaaaaaaa',
      'blocked', now(), '00000000-0000-4000-8000-0000000000b1', 'abc1234',
      'production', 'mobile')
  $$,
  '23514',
  null,
  'a blocked run says why'
);

select throws_ok(
  $$
    insert into app.pilot_runs (campaign_id, test_id, revision, status,
      recorded_at, recorded_by, app_version, environment, device, note)
    values ('00000000-0000-4000-8000-0000000000d1', 'A01', 'aaaaaaaaaaaa',
      'failed', now(), '00000000-0000-4000-8000-0000000000b1', 'abc1234',
      'production', 'mobile', 'Feilet')
  $$,
  '23514',
  null,
  'a failed run names its defect'
);

select lives_ok(
  $$
    insert into app.pilot_runs (campaign_id, test_id, revision, status,
      recorded_at, recorded_by, app_version)
    values ('00000000-0000-4000-8000-0000000000d1', 'A01', 'aaaaaaaaaaaa',
      'retest', now(), '00000000-0000-4000-8000-0000000000b1', 'def5678')
  $$,
  'a retest is a new run, without a device'
);

select throws_ok(
  $$ update app.pilot_runs set status = 'failed' $$,
  '23001',
  null,
  'a run is never rewritten'
);

select throws_ok(
  $$ delete from app.pilot_runs $$,
  '23001',
  null,
  'a run is never deleted'
);

-- Defects: only severity and status change.
insert into app.pilot_defects (id, campaign_id, number, title, severity,
  created_at, created_by, updated_at)
values ('00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000d1', 1, 'Knappen svarer ikke', 'P1',
  now(), '00000000-0000-4000-8000-0000000000b1', now());

select lives_ok(
  $$ update app.pilot_defects set status = 'fixed', severity = 'P2' $$,
  'a defect''s severity and status change'
);

select throws_ok(
  $$ update app.pilot_defects set title = 'Noe annet' $$,
  '23001',
  null,
  'a defect''s description stays'
);

-- Tasks and reports.
insert into app.pilot_assignments (id, campaign_id, test_id, participant_id,
  goal, assigned_at, assigned_by)
values ('00000000-0000-4000-8000-0000000000a9',
  '00000000-0000-4000-8000-0000000000d1', 'A01',
  '00000000-0000-4000-8000-0000000000c1', 'Logg inn på mobilen', now(),
  '00000000-0000-4000-8000-0000000000b1');

select lives_ok(
  $$
    insert into app.pilot_feedback (assignment_id, outcome, comment, reported_at)
    values ('00000000-0000-4000-8000-0000000000a9', 'managed', 'Greit', now())
  $$,
  'a participant reports on an open task'
);

select throws_ok(
  $$ update app.pilot_feedback set outcome = 'stuck' $$,
  '23001',
  null,
  'a report is never rewritten, only stripped of its comment'
);

-- Closing the campaign is final, and it takes nothing new.
update app.pilot_campaigns
set closed_at = now(), closed_by = '00000000-0000-4000-8000-0000000000b1';

select throws_ok(
  $$ update app.pilot_campaigns set phase = 2 $$,
  '23001',
  null,
  'a closed campaign is not changed'
);

select throws_ok(
  $$
    insert into app.pilot_feedback (assignment_id, outcome, reported_at)
    values ('00000000-0000-4000-8000-0000000000a9', 'stuck', now())
  $$,
  '23001',
  null,
  'a closed campaign takes no reports'
);

-- A participant is removed once, then only unlinked from the account.
update app.pilot_participants
set removed_at = now(), removed_by = '00000000-0000-4000-8000-0000000000b1';

select lives_ok(
  $$ update app.pilot_participants set user_id = null $$,
  'a removed participant is unlinked from the account'
);

select throws_ok(
  $$
    update app.pilot_participants
    set user_id = '00000000-0000-4000-8000-0000000000b3'
  $$,
  '23001',
  null,
  'a pseudonym is never linked to another account'
);

select * from finish();
rollback;
