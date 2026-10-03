-- Phase 3 transfer of the responsible lender and minimum access (WP-35,
-- PS-LOAN-009, PS-LOAN-015, PS-LOAN-021).
--
-- A loan always has one responsible lender. The role moves only through a
-- transfer, an append-only row that says from whom to whom and why:
-- - `voluntary`: the responsible lender offers the role to a co-owner, and
--   it moves when that co-owner accepts it (nobody is made responsible for
--   someone else's loan against their will);
-- - `takeover`: once the responsible lender is established as really
--   unavailable for the loan, a co-owner takes the role over.
-- A co-owner who already owned the object when the loan was approved (the
-- circle) needs nothing more. A later co-owner also needs the borrower's
-- express consent, since a new person is drawn into the loan. Nobody who is
-- blocked with the borrower (either way) steps in, and a voluntary transfer
-- needs no block between the two co-owners. The agreement does not change:
-- the new lender steps into the lender's side as it stands, its statements,
-- proposals and versions included, and the role never moves back by itself.
--
-- When the responsible lender is established as unavailable, a co-owner of
-- the circle may instead only confirm that the object was physically
-- received back, without becoming responsible (the narrow receipt,
-- PS-LOAN-015). That statement is the lender side's receipt, marked as made
-- by a co-owner.
--
-- When a responsible lender counts as really unavailable is not decided
-- (OD-0016). Until it is, nothing in the product records it; the table below
-- is where the process that decides it will record it.

-- PS-LOAN-009/015: the responsible lender `lender_user_id` is established as
-- really unavailable for the loan. It is a fact about that lender on that
-- loan, kept as history; a later transfer makes it irrelevant.
create table app.loan_lender_unavailability (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references app.loans (id),
  lender_user_id uuid not null references app.users (id),
  established_at timestamptz not null,
  unique (loan_id, lender_user_id)
);

comment on table app.loan_lender_unavailability is
  'Responsible lenders established as really unavailable for a loan (PS-LOAN-009/015); written only by the process OD-0016 decides.';

create trigger loan_lender_unavailability_immutable
  before update or delete on app.loan_lender_unavailability
  for each row execute function app.reject_append_only_mutation();

-- Only the current responsible lender of a loan that has not ended.
create function app.guard_new_lender_unavailability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.loans
    where id = new.loan_id
      and status <> 'ended'
      and responsible_lender_id = new.lender_user_id
  ) then
    raise exception 'loan % has no such responsible lender', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_lender_unavailability() from public;

create trigger loan_lender_unavailability_guard
  before insert on app.loan_lender_unavailability
  for each row execute function app.guard_new_lender_unavailability();

-- Whether the loan's current responsible lender is established as
-- unavailable for it.
create function app.loan_lender_unavailable(loan app.loans)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from app.loan_lender_unavailability
    where loan_id = loan.id and lender_user_id = loan.responsible_lender_id
  );
$$;

revoke execute on function app.loan_lender_unavailable(app.loans) from public;

-- How `candidate` could step into the lender's side of the loan:
-- 'circle' when they owned the object at approval, 'later' when they became
-- a co-owner since (PS-LOAN-009). Null when they cannot at all: the loan
-- has ended, they are a party, no longer own the object, or are blocked
-- with the borrower.
create function app.loan_co_owner_standing(loan app.loans, candidate uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when loan.status = 'ended'
      or candidate in (loan.borrower_user_id, loan.responsible_lender_id)
      or loan.object_id is null
      or not exists (
        select 1 from app.object_owners
        where object_id = loan.object_id and user_id = candidate
      )
      or app.users_blocked(candidate, loan.borrower_user_id)
    then null
    when candidate = any(loan.owner_ids_at_approval) then 'circle'
    else 'later'
  end;
$$;

revoke execute on function app.loan_co_owner_standing(app.loans, uuid) from public;

-- PS-LOAN-015: `candidate` may confirm the receipt for the lender's side
-- without becoming responsible: a co-owner of the circle, while the
-- responsible lender is established as unavailable.
create function app.loan_receives_for_lender(loan app.loans, candidate uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(app.loan_co_owner_standing(loan, candidate) = 'circle', false)
    and app.loan_lender_unavailable(loan);
$$;

revoke execute on function app.loan_receives_for_lender(app.loans, uuid) from public;

-- A return statement or confirmation is made either by the party of its
-- side (`party`) or, for the lender's receipt only, by a co-owner in the
-- narrow receipt role (`co_owner`).
alter table app.loan_return_reports
  add column reported_as text not null default 'party'
    check (reported_as in ('party', 'co_owner')),
  add constraint loan_return_reports_co_owner_receipt check (
    reported_as = 'party' or (reporter_role = 'lender' and outcome = 'received')
  );

alter table app.loan_return_confirmations
  add column reported_as text not null default 'party'
    check (reported_as in ('party', 'co_owner')),
  add constraint loan_return_confirmations_co_owner_receipt check (
    reported_as = 'party' or (reporter_role = 'lender' and outcome = 'received')
  );

-- Whether `speaker` may speak for `role` of the loan as `reported_as`.
create function app.loan_speaker_allowed(
  loan app.loans,
  role text,
  speaker uuid,
  reported_as text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(case reported_as
    when 'party' then speaker = app.loan_party(loan, role)
    when 'co_owner' then role = 'lender' and app.loan_receives_for_lender(loan, speaker)
  end, false);
$$;

revoke execute on function app.loan_speaker_allowed(app.loans, text, uuid, text) from public;

-- As in WP-34, with «the party of its side» widened to whoever may speak for
-- it (app.loan_speaker_allowed).
create or replace function app.guard_new_return_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
begin
  select * into loan from app.loans where id = new.loan_id;

  if new.status <> 'pending'
    or not app.loan_speaker_allowed(loan, new.reporter_role, new.requested_by_user_id,
      new.reported_as)
    or new.agreement_version is distinct from (app.current_loan_agreement(new.loan_id)).version
    or not coalesce(app.loan_return_phase(loan.status), false)
  then
    raise exception 'loan % cannot get this return confirmation', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- As in WP-34; a waiting confirmation also lapses once whoever made it can no
-- longer speak for its side (the role moved on, or a co-owner lost the
-- narrow receipt role).
create or replace function app.guard_return_confirmation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resolution text[] := array['status', 'resolved_at'];
  loan app.loans;
begin
  select * into loan from app.loans where id = old.loan_id;

  if old.status <> 'pending'
    or (to_jsonb(old) - resolution) is distinct from (to_jsonb(new) - resolution)
    or (new.status = 'lapsed' and app.loan_return_phase(loan.status)
      and old.agreement_version = (app.current_loan_agreement(old.loan_id)).version
      and app.loan_speaker_allowed(loan, old.reporter_role, old.requested_by_user_id,
        old.reported_as))
  then
    raise exception 'return confirmation % cannot be resolved like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- As in WP-34, with whoever may speak for the side; a statement made from a
-- confirmation is also by the one who confirmed it, in the same capacity.
create or replace function app.guard_new_return_report()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loan app.loans;
  version integer := (app.current_loan_agreement(new.loan_id)).version;
  latest app.loan_return_reports;
begin
  select * into loan from app.loans where id = new.loan_id;
  select * into latest
  from app.loan_return_reports
  where loan_id = new.loan_id and agreement_version = version
  order by position desc
  limit 1;

  if not app.loan_speaker_allowed(loan, new.reporter_role, new.reported_by_user_id,
      new.reported_as)
    or new.agreement_version is distinct from version
    or not coalesce(
      app.loan_return_phase(loan.status)
      or (loan.status = 'ended' and loan.end_reason = 'returned'
        and new.outcome in ('still_has', 'not_received')),
      false
    )
    or (latest.reporter_role = new.reporter_role and latest.outcome = new.outcome)
    or (new.confirmation_id is not null and not exists (
      select 1 from app.loan_return_confirmations as confirmation
      where confirmation.id = new.confirmation_id
        and confirmation.status = 'applied'
        and confirmation.loan_id = new.loan_id
        and confirmation.agreement_version = new.agreement_version
        and confirmation.requested_by_user_id = new.reported_by_user_id
        and confirmation.reported_as = new.reported_as
        and confirmation.reporter_role = new.reporter_role
        and confirmation.outcome = new.outcome
    ))
  then
    raise exception 'loan % cannot get this return statement', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- PS-LOAN-009: a proposed or completed change of the responsible lender.
-- `position` orders transfers; the latest completed one names the lender.
create table app.loan_lender_transfers (
  id uuid primary key default gen_random_uuid(),
  position bigint generated always as identity unique,
  loan_id uuid not null references app.loans (id),
  kind text not null check (kind in ('voluntary', 'takeover')),
  from_user_id uuid not null references app.users (id),
  to_user_id uuid not null references app.users (id),
  -- The recipient became a co-owner after the loan was approved.
  borrower_consent_required boolean not null,
  proposed_at timestamptz not null,
  recipient_accepted_at timestamptz,
  borrower_consented_at timestamptz,
  status text not null default 'proposed'
    check (status in ('proposed', 'completed', 'declined', 'withdrawn', 'lapsed')),
  resolved_at timestamptz,
  resolved_by_user_id uuid references app.users (id),
  constraint loan_lender_transfers_shape check (
    from_user_id <> to_user_id
    and (status = 'proposed') = (resolved_at is null)
    and (status in ('proposed', 'lapsed')) = (resolved_by_user_id is null)
    -- Taking over is the recipient's own act.
    and (kind = 'voluntary' or recipient_accepted_at = proposed_at)
    and (borrower_consent_required or borrower_consented_at is null)
    and (status <> 'completed' or (
      recipient_accepted_at is not null
      and (not borrower_consent_required or borrower_consented_at is not null)
    ))
  )
);

comment on table app.loan_lender_transfers is
  'Changes of a loan''s responsible lender (PS-LOAN-009), append-only once resolved.';

create unique index loan_lender_transfers_one_open
  on app.loan_lender_transfers (loan_id)
  where status = 'proposed';

create index loan_lender_transfers_loan
  on app.loan_lender_transfers (loan_id, position);

create index loan_lender_transfers_recipient
  on app.loan_lender_transfers (to_user_id)
  where status = 'proposed';

create trigger loan_lender_transfers_kept
  before delete on app.loan_lender_transfers
  for each row execute function app.reject_append_only_mutation();

-- Who proposed the transfer: the lender who offers the role, or the
-- co-owner who takes it over.
create function app.lender_transfer_proposer(transfer app.loan_lender_transfers)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case transfer.kind
    when 'voluntary' then transfer.from_user_id
    else transfer.to_user_id
  end;
$$;

revoke execute on function app.lender_transfer_proposer(app.loan_lender_transfers)
  from public;

-- Whether the transfer can still complete: the loan has not ended, its
-- responsible lender is still the one it moves from, the recipient can still
-- step in as the same kind of co-owner, and nothing else stands in the way.
-- A voluntary offer needs no block between the two co-owners, and lapses
-- once its lender is established as unavailable (a takeover is then the way
-- on, also for its recipient); a takeover rests on that unavailability.
create function app.lender_transfer_possible(transfer app.loan_lender_transfers)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select loan.status <> 'ended'
      and loan.responsible_lender_id = transfer.from_user_id
      and app.loan_co_owner_standing(loan, transfer.to_user_id)
        = case when transfer.borrower_consent_required then 'later' else 'circle' end
      and case transfer.kind
        when 'voluntary' then not app.users_blocked(transfer.from_user_id, transfer.to_user_id)
          and not app.loan_lender_unavailable(loan)
        else app.loan_lender_unavailable(loan)
      end
    from app.loans as loan
    where loan.id = transfer.loan_id
  ), false);
$$;

revoke execute on function app.lender_transfer_possible(app.loan_lender_transfers)
  from public;

-- A transfer starts as the domain decided it could: proposed, or completed
-- at once when a co-owner of the circle takes over.
create function app.guard_new_lender_transfer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.lender_transfer_possible(new)
    or new.status not in ('proposed', 'completed')
    or (new.kind = 'voluntary' and (
      new.recipient_accepted_at is not null or new.borrower_consented_at is not null
    ))
    or (new.kind = 'takeover' and new.borrower_consented_at is not null)
    or (new.status = 'completed' and (
      new.resolved_at <> new.proposed_at or new.resolved_by_user_id <> new.to_user_id
    ))
  then
    raise exception 'loan % cannot get this transfer', new.loan_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_lender_transfer() from public;

create trigger loan_lender_transfers_guard
  before insert on app.loan_lender_transfers
  for each row execute function app.guard_new_lender_transfer();

-- An open transfer gets its answers and is resolved once:
-- - the recipient accepts a voluntary one, and the borrower consents when a
--   later co-owner steps in, in either order, each once;
-- - it completes once it has every answer it needs and can still complete;
-- - the recipient (voluntary) or the borrower (when asked) declines it;
-- - its proposer withdraws it;
-- - it lapses once it can no longer complete.
create function app.guard_lender_transfer_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  answer text[] := array[
    'recipient_accepted_at', 'borrower_consented_at', 'status', 'resolved_at',
    'resolved_by_user_id'
  ];
  borrower uuid;
begin
  select borrower_user_id into borrower from app.loans where id = old.loan_id;

  if old.status <> 'proposed'
    or (to_jsonb(old) - answer) is distinct from (to_jsonb(new) - answer)
    or (old.recipient_accepted_at is not null
      and new.recipient_accepted_at is distinct from old.recipient_accepted_at)
    or (old.borrower_consented_at is not null
      and new.borrower_consented_at is distinct from old.borrower_consented_at)
    or not coalesce(case new.status
      when 'proposed' then true
      when 'completed' then app.lender_transfer_possible(new)
      when 'declined' then
        (new.resolved_by_user_id = old.to_user_id and old.kind = 'voluntary')
        or (new.resolved_by_user_id = borrower and old.borrower_consent_required)
      when 'withdrawn' then new.resolved_by_user_id = app.lender_transfer_proposer(old)
      when 'lapsed' then not app.lender_transfer_possible(old)
      else false
    end, false)
  then
    raise exception 'transfer % cannot be answered like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_lender_transfer_update() from public;

create trigger loan_lender_transfers_answer
  before update on app.loan_lender_transfers
  for each row execute function app.guard_lender_transfer_update();

-- An open transfer lapses with the loan's ending.
create function app.lapse_lender_transfers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update app.loan_lender_transfers
  set status = 'lapsed', resolved_at = new.ended_at
  where loan_id = new.id and status = 'proposed';

  return null;
end;
$$;

revoke execute on function app.lapse_lender_transfers() from public;

create trigger loans_lapse_lender_transfers
  after update of status on app.loans
  for each row
  when (new.status = 'ended' and old.status <> 'ended')
  execute function app.lapse_lender_transfers();

-- An open transfer that can no longer complete lapses at `at`.
create function app.lapse_impossible_lender_transfers(transfer_ids uuid[], at timestamptz)
returns void
language sql
set search_path = ''
as $$
  update app.loan_lender_transfers as transfer
  set status = 'lapsed', resolved_at = at
  where transfer.id = any(transfer_ids)
    and transfer.status = 'proposed'
    and not app.lender_transfer_possible(transfer);
$$;

revoke execute on function app.lapse_impossible_lender_transfers(uuid[], timestamptz)
  from public;

-- Losing what a transfer rests on ends it for good: it does not come back
-- when the recipient owns the object again or the block is lifted.
create function app.lapse_lender_transfers_after_owner_left()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.lapse_impossible_lender_transfers(
    array(
      select transfer.id
      from app.loan_lender_transfers as transfer
      join app.loans as loan on loan.id = transfer.loan_id
      where loan.object_id = old.object_id and transfer.status = 'proposed'
    ),
    clock_timestamp()
  );

  return null;
end;
$$;

revoke execute on function app.lapse_lender_transfers_after_owner_left() from public;

create trigger object_owners_lapse_lender_transfers
  after delete on app.object_owners
  for each row execute function app.lapse_lender_transfers_after_owner_left();

create function app.lapse_lender_transfers_after_block()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.lapse_impossible_lender_transfers(
    array(
      select id from app.loan_lender_transfers
      where status = 'proposed'
        and to_user_id in (new.blocker_id, new.blocked_id)
    ),
    new.created_at
  );

  return null;
end;
$$;

revoke execute on function app.lapse_lender_transfers_after_block() from public;

create trigger user_blocks_lapse_lender_transfers
  after insert on app.user_blocks
  for each row execute function app.lapse_lender_transfers_after_block();

-- The circle check moves to the transfers: a later co-owner can become the
-- responsible lender with the borrower's consent. The approver was an owner
-- at approval (guard_new_loan).
alter table app.loans
  drop constraint loans_lender_was_owner,
  -- The receipt that ended the loan is checked at commit
  -- (ensure_loan_consistent): the responsible lender's, or a co-owner's
  -- narrow receipt.
  drop constraint loans_returned_by_lender;

-- As in WP-34, and the responsible lender changes alone, to the recipient
-- of the loan's latest completed transfer, while the loan has not ended.
create or replace function app.guard_loan_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ending text[] := array[
    'status', 'status_changed_at', 'end_reason', 'ended_at', 'ended_by_user_id'
  ];
begin
  if not (
    ((to_jsonb(old) - ending) = (to_jsonb(new) - ending) and (
      (old.status = 'reserved' and new.status in ('active', 'disputed', 'ended'))
      or (old.status = 'active' and new.status = 'disputed')
      or (old.status = 'disputed' and new.status = 'active')
      or (old.status = 'disputed' and new.status = 'ended'
        and new.end_reason = 'not_completed')
      or (app.loan_return_phase(old.status) and app.loan_return_phase(new.status)
        and old.status <> new.status)
      or (app.loan_return_phase(old.status) and new.status = 'ended'
        and new.end_reason = 'returned')
      or (old.status = 'ended' and old.end_reason = 'returned'
        and new.status = 'return_disputed')
    ))
    or (old.status = 'ended' and old.object_id is not null and new.object_id is null
      and (to_jsonb(old) - 'object_id') = (to_jsonb(new) - 'object_id'))
    or (old.status <> 'ended'
      and (to_jsonb(old) - 'responsible_lender_id') = (to_jsonb(new) - 'responsible_lender_id')
      and exists (
        select 1 from app.loan_lender_transfers
        where loan_id = old.id
          and status = 'completed'
          and from_user_id = old.responsible_lender_id
          and to_user_id = new.responsible_lender_id
          and position = (
            select max(position) from app.loan_lender_transfers
            where loan_id = old.id and status = 'completed'
          )
      ))
  ) then
    raise exception 'loan % cannot change like that', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

-- As in WP-34, and by commit:
-- - the responsible lender is the recipient of the latest completed
--   transfer, or the approver (agreement version 1) if there is none;
-- - a loan that ended as returned was ended by whoever made the receipt
--   that counts: the responsible lender, or a co-owner's narrow receipt.
create or replace function app.ensure_loan_consistent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed jsonb := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  loan app.loans;
  handover text;
  returned text;
begin
  select * into loan from app.loans
  where id = (changed ->> case tg_table_name when 'loans' then 'id' else 'loan_id' end)::uuid;
  handover := app.loan_handover_verdict(loan.id, coalesce(loan.ended_at, clock_timestamp()));
  returned := app.loan_return_verdict(loan.id);

  if (case
      when loan.status = 'ended' or returned in ('received', 'reopened') then
        exists (select 1 from app.loan_reservations where loan_id = loan.id)
      else not exists (
        select 1 from app.loan_reservations
        where loan_id = loan.id
          and object_id = loan.object_id
          and period = (app.current_loan_agreement(loan.id)).period
      )
    end)
    or loan.responsible_lender_id is distinct from coalesce(
      (
        select to_user_id from app.loan_lender_transfers
        where loan_id = loan.id and status = 'completed'
        order by position desc
        limit 1
      ),
      (select lender_user_id from app.loan_agreements where loan_id = loan.id and version = 1)
    )
    or exists (
      select 1 from app.loan_amendments as amendment
      where amendment.loan_id = loan.id
        and amendment.status = 'accepted'
        and not exists (
          select 1 from app.loan_agreements
          where loan_id = amendment.loan_id
            and version = amendment.base_version + 1
            and period = amendment.period
        )
    )
    or exists (
      select 1 from app.loan_return_confirmations as confirmation
      where confirmation.loan_id = loan.id
        and confirmation.status = 'applied'
        and not exists (
          select 1 from app.loan_return_reports
          where confirmation_id = confirmation.id
        )
    )
    or not coalesce(case loan.status
      when 'reserved' then handover in ('none', 'awaiting_answer', 'unanswered')
        and returned = 'none'
      when 'active' then handover = 'handed_over' and returned = 'none'
      when 'disputed' then handover = 'disputed' and returned = 'none'
      when 'awaiting_return' then handover = 'handed_over'
        and returned in ('returned', 'not_received')
      when 'late' then handover = 'handed_over' and returned = 'late'
      when 'return_disputed' then handover = 'handed_over'
        and returned in ('disputed', 'reopened')
      when 'ended' then case loan.end_reason
        when 'cancelled' then handover = 'none' and returned = 'none'
        when 'not_completed' then handover in ('not_handed_over', 'unanswered')
          and returned = 'none'
        when 'returned' then handover = 'handed_over' and returned = 'received'
          and loan.ended_by_user_id = (
            select reported_by_user_id from app.loan_return_reports
            where loan_id = loan.id
              and agreement_version = (app.current_loan_agreement(loan.id)).version
              and outcome = 'received'
            order by position desc
            limit 1
          )
      end
    end, false)
  then
    raise exception 'loan % does not hold what it agreed and its parties said', loan.id
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

create constraint trigger loan_lender_transfers_consistent
  after insert or update on app.loan_lender_transfers
  deferrable initially deferred
  for each row execute function app.ensure_loan_consistent();
