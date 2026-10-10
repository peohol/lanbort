-- PS-ADM-015 (OD-0026): a platform steward's intervention on an account,
-- an environment role or a thing starts from a case in the platform queue,
-- with impartiality, a basis and a record. Without a report, the steward
-- first opens a case of their own (`platform_inquiry`, «autorisert
-- saksgrunnlag») with the basis as its first entry, and takes it at once.
-- The steward who opens it is not a party to it; whoever it is about is,
-- as in a report.
--
-- Every intervention is recorded in `app.platform_interventions` with its
-- case and basis, by the steward who holds the case, and only toward what
-- the case is about: the account it names, or an owner of the thing it
-- names (`app.case_reported`), or that thing.

alter table app.cases
  drop constraint cases_kind_check,
  add constraint cases_kind_check check (kind in (
    'environment_contact', 'loan_mediation', 'unavailability_report',
    'environment_report', 'platform_report', 'platform_inquiry'
  )),
  drop constraint cases_context,
  add constraint cases_context check (
    case kind
      when 'environment_contact' then
        environment_id is not null and loan_id is null and subject_user_id is null
      when 'loan_mediation' then
        environment_id is not null and loan_id is not null and subject_user_id is null
      when 'unavailability_report' then
        environment_id is null and loan_id is null and subject_user_id is not null
        and subject_user_id <> opened_by_user_id
      when 'environment_report' then
        environment_id is not null and loan_id is null
        and report_target in ('user', 'object')
      when 'platform_report' then
        environment_id is null and loan_id is null
      when 'platform_inquiry' then
        environment_id is null and loan_id is null
        and report_target in ('user', 'object')
    end
    and (kind in ('environment_report', 'platform_report', 'platform_inquiry'))
      = (report_target is not null)
    and (escalated_from_case_id is null or kind = 'platform_report')
    and subject_user_id is distinct from opened_by_user_id
    and case report_target
      when 'user' then subject_user_id is not null and object_id is null and review_id is null
      when 'object' then subject_user_id is null and object_id is not null and review_id is null
      when 'review' then subject_user_id is not null and object_id is null and review_id is not null
      when 'review_response' then
        subject_user_id is not null and object_id is null and review_id is not null
      else object_id is null and review_id is null
    end
  );

create or replace function app.case_platform_kind(kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select kind in ('unavailability_report', 'platform_report', 'platform_inquiry');
$$;

-- As before, except that the steward who opened an inquiry is its handler,
-- not a party to it.
create or replace function app.case_involved(c app.cases, candidate uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (candidate = c.opened_by_user_id and c.kind <> 'platform_inquiry')
    or app.case_reported(c, candidate)
    or exists (
      select 1 from app.case_participants
      where case_id = c.id and user_id = candidate
    )
    or exists (
      select 1 from app.case_actions
      where case_id = c.id and kind = 'recused' and actor_user_id = candidate
    )
    or exists (
      select 1 from app.loan_reviews
      where id = c.review_id and candidate in (author_user_id, subject_user_id)
    )
    or exists (
      select 1 from app.loans as loan
      where loan.id = c.loan_id
        and (
          candidate in (loan.borrower_user_id, loan.responsible_lender_id)
          or candidate = any(loan.owner_ids_at_approval)
          or exists (
            select 1 from app.object_owners
            where object_id = loan.object_id and user_id = candidate
          )
          or exists (
            select 1 from app.loan_lender_transfers
            where loan_id = loan.id and candidate in (from_user_id, to_user_id)
          )
        )
    );
$$;

create or replace function app.guard_new_case()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source app.cases;
begin
  select * into source from app.cases where id = new.escalated_from_case_id;

  if new.status <> 'open'
    or new.assignee_user_id is not null
    or not exists (
      select 1 from app.users
      where id = new.opened_by_user_id
        and (status = 'active'
          or (new.kind = 'loan_mediation' and status not in ('pending_registration', 'deleted')))
    )
    or not coalesce(case new.kind
      when 'environment_contact' then exists (
        select 1 from app.environment_memberships
        where environment_id = new.environment_id
          and user_id = new.opened_by_user_id
          and state = 'active'
          and (transition_deadline is null or transition_deadline > new.opened_at)
      )
      or app.removed_from_environment(new.environment_id, new.opened_by_user_id)
      when 'loan_mediation' then exists (
        select 1
        from app.loans as loan
        join app.loan_requests as request on request.id = loan.request_id
        where loan.id = new.loan_id
          and request.origin = 'environment'
          and request.environment_id = new.environment_id
          and new.opened_by_user_id in (loan.borrower_user_id, loan.responsible_lender_id)
          and app.loan_mediable(loan.status)
      )
      when 'unavailability_report' then
        exists (select 1 from app.users where id = new.subject_user_id)
        and not app.users_blocked(new.opened_by_user_id, new.subject_user_id)
      when 'environment_report' then
        exists (
          select 1 from app.environment_memberships
          where environment_id = new.environment_id
            and user_id = new.opened_by_user_id
            and state = 'active'
            and (transition_deadline is null or transition_deadline > new.opened_at)
        )
        and case new.report_target
          when 'user' then exists (
            select 1 from app.environment_memberships
            where environment_id = new.environment_id
              and user_id = new.subject_user_id
              and state in ('active', 'passive')
          )
          else exists (
            select 1 from app.environment_publications
            where environment_id = new.environment_id
              and object_id = new.object_id
              and status = 'active'
          )
          and not exists (
            select 1 from app.object_owners
            where object_id = new.object_id and user_id = new.opened_by_user_id
          )
        end
      when 'platform_inquiry' then
        -- A steward's own basis for a case (PS-ADM-015), about an account
        -- or a thing that is not their own.
        exists (
          select 1 from app.platform_role_grants
          where user_id = new.opened_by_user_id
            and role = 'platform_steward'
            and revoked_at is null
        )
        and case new.report_target
          when 'user' then exists (
            select 1 from app.users
            where id = new.subject_user_id
              and status not in ('pending_registration', 'deleted')
          )
          when 'object' then exists (select 1 from app.objects where id = new.object_id)
            and not exists (
              select 1 from app.object_owners
              where object_id = new.object_id and user_id = new.opened_by_user_id
            )
        end
      when 'platform_report' then
        case
          when new.escalated_from_case_id is not null then
            source.kind = 'environment_report'
            and source.status = 'open'
            and app.case_handler_acts(source, new.opened_by_user_id, new.opened_at)
            and (source.report_target, source.subject_user_id, source.object_id)
              is not distinct from (new.report_target, new.subject_user_id, new.object_id)
          else case new.report_target
            when 'user' then app.users_report_context(new.opened_by_user_id, new.subject_user_id)
            when 'object' then app.object_met_by(new.object_id, new.opened_by_user_id)
              and not exists (
                select 1 from app.object_owners
                where object_id = new.object_id and user_id = new.opened_by_user_id
              )
            when 'review' then exists (
              select 1 from app.loan_reviews
              where id = new.review_id
                and status = 'published'
                and subject_user_id = new.opened_by_user_id
                and author_user_id = new.subject_user_id
            )
            when 'review_response' then exists (
              select 1
              from app.loan_reviews as review
              join app.loan_review_responses as response on response.review_id = review.id
              where review.id = new.review_id
                and review.status = 'published'
                and review.author_user_id = new.opened_by_user_id
                and response.author_user_id = new.subject_user_id
                and response.body is not null
            )
          end
        end
    end, false)
  then
    raise exception 'case cannot open like that' using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- Ending someone's roles in an environment is a platform intervention of
-- its own.
alter table app.environment_role_grants drop constraint environment_role_grants_revoke_reason_check;
alter table app.environment_role_grants add constraint environment_role_grants_revoke_reason_check
  check (revoke_reason in (
    'resigned', 'removed', 'transferred', 'account_departed',
    'type_change_not_accepted', 'platform_intervention'
  ));

create table app.platform_interventions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references app.cases (id),
  kind text not null check (kind in (
    'account_suspended', 'account_reinstated', 'account_closure_started',
    'account_closure_completed', 'account_retired_as_duplicate',
    'accounts_linked_as_same_person', 'false_identity_recorded',
    'object_moved_from_duplicate', 'environment_roles_ended'
  )),
  -- Whom it was toward: an account (and for a link, the other one), an
  -- environment where their roles ended, or a thing that was moved.
  user_id uuid references app.users (id),
  other_user_id uuid references app.users (id),
  environment_id uuid references app.environments (id),
  object_id uuid,
  basis text not null
    check (basis = btrim(basis) and char_length(basis) between 1 and 2000),
  decided_by_user_id uuid not null references app.users (id),
  decided_at timestamptz not null,
  constraint platform_interventions_shape check (
    case kind
      when 'object_moved_from_duplicate' then
        object_id is not null and user_id is not null and environment_id is null
      when 'environment_roles_ended' then
        environment_id is not null and user_id is not null and object_id is null
      else
        user_id is not null and environment_id is null and object_id is null
    end
    and (other_user_id is not null)
      = (kind in ('account_retired_as_duplicate', 'accounts_linked_as_same_person'))
    and decided_by_user_id is distinct from user_id
    and decided_by_user_id is distinct from other_user_id
  )
);

comment on table app.platform_interventions is
  'Platform stewards'' interventions (PS-ADM-014, PS-ADM-015): each from its case, with its basis. Append-only.';

create index platform_interventions_case on app.platform_interventions (case_id, decided_at);
create index platform_interventions_user on app.platform_interventions (user_id);

-- Taken by the steward who holds the open case, toward what the case is
-- about.
create function app.guard_new_platform_intervention()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
begin
  select * into c from app.cases where id = new.case_id;

  if c.status is distinct from 'open'
    or c.kind not in ('platform_report', 'platform_inquiry')
    or c.assignee_user_id is distinct from new.decided_by_user_id
    or not app.case_handler(c, new.decided_by_user_id, new.decided_at)
    or not (
      app.case_reported(c, new.user_id)
      or (new.other_user_id is not null and app.case_reported(c, new.other_user_id))
      or (new.object_id is not null and new.object_id = c.object_id)
    )
  then
    raise exception 'case % cannot carry this intervention', new.case_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_platform_intervention() from public;

create trigger platform_interventions_guard
  before insert on app.platform_interventions
  for each row execute function app.guard_new_platform_intervention();

create trigger platform_interventions_no_update
  before update or delete on app.platform_interventions
  for each row execute function app.reject_append_only_mutation();

create trigger platform_interventions_no_truncate
  before truncate on app.platform_interventions
  for each statement execute function app.reject_append_only_mutation();
