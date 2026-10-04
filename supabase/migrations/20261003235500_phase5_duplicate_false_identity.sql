-- Duplicate accounts and false identity (WP-55, PS-ADM-009–010).
--
-- Two accounts of one person are never merged. A platform steward who has
-- verified that two accounts belong to the same person, and that neither is
-- a way around a suspension, retires one of them as a duplicate of the
-- other: the retired account is closed in a controlled way (WP-53), and its
-- own objects can be moved to the continuing account. Its history (loans,
-- reviews, cases, events), friendships, memberships, roles and trust stay
-- with the account and context they arose in; nothing moves on its own.
--
-- A false identity changes no history either (PS-ADM-010). The finding is
-- recorded as an internal security signal, and the platform may link the
-- account to later accounts of the same person, so a repeated misuse or a
-- way around a suspension can be seen. A link never carries a social
-- profile, friendships or trust over to another account.
--
-- Both are internal records: written only by a steward (closed until
-- OD-0010 is decided), never shown to the accounts' users or their
-- counterparties, append-only, and kept when an account is deleted. How long
-- they are kept is not decided (OD-0002), so nothing here removes them.

-- PS-ADM-009–010: internal links between accounts.
-- - `duplicate`: `user_id` was retired as a verified duplicate of
--   `linked_user_id`, which continues. One account is retired once.
-- - `same_person`: the two accounts belong to the same person, for security
--   work only (a false identity, a way around a suspension). Stored once per
--   pair, the lower id first.
create table app.account_links (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('duplicate', 'same_person')),
  user_id uuid not null references app.users (id),
  linked_user_id uuid not null references app.users (id),
  -- What the steward verified. Never copied into events or logs.
  basis text not null
    check (basis = btrim(basis) and char_length(basis) between 1 and 2000),
  recorded_by_user_id uuid not null references app.users (id),
  recorded_at timestamptz not null,
  constraint account_links_two_accounts check (user_id <> linked_user_id),
  constraint account_links_pair_order check (
    kind <> 'same_person' or user_id < linked_user_id
  ),
  -- PS-USR-009: a steward never links their own account.
  constraint account_links_not_by_party check (
    recorded_by_user_id <> user_id and recorded_by_user_id <> linked_user_id
  )
);

comment on table app.account_links is
  'Internal links between accounts of the same person, for security and continuity only (PS-ADM-009–010).';

create unique index account_links_duplicate_once
  on app.account_links (user_id) where kind = 'duplicate';

create unique index account_links_same_person_once
  on app.account_links (user_id, linked_user_id) where kind = 'same_person';

create index account_links_linked_idx on app.account_links (linked_user_id);

create trigger account_links_immutable
  before update or delete on app.account_links
  for each row execute function app.reject_append_only_mutation();

create trigger account_links_no_truncate
  before truncate on app.account_links
  for each statement execute function app.reject_append_only_mutation();

-- A duplicate is retired into an account that continues as active, and is
-- itself under controlled closure by then (the domain starts the closure in
-- the same transaction). A suspended account is never retired as a
-- duplicate: that is a way around the suspension, not a duplicate.
create function app.guard_new_duplicate_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.users where id = new.user_id and status = 'closing'
  ) then
    raise exception 'account % is not under controlled closure', new.user_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_duplicate_link() from public;

create trigger account_links_duplicate_guard
  before insert on app.account_links
  for each row
  when (new.kind = 'duplicate')
  execute function app.guard_new_duplicate_link();

create trigger account_links_duplicate_active_accounts
  before insert on app.account_links
  for each row
  when (new.kind = 'duplicate')
  execute function app.require_active_accounts('linked_user_id');

-- PS-ADM-010: a finding that the account was created or used under a false
-- identity. It changes nothing by itself: stopping the account is the
-- ordinary suspension or controlled closure, and its history stays.
create table app.account_identity_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id),
  finding text not null check (finding in ('false_identity')),
  -- What the steward found. Never copied into events or logs.
  basis text not null
    check (basis = btrim(basis) and char_length(basis) between 1 and 2000),
  recorded_by_user_id uuid not null references app.users (id),
  recorded_at timestamptz not null,
  constraint account_identity_findings_once unique (user_id, finding),
  constraint account_identity_findings_not_by_party check (
    recorded_by_user_id <> user_id
  )
);

comment on table app.account_identity_findings is
  'Internal security findings about an account''s identity (PS-ADM-010).';

create trigger account_identity_findings_immutable
  before update or delete on app.account_identity_findings
  for each row execute function app.reject_append_only_mutation();

create trigger account_identity_findings_no_truncate
  before truncate on app.account_identity_findings
  for each statement execute function app.reject_append_only_mutation();

-- PS-ADM-009, PS-ADM-014: an object of a retired duplicate moved to the
-- account that continues, by a steward with the basis. Only the objects the
-- duplicate owns alone (or with the continuing account) move: a shared object
-- has other owners who decide who joins them. The continuing account joins
-- as an owner; the retired account leaves at once, or, while it is still
-- responsible for a loan of the object, once that loan is handed over or
-- ends. Publications in environments the continuing account is no member of
-- end, since memberships do not move.
create table app.account_object_transfers (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references app.account_links (id),
  -- No foreign key: the record stays when the object is deleted, as the
  -- append-only events keep its id.
  object_id uuid not null,
  from_user_id uuid not null references app.users (id),
  to_user_id uuid not null references app.users (id),
  -- What the steward verified. Never copied into events or logs.
  basis text not null
    check (basis = btrim(basis) and char_length(basis) between 1 and 2000),
  moved_by_user_id uuid not null references app.users (id),
  moved_at timestamptz not null,
  constraint account_object_transfers_once unique (link_id, object_id),
  constraint account_object_transfers_not_by_party check (
    moved_by_user_id <> from_user_id and moved_by_user_id <> to_user_id
  )
);

comment on table app.account_object_transfers is
  'Objects moved from a retired duplicate to the account that continues (PS-ADM-009, PS-ADM-014).';

create index account_object_transfers_object_idx
  on app.account_object_transfers (object_id);

-- The record of an intervention (PS-ADM-014) outlives the object: deleting
-- the object later removes its content (PS-OBJ-011), never who moved it, from
-- whom, to whom and on what basis. Nothing changes or removes a transfer.
create trigger account_object_transfers_immutable
  before update or delete on app.account_object_transfers
  for each row execute function app.reject_append_only_mutation();

create trigger account_object_transfers_no_truncate
  before truncate on app.account_object_transfers
  for each statement execute function app.reject_append_only_mutation();

-- A transfer follows its duplicate link, from the retired account under
-- closure, which still owns the object, to the continuing account, which
-- owns it by then and is active (the domain adds it as an owner first). No
-- one else owns the object.
create function app.guard_new_account_object_transfer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.account_links
    where id = new.link_id
      and kind = 'duplicate'
      and user_id = new.from_user_id
      and linked_user_id = new.to_user_id
  ) or not exists (
    select 1 from app.users where id = new.from_user_id and status = 'closing'
  ) or exists (
    select 1 from app.object_owners
    where object_id = new.object_id
      and user_id not in (new.from_user_id, new.to_user_id)
  ) or not exists (
    select 1 from app.object_owners
    where object_id = new.object_id and user_id = new.to_user_id
  ) then
    raise exception 'object % cannot move from % to %',
      new.object_id, new.from_user_id, new.to_user_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_new_account_object_transfer() from public;

create trigger account_object_transfers_guard
  before insert on app.account_object_transfers
  for each row execute function app.guard_new_account_object_transfer();

create trigger account_object_transfers_active_accounts
  before insert on app.account_object_transfers
  for each row execute function app.require_active_accounts('to_user_id');
