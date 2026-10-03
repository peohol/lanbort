-- Phase 5 review rights and double-blind publication (WP-50, PS-TRUST-001–005).
--
-- When a loan ends, its two parties may review each other: the borrower the
-- responsible lender, and the lender the borrower. The ending decides what can
-- be reviewed (PS-TRUST-001): a returned loan was experienced in full; a loan
-- that was not completed only up to the handover appointment; a cancelled loan
-- only as far as the parties got before the cancellation. Dimensions that
-- assume something never happened are left out, never scored.
--
-- A review is 1–5 on each dimension of the ending, with one combined
-- explanation required when any score is 1 or 2 (PS-TRUST-002). It stays
-- hidden, and editable by its author, until both parties have reviewed or the
-- window of 14 days from the ending is over; then it is published and locked
-- (PS-TRUST-003–004). The reviewed party may give one response to a published
-- review (PS-TRUST-005).
--
-- The window follows the loan by triggers, so every way a loan ends or reopens
-- (WP-32–35, and later work packages) gets the same rule: it opens when the
-- loan ends, pauses when an ended loan reopens before publication, and opens
-- again for the new ending (PS-TRUST-008). A window that closed stays closed: a
-- published review is never rewritten, and a party who let the window pass
-- does not get a new one after seeing the other's review.

-- The review dimensions, as data (vision «Anmeldelse etter et fullført lån»):
-- who scores it, after which endings it was actually experienced, and whether
-- it rests on the return having happened, so that it is contested when a
-- confirmed return is contradicted later (PS-TRUST-008).
create table app.review_dimensions (
  reviewer_role text not null check (reviewer_role in ('borrower', 'lender')),
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,62}$'),
  endings text[] not null check (
    cardinality(endings) > 0
    and endings <@ array['cancelled', 'not_completed', 'returned']
  ),
  rests_on_return boolean not null,
  position smallint not null,
  primary key (reviewer_role, code),
  unique (reviewer_role, position)
);

comment on table app.review_dimensions is
  'What each party can score after which loan endings (PS-TRUST-001).';

insert into app.review_dimensions (reviewer_role, code, endings, rests_on_return, position)
values
  -- The lender about the borrower.
  ('lender', 'pickup_on_time', array['not_completed', 'returned'], false, 1),
  ('lender', 'return_on_time', array['returned'], true, 2),
  ('lender', 'condition_at_return', array['returned'], true, 3),
  ('lender', 'communication', array['cancelled', 'not_completed', 'returned'], false, 4),
  -- The borrower about the lender.
  ('borrower', 'available_at_handover', array['not_completed', 'returned'], false, 1),
  ('borrower', 'available_for_return', array['returned'], true, 2),
  ('borrower', 'matches_description', array['returned'], false, 3),
  ('borrower', 'communication', array['cancelled', 'not_completed', 'returned'], false, 4);

-- PS-TRUST-003, pilot standard: how long the parties have to review.
create function app.loan_review_window()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '14 days';
$$;

revoke execute on function app.loan_review_window() from public;

-- A loan's review window. Its parties and basis are the loan's when it ended.
-- - open: the parties may review until `due_at`;
-- - paused: the loan reopened before publication; nothing is published, and
--   nobody reviews, until it ends again;
-- - closed: the reviews were published, because both had reviewed
--   (`both_submitted`) or the window was over (`deadline`). Final.
create table app.loan_review_periods (
  loan_id uuid primary key references app.loans (id),
  borrower_user_id uuid not null references app.users (id),
  lender_user_id uuid not null references app.users (id),
  basis text not null check (basis in ('cancelled', 'not_completed', 'returned')),
  opened_at timestamptz not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'paused', 'closed')),
  closed_at timestamptz,
  closed_as text check (closed_as in ('both_submitted', 'deadline')),
  constraint loan_review_periods_parties_differ check (borrower_user_id <> lender_user_id),
  constraint loan_review_periods_shape check (
    case status
      when 'open' then due_at = opened_at + app.loan_review_window()
        and closed_at is null and closed_as is null
      when 'paused' then due_at is null and closed_at is null and closed_as is null
      else due_at is not null and closed_as is not null
        and closed_at between opened_at and due_at
        and (closed_as <> 'deadline' or closed_at = due_at)
    end
  )
);

comment on table app.loan_review_periods is
  'When the parties of an ended loan may review each other (PS-TRUST-001/003/008).';

create index loan_review_periods_due
  on app.loan_review_periods (due_at)
  where status = 'open';

create index loan_review_periods_borrower on app.loan_review_periods (borrower_user_id);
create index loan_review_periods_lender on app.loan_review_periods (lender_user_id);

create trigger loan_review_periods_kept
  before delete on app.loan_review_periods
  for each row execute function app.reject_append_only_mutation();

-- The party of `role` in the window.
create function app.review_party(period app.loan_review_periods, role text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case role
    when 'borrower' then period.borrower_user_id
    when 'lender' then period.lender_user_id
  end;
$$;

revoke execute on function app.review_party(app.loan_review_periods, text) from public;

-- A party's review of the other party. Hidden until the window closes; a
-- hidden review's text and scores may change (a new `version`), a published
-- one never. A hidden review lapses if the loan's next ending changes what or
-- whom it reviews; its author may then review again.
create table app.loan_reviews (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references app.loan_review_periods (loan_id),
  author_role text not null check (author_role in ('borrower', 'lender')),
  author_user_id uuid not null references app.users (id),
  subject_user_id uuid not null references app.users (id),
  body text check (body is null or (char_length(body) between 1 and 2000)),
  version integer not null default 1 check (version > 0),
  submitted_at timestamptz not null,
  updated_at timestamptz not null,
  status text not null default 'hidden' check (status in ('hidden', 'published', 'lapsed')),
  published_at timestamptz,
  constraint loan_reviews_parties_differ check (author_user_id <> subject_user_id),
  constraint loan_reviews_shape check (
    (status = 'published') = (published_at is not null)
    and updated_at >= submitted_at
  )
);

comment on table app.loan_reviews is
  'The parties'' reviews of each other after a loan (PS-TRUST-001–004).';

create unique index loan_reviews_one_per_side
  on app.loan_reviews (loan_id, author_role)
  where status <> 'lapsed';

create index loan_reviews_subject on app.loan_reviews (subject_user_id) where status = 'published';
create index loan_reviews_author on app.loan_reviews (author_user_id);

create trigger loan_reviews_kept
  before delete on app.loan_reviews
  for each row execute function app.reject_append_only_mutation();

-- A review's score on one dimension, 1–5 (PS-TRUST-002).
create table app.loan_review_scores (
  review_id uuid not null references app.loan_reviews (id),
  reviewer_role text not null,
  dimension text not null,
  score smallint not null check (score between 1 and 5),
  primary key (review_id, dimension),
  foreign key (reviewer_role, dimension) references app.review_dimensions (reviewer_role, code)
);

comment on table app.loan_review_scores is
  'The scores of a review, one per dimension of the loan''s ending (PS-TRUST-002).';

-- The reviewed party's one response to a published review (PS-TRUST-005).
-- It does not change the scores and opens no discussion.
create table app.loan_review_responses (
  review_id uuid primary key references app.loan_reviews (id),
  author_user_id uuid not null references app.users (id),
  body text not null check (char_length(body) between 1 and 2000),
  responded_at timestamptz not null
);

comment on table app.loan_review_responses is
  'The reviewed party''s one response to a published review (PS-TRUST-005).';

create index loan_review_responses_author on app.loan_review_responses (author_user_id);

create trigger loan_review_responses_immutable
  before update or delete on app.loan_review_responses
  for each row execute function app.reject_append_only_mutation();

-- The dimensions `role` scores after a loan that ended as `basis`.
create function app.review_dimensions_for(basis text, role text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(code order by position), '{}')
  from app.review_dimensions
  where reviewer_role = role and basis = any(endings);
$$;

revoke execute on function app.review_dimensions_for(text, text) from public;

-- Whether a review still fits its window: by the window's party of its side,
-- about the other party, with exactly the dimensions of the window's basis.
create function app.loan_review_fits(review app.loan_reviews)
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
      ),
    false
  )
  from app.loan_review_periods as period
  where period.loan_id = review.loan_id;
$$;

revoke execute on function app.loan_review_fits(app.loan_reviews) from public;

-- A window opens when the loan ends, as the loan ended: its parties, its
-- ending and when. It pauses only while the ended loan is reopened, opens
-- again only for the loan's next ending, and closes once.
create function app.guard_loan_review_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
  opens boolean := tg_op = 'INSERT' or (old.status = 'paused' and new.status = 'open');
begin
  select * into loan from app.loans where id = new.loan_id;

  if tg_op = 'UPDATE' and (
    new.loan_id <> old.loan_id
    or old.status = 'closed'
    or (old.status, new.status) not in (
      ('open', 'paused'), ('open', 'closed'), ('paused', 'open')
    )
    or (not opens and (to_jsonb(old) - array['status', 'due_at', 'closed_at', 'closed_as'])
      is distinct from (to_jsonb(new) - array['status', 'due_at', 'closed_at', 'closed_as']))
    or (new.status = 'paused' and loan.status = 'ended')
    or (new.status = 'closed' and new.closed_as = 'both_submitted' and (
      select count(*) from app.loan_reviews
      where loan_id = new.loan_id and status = 'hidden'
    ) <> 2)
  ) then
    raise exception 'review window of loan % cannot change like that', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  if opens and not coalesce(
    new.status = 'open'
      and loan.status = 'ended'
      and new.basis = loan.end_reason
      and new.opened_at = loan.ended_at
      and new.borrower_user_id = loan.borrower_user_id
      and new.lender_user_id = loan.responsible_lender_id,
    false
  ) then
    raise exception 'review window of loan % does not follow its ending', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_loan_review_period() from public;

create trigger loan_review_periods_guard
  before insert or update on app.loan_review_periods
  for each row execute function app.guard_loan_review_period();

-- Closing the window publishes every hidden review at once, as of the moment
-- it closed: both together when both reviewed (PS-TRUST-003).
create function app.publish_loan_reviews()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update app.loan_reviews
  set status = 'published', published_at = new.closed_at
  where loan_id = new.loan_id and status = 'hidden';

  return null;
end;
$$;

revoke execute on function app.publish_loan_reviews() from public;

create trigger loan_review_periods_publish
  after update of status on app.loan_review_periods
  for each row
  when (new.status = 'closed' and old.status <> 'closed')
  execute function app.publish_loan_reviews();

-- A review is new while its window is open, by the window's party of its side,
-- hidden. A hidden review changes while its window is open (new text and
-- version), is published only by its window closing, and lapses only when it
-- no longer fits. Published and lapsed reviews never change.
create function app.guard_loan_review()
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

  if old.status <> 'hidden' or not coalesce(
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
  ) then
    raise exception 'review % cannot change like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_loan_review() from public;

create trigger loan_reviews_guard
  before insert or update on app.loan_reviews
  for each row execute function app.guard_loan_review();

-- Scores change only with their review, while it is hidden and its window
-- open, on the dimensions of the window's basis for the review's side.
create function app.guard_loan_review_score()
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
    review.status = 'hidden'
      and period.status = 'open'
      and changed.reviewer_role = review.author_role
      and (tg_op = 'DELETE'
        or changed.dimension = any(app.review_dimensions_for(period.basis, review.author_role)))
      and (tg_op <> 'UPDATE' or (new.review_id = old.review_id and new.dimension = old.dimension)),
    false
  ) then
    raise exception 'review % cannot get this score', changed.review_id
      using errcode = 'restrict_violation';
  end if;

  return changed;
end;
$$;

revoke execute on function app.guard_loan_review_score() from public;

create trigger loan_review_scores_guard
  before insert or update or delete on app.loan_review_scores
  for each row execute function app.guard_loan_review_score();

-- At commit, every review that stands is complete: it fits its window, and an
-- explanation goes with any score of 1 or 2 (PS-TRUST-002).
create function app.ensure_loan_review_complete()
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
      and (review.body is not null or not exists (
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

revoke execute on function app.ensure_loan_review_complete() from public;

create constraint trigger loan_reviews_complete
  after insert or update on app.loan_reviews
  deferrable initially deferred
  for each row execute function app.ensure_loan_review_complete();

create constraint trigger loan_review_scores_complete
  after insert or update or delete on app.loan_review_scores
  deferrable initially deferred
  for each row execute function app.ensure_loan_review_complete();

-- Only the reviewed party responds, once, to a published review.
create function app.guard_new_loan_review_response()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.loan_reviews
    where id = new.review_id
      and status = 'published'
      and subject_user_id = new.author_user_id
      and published_at <= new.responded_at
  ) then
    raise exception 'review % cannot get this response', new.review_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_loan_review_response() from public;

create trigger loan_review_responses_guard
  before insert on app.loan_review_responses
  for each row execute function app.guard_new_loan_review_response();

-- The window follows the loan:
-- - it ends: the window opens; a paused one opens again for this ending, and
--   its hidden reviews that no longer fit (another ending, or another party
--   after the lender's role moved while it was reopened) lapse;
-- - an ended loan reopens: an open window pauses, unless its time was over
--   before the reopening; then it stays as it is, and the publication job
--   closes it as of the deadline, like any other window whose time is over.
--   A closed window stays as it is.
create function app.follow_loan_review_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  period app.loan_review_periods;
begin
  select * into period from app.loan_review_periods where loan_id = new.id for update;

  if new.status = 'ended' then
    if period.loan_id is null then
      insert into app.loan_review_periods (
        loan_id, borrower_user_id, lender_user_id, basis, opened_at, due_at
      ) values (
        new.id, new.borrower_user_id, new.responsible_lender_id, new.end_reason,
        new.ended_at, new.ended_at + app.loan_review_window()
      );
    elsif period.status = 'paused' then
      update app.loan_review_periods
      set status = 'open',
        borrower_user_id = new.borrower_user_id,
        lender_user_id = new.responsible_lender_id,
        basis = new.end_reason,
        opened_at = new.ended_at,
        due_at = new.ended_at + app.loan_review_window()
      where loan_id = new.id;

      update app.loan_reviews as review
      set status = 'lapsed', updated_at = new.ended_at
      where review.loan_id = new.id
        and review.status = 'hidden'
        and not app.loan_review_fits(review);
    end if;
  elsif period.status = 'open' and new.status_changed_at < period.due_at then
    update app.loan_review_periods
    set status = 'paused', due_at = null
    where loan_id = new.id;
  end if;

  return null;
end;
$$;

revoke execute on function app.follow_loan_review_period() from public;

create trigger loans_follow_review_period
  after update of status on app.loans
  for each row
  when ((new.status = 'ended') <> (old.status = 'ended'))
  execute function app.follow_loan_review_period();
