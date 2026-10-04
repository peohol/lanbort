-- Phase 4 loan logistics when the parties are blocked (WP-44, PS-COM-007).
--
-- A block closes ordinary private chat between two people, but never the
-- loans they already have (PS-USR-007). While such a loan is in progress,
-- its two parties (the borrower and the responsible lender) get a narrow
-- channel of their own for short practical messages about the handover,
-- the return, times, places and the object. The channel is its own kind of
-- conversation, never ordinary chat: it gives no friendship, profile
-- contact or new loans, and it is only ever about this one loan.
--
-- The server opens and closes it; nobody else does:
-- - it opens when a block comes between the parties of a loan in progress,
--   and when a loan between blocked parties is in progress again (a
--   reopened return);
-- - it closes for good when the loan ends (`loan_ended`), when the
--   responsible lender changes so it no longer joins the loan's parties
--   (`parties_changed`), or as a safety measure against harassment or a
--   particular risk (`safety`). Who may take that measure is not decided
--   (OD-0020): until it is, only a dedicated process can, and nothing in
--   the product runs it.
-- Lifting the block does not close it: the loan still needs what it needed.
-- A channel closed as a safety measure keeps the loan from getting a new one
-- with the same parties, also after a new block. Any other closed channel
-- is history, and a new block on a loan in progress opens a new one.
--
-- The messages themselves are end-to-end encrypted on the private chat's
-- infrastructure (ADR-0010, WP-43); this table only says whether the
-- channel accepts them and between whom.

create table app.loan_logistics_channels (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references app.loans (id),
  borrower_user_id uuid not null references app.users (id),
  lender_user_id uuid not null references app.users (id),
  opened_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  close_reason text check (close_reason in ('loan_ended', 'parties_changed', 'safety')),
  constraint loan_logistics_channels_closed check ((closed_at is null) = (close_reason is null)),
  constraint loan_logistics_channels_two_parties check (borrower_user_id <> lender_user_id)
);

comment on table app.loan_logistics_channels is
  'Narrow loan logistics channels between the parties of a loan in progress who are blocked (PS-COM-007); opened and closed by the server only.';

-- At most one open channel per loan.
create unique index loan_logistics_channels_open_key
  on app.loan_logistics_channels (loan_id) where closed_at is null;

create index loan_logistics_channels_borrower_idx
  on app.loan_logistics_channels (borrower_user_id);

create index loan_logistics_channels_lender_idx
  on app.loan_logistics_channels (lender_user_id);

-- Whether the loan's current parties may have a logistics channel now: the
-- loan is in progress and they are blocked either way, and no channel
-- between them on this loan was closed as a safety measure.
create function app.loan_logistics_qualifies(loan app.loans)
returns boolean
language sql
stable
set search_path = ''
as $$
  select loan.status <> 'ended'
    and app.users_blocked(loan.borrower_user_id, loan.responsible_lender_id)
    and not exists (
      select 1 from app.loan_logistics_channels
      where loan_id = loan.id
        and borrower_user_id = loan.borrower_user_id
        and lender_user_id = loan.responsible_lender_id
        and close_reason = 'safety'
    );
$$;

revoke execute on function app.loan_logistics_qualifies(app.loans) from public;

-- A new channel joins the loan's current parties, while the loan qualifies
-- and has no open channel.
create function app.guard_new_loan_logistics_channel()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
begin
  select * into loan from app.loans where id = new.loan_id;

  if new.closed_at is not null
    or loan.borrower_user_id is distinct from new.borrower_user_id
    or loan.responsible_lender_id is distinct from new.lender_user_id
    or not app.loan_logistics_qualifies(loan)
  then
    raise exception 'loan % cannot have a logistics channel now', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_loan_logistics_channel() from public;

create trigger loan_logistics_channels_guard_insert
  before insert on app.loan_logistics_channels
  for each row execute function app.guard_new_loan_logistics_channel();

-- A channel only ever closes, once, for a reason that holds: the loan has
-- ended, or its parties are no longer the channel's. A safety closure needs
-- no more than its reason. Channels are never deleted.
create function app.guard_loan_logistics_channel_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
begin
  select * into loan from app.loans where id = old.loan_id;

  if old.closed_at is not null
    or new.closed_at is null
    or (to_jsonb(old) - array['closed_at', 'close_reason'])
      <> (to_jsonb(new) - array['closed_at', 'close_reason'])
    or (new.close_reason = 'loan_ended' and loan.status <> 'ended')
    or (new.close_reason = 'parties_changed'
      and loan.borrower_user_id = old.borrower_user_id
      and loan.responsible_lender_id = old.lender_user_id)
  then
    raise exception 'logistics channel % cannot change like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_loan_logistics_channel_update() from public;

create trigger loan_logistics_channels_guard_update
  before update on app.loan_logistics_channels
  for each row execute function app.guard_loan_logistics_channel_update();

create trigger loan_logistics_channels_no_delete
  before delete on app.loan_logistics_channels
  for each row execute function app.reject_append_only_mutation();

-- Opens a channel on each of the loans that qualifies and has none open.
create function app.open_loan_logistics(loan_ids uuid[], at timestamptz)
returns void
language sql
set search_path = ''
as $$
  insert into app.loan_logistics_channels (loan_id, borrower_user_id, lender_user_id, opened_at)
  select loan.id, loan.borrower_user_id, loan.responsible_lender_id, at
  from app.loans as loan
  where loan.id = any(loan_ids)
    and app.loan_logistics_qualifies(loan)
    and not exists (
      select 1 from app.loan_logistics_channels
      where loan_id = loan.id and closed_at is null
    );
$$;

revoke execute on function app.open_loan_logistics(uuid[], timestamptz) from public;

-- A block between the parties of loans in progress opens their channels, in
-- the block's own transaction.
create function app.open_loan_logistics_after_block()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.open_loan_logistics(
    array(
      select id from app.loans
      where status <> 'ended'
        and (borrower_user_id, responsible_lender_id) in (
          (new.blocker_id, new.blocked_id), (new.blocked_id, new.blocker_id)
        )
    ),
    new.created_at
  );

  return null;
end;
$$;

revoke execute on function app.open_loan_logistics_after_block() from public;

create trigger user_blocks_open_loan_logistics
  after insert on app.user_blocks
  for each row execute function app.open_loan_logistics_after_block();

-- When a loan ends or its responsible lender changes, its open channel
-- closes in the same transaction; a loan between blocked parties that is in
-- progress again (a reopened return), or now has blocked parties, gets one.
create function app.follow_loan_with_logistics()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  at timestamptz := case
    when old.status is distinct from new.status then new.status_changed_at
    else clock_timestamp()
  end;
begin
  update app.loan_logistics_channels
  set closed_at = at,
    close_reason = case when new.status = 'ended' then 'loan_ended' else 'parties_changed' end
  where loan_id = new.id
    and closed_at is null
    and (new.status = 'ended'
      or borrower_user_id <> new.borrower_user_id
      or lender_user_id <> new.responsible_lender_id);

  perform app.open_loan_logistics(array[new.id], at);

  return null;
end;
$$;

revoke execute on function app.follow_loan_with_logistics() from public;

create trigger loans_follow_logistics
  after update of status, responsible_lender_id on app.loans
  for each row
  when (old.status is distinct from new.status
    or old.responsible_lender_id is distinct from new.responsible_lender_id)
  execute function app.follow_loan_with_logistics();
