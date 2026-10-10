-- PS-COM-021: whoever opened a case may end it, but never stop an assessment
-- that is needed.
-- - The member who contacted the administrators closes the contact
--   themselves while it is open (`closed`, by them).
-- - A reporter withdraws their report (`withdrawn`): it is recorded, but
--   nothing they sent is removed, and the case stays open for a handler to
--   finish the assessment and any measure, and to close it.
-- - Nobody else who takes part closes a case: a mediation is closed only by
--   an impartial handler.

alter table app.case_actions drop constraint case_actions_kind_check;
alter table app.case_actions add constraint case_actions_kind_check check (kind in (
  'assigned', 'released', 'returned_to_queue', 'round_opened', 'statements_shared',
  'recused', 'closed', 'withdrawn'
));

comment on table app.case_actions is
  'The append-only history of what was done in a case: assignment, rounds, sharing, recusal, withdrawal, closing.';

-- As in WP-45, with a contact also closed by the member who opened it, and
-- a report withdrawn, once, by its reporter.
create or replace function app.guard_new_case_action()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
begin
  select * into c from app.cases where id = new.case_id;

  if c.status <> 'open'
    or not coalesce(case new.kind
      when 'assigned' then
        app.case_handler(c, new.target_user_id, new.at)
        and case
          when new.actor_user_id = new.target_user_id then c.assignee_user_id is null
          else c.assignee_user_id = new.actor_user_id
            and app.case_handler(c, new.actor_user_id, new.at)
        end
      when 'released' then
        c.assignee_user_id = new.actor_user_id
        and app.case_handler(c, new.actor_user_id, new.at)
      when 'returned_to_queue' then
        c.assignee_user_id = new.target_user_id
        and not app.case_handler(c, new.target_user_id, new.at)
      when 'recused' then
        app.case_handler(c, new.actor_user_id, new.at)
        and c.assignee_user_id is distinct from new.actor_user_id
      when 'round_opened' then
        app.case_handler_acts(c, new.actor_user_id, new.at)
        and c.kind <> 'environment_contact'
        and (new.target_user_id is null or exists (
          select 1 from app.case_participants
          where case_id = c.id and user_id = new.target_user_id
        ))
      when 'statements_shared' then
        app.case_handler_acts(c, new.actor_user_id, new.at)
        and c.kind = 'loan_mediation'
      when 'closed' then
        app.case_handler_acts(c, new.actor_user_id, new.at)
        or (c.kind = 'environment_contact' and new.actor_user_id = c.opened_by_user_id)
      when 'withdrawn' then
        c.kind in ('unavailability_report', 'environment_report', 'platform_report')
        and new.actor_user_id = c.opened_by_user_id
        and not exists (
          select 1 from app.case_actions where case_id = c.id and kind = 'withdrawn'
        )
    end, false)
  then
    raise exception 'case % cannot get this action', new.case_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;
