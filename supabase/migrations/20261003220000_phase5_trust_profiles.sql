-- Phase 5 contextual trust (WP-51, PS-TRUST-006–012).
--
-- A person's trust profile is derived when it is read, never stored: from the
-- published reviews about them (WP-50), per role, with contested scores set
-- aside (PS-TRUST-008). Nothing here is a score of its own, so moderation
-- (WP-52) and account lifecycle (WP-53) change what the profile shows by
-- changing which reviews stand, not by recomputing a stored number.

-- The reviews about a person that stand: published, or hidden in a window
-- whose deadline has passed before the job recorded it (they count as
-- published from the deadline on).
create index loan_reviews_subject_standing
  on app.loan_reviews (subject_user_id, author_role)
  where status <> 'lapsed';

-- Whether something done in the environment at `since` belongs to a hidden
-- context: the environment was hidden then (PS-ENV-009 keeps that context
-- after it becomes less private), or it has been hidden at some point since
-- (scenario 54: from the change on, the stricter rules apply). Positions come
-- from `app.history_positions`, never clock time.
create function app.environment_hidden_since(environment uuid, since bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
      (
        select period.type = 'hidden'
        from app.environment_type_periods as period
        where period.environment_id = environment and period.position <= since
        order by period.position desc
        limit 1
      ),
      true
    )
    or exists (
      select 1
      from app.environment_type_periods as period
      where period.environment_id = environment
        and period.position > since
        and period.type = 'hidden'
    );
$$;

revoke execute on function app.environment_hidden_since(uuid, bigint) from public;
