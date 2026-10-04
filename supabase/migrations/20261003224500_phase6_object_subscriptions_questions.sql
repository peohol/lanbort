-- WP-63: object subscriptions and environment-specific object questions
-- (PS-OBJ-014–015).
--
-- A subscription is a user's wish to be told about an object. It gives no
-- access of its own: whether the subscriber still sees the object is decided
-- by the domain each time it is read or told about (PS-OBJ-014), so a
-- subscription simply goes quiet while that access is gone.
--
-- A question belongs to one publication of the object in one environment
-- (PS-OBJ-015). Questions are only shown through that publication while it
-- is active, so they never reach another environment, disappear with the
-- publication and do not come back with a later publication of the same
-- object. The rows are kept: losing the publication is not a reason to
-- delete what was asked.

create table app.object_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  object_id uuid not null references app.objects (id),
  created_at timestamptz not null default clock_timestamp(),
  -- Whether the object was available for new loans when it was last looked
  -- at, so the subscriber is told when it becomes available again. This is
  -- only the memory of the last look: actual availability is always derived.
  available boolean not null,
  available_checked_at timestamptz not null default clock_timestamp(),
  constraint object_subscriptions_key unique (user_id, object_id)
);

comment on table app.object_subscriptions is
  'A user''s wish to be told about an object (PS-OBJ-014). Never a reason to see it.';

create index object_subscriptions_object_idx
  on app.object_subscriptions (object_id);

create index object_subscriptions_user_idx
  on app.object_subscriptions (user_id, created_at desc, id desc);

-- Who subscribed to what never changes; only the last look does.
create trigger object_subscriptions_fixed
  before update of id, user_id, object_id, created_at on app.object_subscriptions
  for each row execute function app.reject_append_only_mutation();

create table app.object_questions (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references app.environment_publications (id),
  -- The publication's object and environment, for indexes and checks.
  object_id uuid not null references app.objects (id),
  environment_id uuid not null references app.environments (id),
  asked_by_user_id uuid not null references app.users (id),
  created_at timestamptz not null default clock_timestamp()
);

comment on table app.object_questions is
  'A question thread about an object in one environment, through one publication (PS-OBJ-015).';

create index object_questions_publication_idx
  on app.object_questions (publication_id, created_at desc, id desc);

create index object_questions_object_idx
  on app.object_questions (object_id);

-- The question itself is the first post; answers and discussion follow.
create table app.object_question_posts (
  id uuid primary key default gen_random_uuid(),
  -- Order within the thread. Deleted only with the object (PS-OBJ-011).
  position bigint generated always as identity unique,
  question_id uuid not null references app.object_questions (id) on delete cascade,
  author_user_id uuid not null references app.users (id),
  -- The author was a registered owner of the object when posting.
  by_owner boolean not null,
  body text not null check (
    body = btrim(body)
    and char_length(body) between 1 and 2000
    and body !~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  ),
  created_at timestamptz not null default clock_timestamp()
);

comment on table app.object_question_posts is
  'Posts in an object question thread. Never edited; the first one is the question.';

create index object_question_posts_question_idx
  on app.object_question_posts (question_id, position);

-- What was asked and answered is not rewritten.
create trigger object_questions_immutable
  before update on app.object_questions
  for each row execute function app.reject_append_only_mutation();

create trigger object_question_posts_immutable
  before update on app.object_question_posts
  for each row execute function app.reject_append_only_mutation();

-- A question is asked through an active publication, and a post is added
-- while its question's publication is still active. The domain decides who
-- may (they must find the object there now); this is the backstop for the
-- publication itself. The publication is locked for share, so taking it
-- down waits for a post being added, or the post sees that it is gone.
create function app.guard_new_object_question()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1
  from app.environment_publications
  where id = new.publication_id
    and status = 'active'
    and object_id = new.object_id
    and environment_id = new.environment_id
  for share;

  if not found then
    raise exception 'object question needs an active publication of object % in environment %',
      new.object_id, new.environment_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_object_question() from public;

create trigger object_questions_live_publication
  before insert on app.object_questions
  for each row execute function app.guard_new_object_question();

create function app.guard_new_object_question_post()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  question app.object_questions;
begin
  select * into question
  from app.object_questions
  where id = new.question_id;

  perform 1
  from app.environment_publications
  where id = question.publication_id
    and status = 'active'
  for share;

  if not found then
    raise exception 'object question % is not open for posts', new.question_id
      using errcode = 'restrict_violation';
  end if;

  if new.by_owner is distinct from exists (
    select 1 from app.object_owners
    where object_id = question.object_id and user_id = new.author_user_id
  ) then
    raise exception 'by_owner must say whether the author owns the object'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_object_question_post() from public;

create trigger object_question_posts_live_publication
  before insert on app.object_question_posts
  for each row execute function app.guard_new_object_question_post();
