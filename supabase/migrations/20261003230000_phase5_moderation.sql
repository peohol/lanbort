-- Phase 5 moderation (WP-52, PS-TRUST-013–016).
--
-- A report is a case (WP-45): a governed process with explicit access, with
-- the reporter as its only participant. Reporting starts an assessment and
-- says nothing about guilt (vision 07, «Rapportering»):
-- - `environment_report`: an active member reports an object published in the
--   environment, or another member, to the environment's administrators as a
--   function. They moderate locally: the object's publication there only
--   (PS-OBJ-017, PS-TRUST-013).
-- - `platform_report`: a user reports a user, an object, a review or a
--   response to a review to the platform stewards, who handle platform rules,
--   serious abuse and global safety or legality (PS-TRUST-013). An
--   administrator escalates a local report the same way, as a separate case:
--   a local measure never has a global effect without its own basis
--   (PS-TRUST-016).
-- Nobody involved handles a report (PS-USR-009), and whoever it is about never
-- learns of it through the case.
--
-- A measure (`app.moderation_actions`) is what a handler decided on a report:
-- what it concerns, its scope, its reason, who decided and when
-- (PS-TRUST-016). It is append-only, and each measure's effect is made in the
-- same transaction, checked at commit. A moderated review or response is not
-- rewritten silently: the measure keeps what was removed for the handlers,
-- and the review stops counting where it no longer stands (PS-TRUST-014–015).
-- Platform measures go through the stewards' stronger authentication, so
-- they stay closed until OD-0010 is decided.

-- Whether two users have a concrete relation to report from (vision 06):
-- friends, a loan between them, an object they own together, or active
-- membership of the same environment.
create function app.users_related(a uuid, b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.users_are_friends(a, b)
    or exists (
      select 1 from app.loans
      where (borrower_user_id = a and (responsible_lender_id = b or b = any(owner_ids_at_approval)))
        or (borrower_user_id = b and (responsible_lender_id = a or a = any(owner_ids_at_approval)))
    )
    or exists (
      select 1
      from app.object_owners as own
      join app.object_owners as other on other.object_id = own.object_id
      where own.user_id = a and other.user_id = b
    )
    or exists (
      select 1
      from app.environment_memberships as own
      join app.environment_memberships as other
        on other.environment_id = own.environment_id
      where own.user_id = a
        and other.user_id = b
        and own.state = 'active'
        and other.state = 'active'
    );
$$;

revoke execute on function app.users_related(uuid, uuid) from public;

-- Whether `reporter` has a legitimate context to report `subject` to the
-- platform from: a current relation (app.users_related), a friendship they
-- once had, or a friend request `subject` sent them. A block ends friendships
-- and requests but never this history, so whoever blocked someone can still
-- report them. The reporter cannot make any of it alone, so blocking or
-- befriending a guessed id never lets a report confirm that it exists.
create function app.users_report_context(reporter uuid, subject uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.users_related(reporter, subject)
    or exists (
      select 1 from app.friendships
      where user_low_id = least(reporter, subject)
        and user_high_id = greatest(reporter, subject)
        and (accepted_at is not null or requester_id = subject)
    );
$$;

revoke execute on function app.users_report_context(uuid, uuid) from public;

-- Whether `viewer`, not an owner, has met the object: it is published in an
-- environment where they are an active member, they are or were friends with
-- one of its owners (the direct loan preview; a block ends the friendship, not
-- what was seen), or they asked to borrow it.
create function app.object_met_by(object uuid, viewer uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
      select 1
      from app.environment_publications as publication
      join app.environment_memberships as membership
        on membership.environment_id = publication.environment_id
      where publication.object_id = object
        and publication.status = 'active'
        and membership.user_id = viewer
        and membership.state = 'active'
    )
    or app.has_friend_among_owners(viewer, object)
    or exists (
      select 1
      from app.object_owners as owner
      join app.friendships as friendship
        on friendship.user_low_id = least(viewer, owner.user_id)
        and friendship.user_high_id = greatest(viewer, owner.user_id)
      where owner.object_id = object
        and friendship.accepted_at is not null
    )
    or exists (
      select 1 from app.loan_requests
      where object_id = object and borrower_user_id = viewer
    );
$$;

revoke execute on function app.object_met_by(uuid, uuid) from public;

-- Reports are cases. Their target: a user (`subject_user_id`), an object
-- (`object_id`, kept as an id only, so it outlives an object that is deleted
-- like events do), a review or the response to it (`review_id`, with the
-- author of what is reported as `subject_user_id`). A platform report may
-- name the environment report it was escalated from.
alter table app.cases
  drop constraint cases_kind_check,
  add constraint cases_kind_check check (kind in (
    'environment_contact', 'loan_mediation', 'unavailability_report',
    'environment_report', 'platform_report'
  )),
  add column report_target text
    check (report_target in ('user', 'object', 'review', 'review_response')),
  add column object_id uuid,
  add column review_id uuid references app.loan_reviews (id),
  add column escalated_from_case_id uuid references app.cases (id),
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
    end
    and (kind in ('environment_report', 'platform_report')) = (report_target is not null)
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

-- One open report of a reporter about the same target; a second report
-- writes into it (as with the other kinds).
create unique index cases_one_open_moderation_report
  on app.cases (
    opened_by_user_id, kind, environment_id, report_target, subject_user_id, object_id, review_id
  ) nulls not distinct
  where kind in ('environment_report', 'platform_report') and status = 'open';

create index cases_object on app.cases (object_id) where object_id is not null;
create index cases_review on app.cases (review_id) where review_id is not null;

-- The kinds the platform stewards handle.
create function app.case_platform_kind(kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select kind in ('unavailability_report', 'platform_report');
$$;

revoke execute on function app.case_platform_kind(text) from public;

-- Whether `candidate` is what a report is about: the reported user, the
-- author of the reported review or response, or a current owner of the
-- reported object. They never learn of the report through the case.
create function app.case_reported(c app.cases, candidate uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select candidate is not distinct from c.subject_user_id
    or (c.object_id is not null and exists (
      select 1 from app.object_owners
      where object_id = c.object_id and user_id = candidate
    ));
$$;

revoke execute on function app.case_reported(app.cases, uuid) from public;

-- As in WP-45, and for a report also what it is about and everyone on both
-- sides of a reported review.
create or replace function app.case_involved(c app.cases, candidate uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select candidate = c.opened_by_user_id
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

-- As in WP-45, with the stewards handling every platform kind.
create or replace function app.case_handler_role(c app.cases, candidate uuid, at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when app.case_platform_kind(c.kind) then exists (
      select 1 from app.platform_role_grants
      where user_id = candidate and role = 'platform_steward' and revoked_at is null
    )
    else exists (
      select 1 from app.environment_role_grants
      where environment_id = c.environment_id
        and user_id = candidate
        and role = 'administrator'
        and revoked_at is null
    )
    and exists (
      select 1 from app.environment_memberships
      where environment_id = c.environment_id
        and user_id = candidate
        and state = 'active'
        and (transition_deadline is null or transition_deadline > at)
    )
  end;
$$;

create or replace function app.case_has_handler(c app.cases, at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when app.case_platform_kind(c.kind) then exists (
      select 1 from app.platform_role_grants
      where role = 'platform_steward'
        and revoked_at is null
        and app.case_handler(c, user_id, at)
    )
    else exists (
      select 1 from app.environment_role_grants
      where environment_id = c.environment_id
        and role = 'administrator'
        and revoked_at is null
        and app.case_handler(c, user_id, at)
    )
  end;
$$;

create or replace function app.case_handler_lapse(c app.cases, candidate uuid, at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when app.case_handler(c, candidate, at) then null
    when not exists (select 1 from app.users where id = candidate and status = 'active')
      then 'account_inactive'
    when app.case_involved(c, candidate) then 'involved'
    when app.case_platform_kind(c.kind) or not exists (
      select 1 from app.environment_role_grants
      where environment_id = c.environment_id
        and user_id = candidate
        and role = 'administrator'
        and revoked_at is null
    ) then 'role_ended'
    -- What is left of the role is the active membership.
    else 'membership_ended'
  end;
$$;

-- As in WP-45 with WP-40, with the stewards told of every platform kind.
create or replace function app.case_handlers(case_id uuid, at timestamptz)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select grant_row.user_id
  from app.cases as c
  cross join lateral (
    select user_id from app.platform_role_grants
    where app.case_platform_kind(c.kind)
      and role = 'platform_steward'
      and revoked_at is null
    union
    select user_id from app.environment_role_grants
    where not app.case_platform_kind(c.kind)
      and environment_id = c.environment_id
      and role = 'administrator'
      and revoked_at is null
  ) as grant_row
  where c.id = case_id
    and c.status = 'open'
    and app.case_handler(c, grant_row.user_id, at);
$$;

-- As in WP-45, with a platform role revoked returning every platform kind,
-- and someone who became an owner of a reported object returning its report.
create or replace function app.return_assignee_cases()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed jsonb := to_jsonb(new);
  assignee uuid := coalesce(changed ->> 'user_id', changed ->> 'id')::uuid;
begin
  perform app.return_cases_to_queue(
    array(
      select id from app.cases
      where status = 'open'
        and assignee_user_id = assignee
        and case tg_table_name
          when 'environment_role_grants' then environment_id = (changed ->> 'environment_id')::uuid
          when 'environment_memberships' then environment_id = (changed ->> 'environment_id')::uuid
          when 'platform_role_grants' then app.case_platform_kind(kind)
          when 'object_owners' then object_id = (changed ->> 'object_id')::uuid
            or loan_id in (
              select id from app.loans where object_id = (changed ->> 'object_id')::uuid
            )
          else true
        end
    ),
    clock_timestamp()
  );

  return null;
end;
$$;

-- As in WP-45, and a report opens as its kind allows:
-- - in an environment, by an active member, about another member with a
--   current membership there, or about an object they do not own that is
--   published there (active, as members see it);
-- - to the platform, by an active account, about a user they have a context
--   with (app.users_report_context), an object they have met and do not own, a published review about them,
--   or the response to a published review they wrote; or escalated by the
--   acting handler of an open environment report, about the same target.
-- A report does not depend on a block, and a block takes away none of the
-- context it opens from: reporting and blocking go together (vision 06,
-- «Blokkering under åpne saker»).
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
    or not exists (select 1 from app.users where id = new.opened_by_user_id and status = 'active')
    or not coalesce(case new.kind
      when 'environment_contact' then exists (
        select 1 from app.environment_memberships
        where environment_id = new.environment_id
          and user_id = new.opened_by_user_id
          and state = 'active'
          and (transition_deadline is null or transition_deadline > new.opened_at)
      )
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

-- As in WP-45, with the reporter of either report kind.
create or replace function app.guard_case_participant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
  loan app.loans;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(old) - 'may_write') is distinct from (to_jsonb(new) - 'may_write') then
      raise exception 'participant of case % cannot change like that', old.case_id
        using errcode = 'restrict_violation';
    end if;

    return new;
  end if;

  select * into c from app.cases where id = new.case_id;
  select * into loan from app.loans where id = c.loan_id;

  if c.status <> 'open'
    or not coalesce(case c.kind
      when 'environment_contact' then
        new.role = 'requester' and new.user_id = c.opened_by_user_id
      when 'loan_mediation' then
        (new.role = 'borrower' and new.user_id = loan.borrower_user_id)
        or (new.role = 'lender' and new.user_id = loan.responsible_lender_id)
      else
        new.role = 'reporter' and new.user_id = c.opened_by_user_id
    end, false)
  then
    raise exception 'case % cannot have this participant', new.case_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- A review may be removed as a whole by moderation: it stays, with when it
-- was published, but no longer stands (PS-TRUST-014).
alter table app.loan_reviews
  drop constraint loan_reviews_status_check,
  add constraint loan_reviews_status_check
    check (status in ('hidden', 'published', 'lapsed', 'removed')),
  drop constraint loan_reviews_shape,
  add constraint loan_reviews_shape check (
    (status in ('published', 'removed')) = (published_at is not null)
    and updated_at >= submitted_at
  );

-- A response whose text was removed by moderation keeps its place as the one
-- response, without text (PS-TRUST-015).
alter table app.loan_review_responses
  alter column body drop not null;

-- PS-TRUST-016: a measure on a report, with what it concerns, its scope, its
-- reason, who decided it and when. What a measure removed is kept here, for
-- the handlers only (PS-TRUST-014: internal moderation history).
-- - `publication_rejected` / `publication_blocked`: the reported object's
--   publication in the environment only (PS-OBJ-017), as the administrators'
--   own rejection or block.
-- - `object_blocked` / `object_unblocked`: the object takes no new loans
--   anywhere and is left out of discovery, until a steward lifts it. Loans
--   already approved go on.
-- - `review_removed`: the review no longer stands anywhere.
-- - `review_text_removed`: its text goes, its scores stand (PS-TRUST-015).
-- - `review_score_removed`: one score goes, the rest stand.
-- - `review_response_removed`: the response's text goes.
create table app.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references app.cases (id),
  position bigint not null unique default nextval('app.case_log_positions'),
  kind text not null check (kind in (
    'publication_rejected', 'publication_blocked', 'object_blocked', 'object_unblocked',
    'review_removed', 'review_text_removed', 'review_score_removed', 'review_response_removed'
  )),
  scope text not null check (scope in ('environment', 'platform')),
  environment_id uuid references app.environments (id),
  object_id uuid,
  review_id uuid references app.loan_reviews (id),
  dimension text,
  reason text not null check (reason = btrim(reason) and char_length(reason) between 1 and 2000),
  decided_by_user_id uuid not null references app.users (id),
  decided_at timestamptz not null,
  removed_text text,
  removed_score smallint,
  constraint moderation_actions_shape check (
    (scope = 'environment') = (environment_id is not null)
    and (dimension is not null) = (kind = 'review_score_removed')
    and (removed_score is not null) = (kind = 'review_score_removed')
    and (removed_text is null or kind in ('review_text_removed', 'review_response_removed'))
    and case
      when kind like 'publication_%' then
        scope = 'environment' and object_id is not null and review_id is null
      when kind like 'object_%' then
        scope = 'platform' and object_id is not null and review_id is null
      else
        scope = 'platform' and object_id is null and review_id is not null
    end
  )
);

comment on table app.moderation_actions is
  'Measures taken on reports, with their basis, scope, reason, decision maker and time (PS-TRUST-013–016).';

create index moderation_actions_case on app.moderation_actions (case_id, position);
create index moderation_actions_object on app.moderation_actions (object_id, position)
  where object_id is not null;
create index moderation_actions_review on app.moderation_actions (review_id)
  where review_id is not null;

create trigger moderation_actions_immutable
  before update or delete on app.moderation_actions
  for each row execute function app.reject_append_only_mutation();

-- Whether a steward's block keeps the object from new loans now: its latest
-- platform measure blocked it.
create function app.object_platform_blocked(object uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select kind = 'object_blocked'
    from app.moderation_actions
    where object_id = object and kind in ('object_blocked', 'object_unblocked')
    order by position desc
    limit 1
  ), false);
$$;

revoke execute on function app.object_platform_blocked(uuid) from public;

-- Whether a measure of `kind` on the review (and its `dimension`) was taken.
create function app.review_moderated(review uuid, kind text, dimension text default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from app.moderation_actions as action
    where action.review_id = review
      and action.kind = review_moderated.kind
      and action.dimension is not distinct from review_moderated.dimension
  );
$$;

revoke execute on function app.review_moderated(uuid, text, text) from public;

-- A measure is taken on an open report by its acting handler, of a kind the
-- report's level and target allow, on what the report is about, while it
-- still has something to change. What it removes is recorded as it was.
create function app.guard_new_moderation_action()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c app.cases;
  review app.loan_reviews;
  response app.loan_review_responses;
begin
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

revoke execute on function app.guard_new_moderation_action() from public;

create trigger moderation_actions_guard
  before insert on app.moderation_actions
  for each row execute function app.guard_new_moderation_action();

-- By commit, the measure has its effect: the publication is rejected or
-- blocked, the review removed, its text, score or response text gone.
create function app.ensure_moderation_applied()
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
      else true
    end, false)
  then
    raise exception 'measure % has not been applied', new.id
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

revoke execute on function app.ensure_moderation_applied() from public;

create constraint trigger moderation_actions_applied
  after insert on app.moderation_actions
  deferrable initially deferred
  for each row execute function app.ensure_moderation_applied();

-- As in WP-50, without the dimensions moderation removed.
create or replace function app.loan_review_fits(review app.loan_reviews)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    review.author_user_id = app.review_party(period, review.author_role)
      and review.subject_user_id = app.review_party(
        period, case review.author_role when 'borrower' then 'lender' else 'borrower' end
      )
      and (
        select coalesce(array_agg(score.dimension order by score.dimension), '{}')
        from app.loan_review_scores as score
        where score.review_id = review.id
      ) = (
        select coalesce(array_agg(code order by code), '{}')
        from unnest(app.review_dimensions_for(period.basis, review.author_role)) as code
        where not app.review_moderated(review.id, 'review_score_removed', code)
      ),
    false
  )
  from app.loan_review_periods as period
  where period.loan_id = review.loan_id;
$$;

-- As in WP-50, and a published review changes only by a measure taken on it:
-- removed as a whole, or without its text.
create or replace function app.guard_loan_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  period app.loan_review_periods;
  other_role text := case new.author_role when 'borrower' then 'lender' else 'borrower' end;
  content text[] := array['body', 'version', 'updated_at'];
begin
  select * into period from app.loan_review_periods where loan_id = new.loan_id;

  if tg_op = 'INSERT' then
    if not coalesce(
      period.status = 'open'
        and new.status = 'hidden'
        and new.version = 1
        and new.updated_at = new.submitted_at
        and new.author_user_id = app.review_party(period, new.author_role)
        and new.subject_user_id = app.review_party(period, other_role),
      false
    ) then
      raise exception 'loan % cannot get this review', new.loan_id
        using errcode = 'restrict_violation';
    end if;

    return new;
  end if;

  if old.status = 'published' and not coalesce(
    case new.status
      when 'removed' then app.review_moderated(old.id, 'review_removed')
        and (to_jsonb(old) - 'status') = (to_jsonb(new) - 'status')
      when 'published' then app.review_moderated(old.id, 'review_text_removed')
        and old.body is not null
        and new.body is null
        and (to_jsonb(old) - 'body') = (to_jsonb(new) - 'body')
      else false
    end,
    false
  ) then
    raise exception 'review % cannot change like that', old.id
      using errcode = 'restrict_violation';
  end if;

  if old.status <> 'published' and (old.status <> 'hidden' or not coalesce(
    case new.status
      when 'hidden' then period.status = 'open'
        and new.version = old.version + 1
        and (to_jsonb(old) - content) = (to_jsonb(new) - content)
      when 'published' then period.status = 'closed'
        and new.published_at = period.closed_at
        and (to_jsonb(old) - array['status', 'published_at'])
          = (to_jsonb(new) - array['status', 'published_at'])
      when 'lapsed' then period.status <> 'closed'
        and not app.loan_review_fits(old)
        and (to_jsonb(old) - array['status', 'updated_at'])
          = (to_jsonb(new) - array['status', 'updated_at'])
      else false
    end,
    false
  )) then
    raise exception 'review % cannot change like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- As in WP-50, and a published review's score goes only by a measure removing
-- that score.
create or replace function app.guard_loan_review_score()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed app.loan_review_scores := case tg_op when 'DELETE' then old else new end;
  review app.loan_reviews;
  period app.loan_review_periods;
begin
  select * into review from app.loan_reviews where id = changed.review_id;
  select * into period from app.loan_review_periods where loan_id = review.loan_id;

  if not coalesce(
    (
      review.status = 'hidden'
        and period.status = 'open'
        and changed.reviewer_role = review.author_role
        and (tg_op = 'DELETE'
          or changed.dimension = any(app.review_dimensions_for(period.basis, review.author_role)))
        and (tg_op <> 'UPDATE' or (new.review_id = old.review_id and new.dimension = old.dimension))
    )
    or (
      tg_op = 'DELETE'
        and review.status = 'published'
        and app.review_moderated(review.id, 'review_score_removed', old.dimension)
    ),
    false
  ) then
    raise exception 'review % cannot get this score', changed.review_id
      using errcode = 'restrict_violation';
  end if;

  return changed;
end;
$$;

-- As in WP-50, and a review whose text moderation removed stands without the
-- explanation its low scores once required.
create or replace function app.ensure_loan_review_complete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed jsonb := to_jsonb(case tg_op when 'DELETE' then old else new end);
  review app.loan_reviews;
begin
  select * into review
  from app.loan_reviews
  where id = coalesce(changed ->> 'review_id', changed ->> 'id')::uuid;

  if review.status <> 'lapsed' and not coalesce(
    app.loan_review_fits(review)
      and (review.body is not null
        or app.review_moderated(review.id, 'review_text_removed')
        or not exists (
          select 1 from app.loan_review_scores
          where review_id = review.id and score <= 2
        )),
    false
  ) then
    raise exception 'review % is not complete', review.id
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

-- A response is written with text, and never changes after, except that
-- moderation removes its text.
create function app.guard_loan_review_response_body()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.body is null then
      raise exception 'a response to review % is written with text', new.review_id
        using errcode = 'restrict_violation';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' or not (
    app.review_moderated(old.review_id, 'review_response_removed')
      and old.body is not null
      and new.body is null
      and (to_jsonb(old) - 'body') = (to_jsonb(new) - 'body')
  ) then
    raise exception 'response to review % cannot change like that', old.review_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_loan_review_response_body() from public;

drop trigger loan_review_responses_immutable on app.loan_review_responses;

create trigger loan_review_responses_body_guard
  before insert or update or delete on app.loan_review_responses
  for each row execute function app.guard_loan_review_response_body();

-- An object a steward blocked takes no new loan requests and no new loans.
-- The domain checks its availability first and answers neutrally; this is
-- the backstop. Loans already approved go on.
create function app.guard_platform_blocked_object()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.object_platform_blocked(new.object_id) then
    raise exception 'object % is blocked by the platform', new.object_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_platform_blocked_object() from public;

create trigger loan_requests_platform_block_guard
  before insert on app.loan_requests
  for each row execute function app.guard_platform_blocked_object();

create trigger loans_platform_block_guard
  before insert on app.loans
  for each row execute function app.guard_platform_blocked_object();
