-- The pilot's tests tell the tester what to have ready, the steps to take
-- and what must be seen to pass (pilot-ui.md «Ett testkort»). A revision
-- keeps all of it, so a run keeps the instructions it was tried against.
-- Revisions written before this have none.
alter table app.pilot_case_revisions
  add column prepare text[] not null default '{}',
  add column steps text[] not null default '{}',
  add column pass_when text[] not null default '{}',
  add constraint pilot_case_revisions_instructions_size check (
    cardinality(prepare) <= 20
    and cardinality(steps) <= 40
    and cardinality(pass_when) <= 20
    and char_length(array_to_string(prepare || steps || pass_when, '')) <= 20000
  );
