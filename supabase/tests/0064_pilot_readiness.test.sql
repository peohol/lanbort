begin;

select plan(21);

-- The readiness checklist of the pilot (pilot-ui.md «Gjennomføring per
-- fase»): what the server's checks found and what the lead confirmed are
-- only added, only by the lead, and only while the campaign is open.

-- Users: a lead (b1) and someone else (b2).
insert into app.users (id, status, adult_confirmed_at) values
  ('00000000-0000-4000-8000-0000000064b1', 'active', now()),
  ('00000000-0000-4000-8000-0000000064b2', 'active', now());

insert into app.verified_contacts (user_id, kind, address, verified_at) values
  ('00000000-0000-4000-8000-0000000064b1', 'email', 'klar@example.no', now());

select app.grant_pilot_lead('klar@example.no', 'Produkteier');

-- One open campaign at a time: whatever else is open, closes here.
update app.pilot_campaigns
set closed_at = greatest(now(), started_at), closed_by = started_by
where closed_at is null;

insert into app.pilot_campaigns (id, name, started_at, started_by) values
  ('00000000-0000-4000-8000-0000000064d1', 'Klargjøring', now(),
   '00000000-0000-4000-8000-0000000064b1');

select lives_ok(
  $$
    insert into app.pilot_readiness_checks (campaign_id, requirement_id,
      status, summary, details, links, recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', 'ci', 'passed',
      'Alle testene er grønne.', '{"quality: success"}',
      '[{"label": "GitHub", "href": "https://github.com"}]', now(),
      '00000000-0000-4000-8000-0000000064b1')
  $$,
  'the lead records what a check found'
);

select throws_ok(
  $$
    insert into app.pilot_readiness_checks (campaign_id, requirement_id,
      status, summary, recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', 'ci', 'passed', 'Grønt',
      now(), '00000000-0000-4000-8000-0000000064b2')
  $$,
  '42501',
  null,
  'nobody but the lead records a check'
);

select throws_ok(
  $$
    insert into app.pilot_readiness_checks (campaign_id, requirement_id,
      status, summary, recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', 'ci', 'fine', 'Grønt',
      now(), '00000000-0000-4000-8000-0000000064b1')
  $$,
  '23514',
  null,
  'a check passed, failed or could not run'
);

select throws_ok(
  $$ update app.pilot_readiness_checks set status = 'failed' $$,
  '23001',
  null,
  'what a check found is never rewritten'
);

select throws_ok(
  $$ delete from app.pilot_readiness_checks $$,
  '23001',
  null,
  'what a check found is never deleted'
);

-- The newest check or confirmation is the one written last; no writer
-- chooses its place in that order.
select throws_ok(
  $$
    insert into app.pilot_readiness_checks (position, campaign_id,
      requirement_id, status, summary, recorded_at, recorded_by)
    values (9000000000, '00000000-0000-4000-8000-0000000064d1', 'ci', 'passed',
      'Grønt', now(), '00000000-0000-4000-8000-0000000064b1')
  $$,
  '428C9',
  null,
  'a check takes its place in the order as it is written'
);

select throws_ok(
  $$
    insert into app.pilot_readiness_confirmations (position, campaign_id,
      requirement_id, confirmed, recorded_at, recorded_by)
    values (9000000000, '00000000-0000-4000-8000-0000000064d1', 'consent',
      false, now(), '00000000-0000-4000-8000-0000000064b1')
  $$,
  '428C9',
  null,
  'a confirmation takes its place in the order as it is written'
);

select lives_ok(
  $$
    insert into app.pilot_readiness_confirmations (campaign_id,
      requirement_id, confirmed, note, recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', 'consent', true,
      'Informasjon og samtykke på e-post.', now(),
      '00000000-0000-4000-8000-0000000064b1')
  $$,
  'the lead confirms a requirement, saying how it was checked'
);

select throws_ok(
  $$
    insert into app.pilot_readiness_confirmations (campaign_id,
      requirement_id, confirmed, recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', 'backup', true, now(),
      '00000000-0000-4000-8000-0000000064b1')
  $$,
  '23514',
  null,
  'a confirmation always says how it was checked'
);

select throws_ok(
  $$
    insert into app.pilot_readiness_confirmations (campaign_id,
      requirement_id, confirmed, note, recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', 'backup', true, 'Ja',
      now(), '00000000-0000-4000-8000-0000000064b2')
  $$,
  '42501',
  null,
  'nobody but the lead confirms anything'
);

select throws_ok(
  $$ update app.pilot_readiness_confirmations set note = 'Noe annet' $$,
  '23001',
  null,
  'a confirmation is never rewritten; it is taken back with a new row'
);

select lives_ok(
  $$
    insert into app.pilot_readiness_approvals (campaign_id, phase,
      requirements, checked_at, recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', 0,
      '[{"id": "ci", "status": "passed"}]', now(), now(),
      '00000000-0000-4000-8000-0000000064b1')
  $$,
  'the lead''s approval keeps the checklist as it stood'
);

select throws_ok(
  $$
    insert into app.pilot_readiness_approvals (campaign_id, phase,
      requirements, recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', 0,
      '[{"id": "ci", "status": "passed"}]', now(),
      '00000000-0000-4000-8000-0000000064b1')
  $$,
  '23505',
  null,
  'a phase is approved once'
);

select throws_ok(
  $$
    insert into app.pilot_readiness_approvals (campaign_id, phase,
      requirements, recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', 1,
      '[{"id": "ci", "status": "passed"}]', now(),
      '00000000-0000-4000-8000-0000000064b2')
  $$,
  '42501',
  null,
  'nobody but the lead approves a checklist'
);

select throws_ok(
  $$ update app.pilot_readiness_approvals set requirements = '[]' $$,
  '23001',
  null,
  'an approved checklist is never rewritten'
);

select lives_ok(
  $$
    insert into app.pilot_readiness_test_emails (campaign_id, accepted, code,
      recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', false, 'invalid_from',
      now(), '00000000-0000-4000-8000-0000000064b1')
  $$,
  'a test e-mail to the lead is recorded, with the provider''s code'
);

select throws_ok(
  $$
    insert into app.pilot_readiness_test_emails (campaign_id, accepted,
      recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', true, now(),
      '00000000-0000-4000-8000-0000000064b2')
  $$,
  '42501',
  null,
  'test e-mails go to the lead only'
);

select throws_ok(
  $$
    insert into app.pilot_readiness_test_emails (campaign_id, accepted, code,
      recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', true, 'invalid_from',
      now(), '00000000-0000-4000-8000-0000000064b1')
  $$,
  '23514',
  null,
  'a test e-mail that was taken carries no refusal'
);

select throws_ok(
  $$ delete from app.pilot_readiness_test_emails $$,
  '23001',
  null,
  'a test e-mail record is never deleted'
);

update app.pilot_campaigns
set closed_at = now(), closed_by = '00000000-0000-4000-8000-0000000064b1'
where id = '00000000-0000-4000-8000-0000000064d1';

select throws_ok(
  $$
    insert into app.pilot_readiness_confirmations (campaign_id,
      requirement_id, confirmed, recorded_at, recorded_by)
    values ('00000000-0000-4000-8000-0000000064d1', 'consent', false, now(),
      '00000000-0000-4000-8000-0000000064b1')
  $$,
  '23001',
  null,
  'a closed campaign''s checklist takes nothing'
);

select ok(
  not has_table_privilege('authenticated', 'app.pilot_readiness_checks', 'SELECT')
    and not has_table_privilege('anon', 'app.pilot_readiness_checks', 'SELECT')
    and not has_table_privilege('authenticated', 'app.pilot_readiness_confirmations', 'SELECT')
    and not has_table_privilege('anon', 'app.pilot_readiness_confirmations', 'SELECT')
    and not has_table_privilege('authenticated', 'app.pilot_readiness_approvals', 'SELECT')
    and not has_table_privilege('anon', 'app.pilot_readiness_approvals', 'SELECT')
    and not has_table_privilege('authenticated', 'app.pilot_readiness_test_emails', 'SELECT')
    and not has_table_privilege('anon', 'app.pilot_readiness_test_emails', 'SELECT'),
  'no client role reads the checklist'
);

select * from finish();
rollback;
