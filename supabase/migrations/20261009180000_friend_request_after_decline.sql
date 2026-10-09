-- PS-USR-012 (OD-0029): after a declined friend request, its sender cannot
-- send a new one until the recipient has sent a request themselves. The
-- recipient can ask at any time, and their request lifts the hold for good,
-- even if it is later withdrawn or declined. A withdrawn request, a removed
-- friendship and a request closed by a block hold nothing back, and placing
-- or lifting a block changes nothing about the hold.
--
-- The rule only reads the pair's relation history, so no new table is
-- needed: the hold applies while the pair's latest relation is a request
-- from the would-be sender that the other declined. The domain decides it
-- under the pair lock, in the transaction that inserts the request; the
-- trigger below keeps the same rule for any other writer.

-- The order a pair's relations were created in. `requested_at` comes from
-- the app's clock in milliseconds, so two quick relations can share it; the
-- position settles which came last.
alter table app.friendships
  add column position bigint generated always as identity;

create index friendships_pair_history_idx
  on app.friendships (user_low_id, user_high_id, requested_at desc, position desc);

-- Whether `requester` has to wait for `addressee` to ask first. Internal:
-- never returned to the one held back as a reason (PS-USR-012).
create function app.friend_request_held_back(requester uuid, addressee uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select latest.end_reason = 'declined' and latest.requester_id = requester
    from app.friendships as latest
    where latest.user_low_id = least(requester, addressee)
      and latest.user_high_id = greatest(requester, addressee)
    order by latest.requested_at desc, latest.position desc
    limit 1
  ), false);
$$;

revoke execute on function app.friend_request_held_back(uuid, uuid) from public;

create function app.guard_friend_request_after_decline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.friend_request_held_back(new.requester_id, new.addressee_id) then
    raise exception 'this friend request cannot be sent now'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_friend_request_after_decline() from public;

create trigger friendships_request_after_decline
  before insert on app.friendships
  for each row execute function app.guard_friend_request_after_decline();
