-- PS-COM-020: a report or a mediation is closed with a short closing
-- message to its parties, written by the handler who closes it. It is the
-- case's last entry, and the case is closed in the same step.

alter table app.case_entries add column closing boolean not null default false;

comment on column app.case_entries.closing is
  'The closing message to the parties of a report or mediation (PS-COM-020); one per case, written as it is closed.';

alter table app.case_entries add constraint case_entries_closing check (
  not closing
  or (capacity = 'handler' and audience = 'parties' and corrects_entry_id is null)
);

create unique index case_entries_one_closing
  on app.case_entries (case_id)
  where closing;

-- The kinds of case that are closed with a closing message.
create function app.case_closes_with_message(kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select kind in (
    'loan_mediation', 'unavailability_report', 'environment_report', 'platform_report'
  );
$$;

revoke execute on function app.case_closes_with_message(text) from public;

-- A closing message is written only in an open case of a kind that has one
-- (who may write it is `app.guard_new_case_entry`'s: the acting handler).
create function app.guard_new_case_closing_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
begin
  select * into c from app.cases where id = new.case_id;

  if c.status <> 'open' or not app.case_closes_with_message(c.kind) then
    raise exception 'case % cannot get a closing message', new.case_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_case_closing_entry() from public;

create trigger case_entries_closing_guard
  before insert on app.case_entries
  for each row
  when (new.closing)
  execute function app.guard_new_case_closing_entry();

-- Such a case is closed only once its closing message is written. Cases
-- closed before this rule keep the history they have.
create function app.guard_case_closed_with_message()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
begin
  select * into c from app.cases where id = new.case_id;

  if app.case_closes_with_message(c.kind) and not exists (
    select 1 from app.case_entries where case_id = c.id and closing
  ) then
    raise exception 'case % is closed with a closing message', new.case_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_case_closed_with_message() from public;

create trigger case_actions_closing_message
  before insert on app.case_actions
  for each row
  when (new.kind = 'closed')
  execute function app.guard_case_closed_with_message();

-- By commit, a closing message belongs to a closed case: it is never left
-- standing in a case that goes on.
create function app.ensure_case_closing_entry_closed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from app.cases where id = new.case_id and status <> 'closed'
  ) then
    raise exception 'case % has a closing message but is open', new.case_id
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

revoke execute on function app.ensure_case_closing_entry_closed() from public;

create constraint trigger case_entries_closing_closed
  after insert on app.case_entries
  deferrable initially deferred
  for each row
  when (new.closing)
  execute function app.ensure_case_closing_entry_closed();
