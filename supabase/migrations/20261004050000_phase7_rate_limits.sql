-- WP-73: rate limits against contact spam, scraping, mass invitations,
-- report flooding and attacks on sign-in. The server keeps them here, so
-- every instance shares one count and a limit holds across restarts.
--
-- Each rule is a generic cell rate: `limit` uses per `window`, with a burst
-- of at most `limit`. One row per rule and subject holds the time from which
-- the subject has its whole allowance back (`available_at`); a row in the
-- past means the same as no row and is removed. Subjects (an account, an
-- e-mail address, a client address) are never stored as such, only as a
-- keyed hash with a key that stays in the database.

create table app.rate_limit_key (
  singleton boolean primary key default true check (singleton),
  secret bytea not null default extensions.gen_random_bytes(32)
);

insert into app.rate_limit_key default values;

create table app.rate_limits (
  rule text not null check (rule ~ '^[a-z][a-z0-9_]*$'),
  subject_hash bytea not null,
  available_at timestamptz not null,
  primary key (rule, subject_hash)
);

create index rate_limits_available_at on app.rate_limits (available_at);

comment on table app.rate_limits is
  'Short-lived rate-limit state (WP-73). No subject in clear text; rows are removed once they no longer limit anything.';

-- Uses one unit of `rule` for `subject` at `at`. Returns null when allowed,
-- or how long to wait before the next use is allowed; a refused use is not
-- counted. Runs in its own short transaction, before the operation it
-- guards, so refused and failed operations count as well.
create function app.consume_rate_limit(
  rule text,
  subject text,
  rate_limit integer,
  rate_window interval,
  at timestamptz
)
returns interval
language plpgsql
set search_path = ''
as $$
declare
  hashed bytea;
  step interval;
  available timestamptz;
  next_available timestamptz;
begin
  if rate_limit < 1 or rate_window <= interval '0' then
    raise exception 'invalid rate limit % per %', rate_limit, rate_window;
  end if;

  hashed := extensions.hmac(
    convert_to(subject, 'UTF8'),
    (select key.secret from app.rate_limit_key as key),
    'sha256'
  );
  step := rate_window / rate_limit;

  insert into app.rate_limits as limits (rule, subject_hash, available_at)
  values (consume_rate_limit.rule, hashed, at)
  on conflict do nothing;

  select limits.available_at into available
  from app.rate_limits as limits
  where limits.rule = consume_rate_limit.rule
    and limits.subject_hash = hashed
  for update;

  next_available := greatest(coalesce(available, at), at) + step;

  if next_available - at > rate_window then
    return next_available - rate_window - at;
  end if;

  insert into app.rate_limits as limits (rule, subject_hash, available_at)
  values (consume_rate_limit.rule, hashed, next_available)
  on conflict on constraint rate_limits_pkey
    do update set available_at = excluded.available_at;

  -- Rows in the past limit nothing any more. Rows another use holds are
  -- left for later, so two uses never wait for each other here.
  delete from app.rate_limits as limits
  where (limits.rule, limits.subject_hash) in (
    select expired.rule, expired.subject_hash
    from app.rate_limits as expired
    where expired.available_at < at
    limit 100
    for update skip locked
  );

  return null;
end;
$$;

revoke execute on function
  app.consume_rate_limit(text, text, integer, interval, timestamptz)
  from public;
