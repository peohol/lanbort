-- PS-ENV-021 (OD-0025): an impartial administrator may end an active
-- membership as a local moderation measure, with a factual reason recorded
-- as every measure is (PS-TRUST-016). Barring new attempts is a separate
-- choice (`environment_access_restrictions`). Approved loans and the insight
-- their parties need stay, as when a member leaves. The person is told as
-- every measure tells whom it hits (PS-TRUST-018), and may ask the
-- administrators for a new assessment, so a contact stays open to them.
--
-- The measure is not taken on a case: it starts on the members page. It is
-- the only kind without one, and the only kind that names a membership.

alter table app.environment_memberships drop constraint environment_memberships_end_reason_check;
alter table app.environment_memberships add constraint environment_memberships_end_reason_check
  check (end_reason in (
    'left', 'application_withdrawn', 'application_rejected',
    'invitation_declined', 'invitation_withdrawn', 'environment_wound_down',
    'environment_type_changed', 'type_change_not_accepted', 'account_deleted',
    'removed'
  ));

alter table app.moderation_actions
  alter column case_id drop not null,
  add column membership_id uuid references app.environment_memberships (id),
  drop constraint moderation_actions_kind_check,
  add constraint moderation_actions_kind_check check (kind in (
    'publication_rejected', 'publication_blocked', 'object_blocked', 'object_unblocked',
    'review_removed', 'review_text_removed', 'review_score_removed', 'review_response_removed',
    'membership_ended'
  )),
  drop constraint moderation_actions_shape,
  add constraint moderation_actions_shape check (
    (scope = 'environment') = (environment_id is not null)
    and (case_id is null) = (kind = 'membership_ended')
    and (membership_id is not null) = (kind = 'membership_ended')
    and (dimension is not null) = (kind = 'review_score_removed')
    and (removed_score is not null) = (kind = 'review_score_removed')
    and (removed_text is null or kind in ('review_text_removed', 'review_response_removed'))
    and case
      when kind = 'membership_ended' then
        scope = 'environment' and object_id is null and review_id is null
      when kind like 'publication_%' then
        scope = 'environment' and object_id is not null and review_id is null
      when kind like 'object_%' then
        scope = 'platform' and object_id is not null and review_id is null
      else
        scope = 'platform' and object_id is null and review_id is not null
    end
  );

create index moderation_actions_membership on app.moderation_actions (membership_id)
  where membership_id is not null;

-- Whether `administrator` is impartial toward `member` in the environment
-- (PS-USR-009): no open case there involves them both.
create function app.administrator_impartial(environment uuid, administrator uuid, member uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1 from app.cases as c
    where c.environment_id = environment
      and c.status = 'open'
      and app.case_involved(c, administrator)
      and app.case_involved(c, member)
  );
$$;

revoke execute on function app.administrator_impartial(uuid, uuid, uuid) from public;

-- Whether `administrator` may end the membership now: it is active, they
-- are an active administrator of its environment and not its member, the
-- member holds no role there (a role is handed over or removed its own
-- way), and they are impartial toward the member.
create function app.membership_removable(membership uuid, administrator uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from app.environment_memberships as m
    where m.id = membership
      and m.state = 'active'
      and m.user_id <> administrator
      and exists (
        select 1
        from app.environment_role_grants as grant_row
        join app.environment_memberships as own
          on own.environment_id = grant_row.environment_id
          and own.user_id = grant_row.user_id
          and own.state = 'active'
        where grant_row.environment_id = m.environment_id
          and grant_row.user_id = administrator
          and grant_row.role = 'administrator'
          and grant_row.revoked_at is null
      )
      and not exists (
        select 1 from app.environment_role_grants
        where environment_id = m.environment_id
          and user_id = m.user_id
          and revoked_at is null
      )
      and app.administrator_impartial(m.environment_id, administrator, m.user_id)
  );
$$;

revoke execute on function app.membership_removable(uuid, uuid) from public;

-- Whether the user's latest membership of the environment was ended by its
-- administrators, so they may still ask them for a new assessment.
create function app.removed_from_environment(environment uuid, member uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select end_reason = 'removed'
    from app.environment_memberships
    where environment_id = environment and user_id = member
    order by created_at desc
    limit 1
  ), false);
$$;

revoke execute on function app.removed_from_environment(uuid, uuid) from public;

-- As in WP-52, and a membership's end is a measure of its own, on no case.
create or replace function app.guard_new_moderation_action()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
  review app.loan_reviews;
  response app.loan_review_responses;
begin
  if new.kind = 'membership_ended' then
    if not app.membership_removable(new.membership_id, new.decided_by_user_id)
      or new.environment_id is distinct from (
        select environment_id from app.environment_memberships where id = new.membership_id
      )
    then
      raise exception 'membership % cannot be ended like that', new.membership_id
        using errcode = 'restrict_violation';
    end if;

    return new;
  end if;

  select * into c from app.cases where id = new.case_id;
  select * into review from app.loan_reviews where id = new.review_id;
  select * into response from app.loan_review_responses where review_id = new.review_id;

  if c.status is distinct from 'open'
    or not app.case_handler_acts(c, new.decided_by_user_id, new.decided_at)
    or not coalesce(case
      when new.kind like 'publication_%' then
        c.kind = 'environment_report'
        and c.report_target = 'object'
        and new.environment_id = c.environment_id
        and new.object_id = c.object_id
        and exists (
          select 1 from app.environment_publications
          where object_id = c.object_id
            and environment_id = c.environment_id
            and status in ('pending', 'active')
        )
      when new.kind like 'object_%' then
        c.kind = 'platform_report'
        and c.report_target = 'object'
        and new.object_id = c.object_id
        and app.object_platform_blocked(c.object_id) = (new.kind = 'object_unblocked')
      when new.kind = 'review_response_removed' then
        c.kind = 'platform_report'
        and c.report_target = 'review_response'
        and new.review_id = c.review_id
        and review.status = 'published'
        and response.body is not null
        and new.removed_text = response.body
      else
        c.kind = 'platform_report'
        and c.report_target = 'review'
        and new.review_id = c.review_id
        and review.status = 'published'
        and case new.kind
          when 'review_removed' then new.removed_text is null
          when 'review_text_removed' then review.body is not null
            and new.removed_text = review.body
          when 'review_score_removed' then new.removed_score = (
            select score from app.loan_review_scores
            where review_id = review.id and dimension = new.dimension
          )
        end
    end, false)
  then
    raise exception 'case % cannot get this measure', new.case_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- As in WP-52, and an ended membership is ended by its administrators.
create or replace function app.ensure_moderation_applied()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not coalesce(case new.kind
      when 'publication_rejected' then exists (
        select 1 from app.environment_publications
        where object_id = new.object_id
          and environment_id = new.environment_id
          and status = 'rejected'
      )
      when 'publication_blocked' then exists (
        select 1 from app.environment_publications
        where object_id = new.object_id
          and environment_id = new.environment_id
          and status = 'blocked'
      )
      when 'review_removed' then exists (
        select 1 from app.loan_reviews where id = new.review_id and status = 'removed'
      )
      when 'review_text_removed' then exists (
        select 1 from app.loan_reviews where id = new.review_id and body is null
      )
      when 'review_score_removed' then not exists (
        select 1 from app.loan_review_scores
        where review_id = new.review_id and dimension = new.dimension
      )
      when 'review_response_removed' then exists (
        select 1 from app.loan_review_responses where review_id = new.review_id and body is null
      )
      when 'membership_ended' then exists (
        select 1 from app.environment_memberships
        where id = new.membership_id and state = 'ended' and end_reason = 'removed'
      )
      else true
    end, false)
  then
    raise exception 'measure % has not been applied', new.id
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

-- As in WP-53, and someone removed from the environment may still contact
-- its administrators, to ask for a new assessment (PS-TRUST-018).
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
