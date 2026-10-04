-- WP-41: e-mail as the pilot's external reserve channel (PS-COM-003,
-- «Kanalstandard for pilot»).
--
-- Each notification that should also go out by e-mail gets one delivery
-- row, made together with the notification. A scheduled worker sends it
-- through the e-mail adapter. The row holds no address and no content: the
-- address is the recipient's verified one when it is sent, and the message
-- is made from the notification's kind. Delivery never changes the
-- notification or anything in the domain (PS-COM-002).

create table app.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references app.notifications (id),
  -- Web push is not decided (OD-0004).
  channel text not null check (channel in ('email')),
  -- pending: waiting or being sent. sent: the provider accepted it.
  -- skipped: no longer worth sending (read, turned off, no address, too old).
  -- dead: the provider refused it, or it failed too often.
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'skipped', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  lease_token uuid,
  -- Why it was skipped, or the last failure. A machine code, never text.
  code text check (code ~ '^[a-z0-9_.:-]{1,64}$'),
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  constraint notification_deliveries_once unique (notification_id, channel),
  constraint notification_deliveries_finished check (
    (status = 'pending') = (finished_at is null)
  ),
  constraint notification_deliveries_explained check (
    status not in ('skipped', 'dead') or code is not null
  )
);

comment on table app.notification_deliveries is
  'External delivery of notifications (e-mail). No address and no content; never read by domain rules.';

create index notification_deliveries_due_idx
  on app.notification_deliveries (available_at, id)
  where status = 'pending';

-- What decides whether an e-mail is still worth sending: whether the
-- notification is read, the recipient's channel choices and their verified
-- address. The e-mail job locks a pending delivery and checks all three
-- again, under that lock, right before it sends. A change to any of them
-- also locks the recipient's pending deliveries before it is committed, so
-- it waits for a send already under way, and a send that has not started
-- yet sees the change. Once such a change is committed, no e-mail goes out
-- on what was there before.
create function app.lock_pending_notification_emails(p_recipient_id uuid)
returns void
language plpgsql
as $$
begin
  perform 1
  from app.notification_deliveries as delivery
  join app.notifications as notification
    on notification.id = delivery.notification_id
  where notification.recipient_id = p_recipient_id
    and delivery.status = 'pending'
  order by delivery.id
  for update of delivery;
end;
$$;

create function app.notification_email_relevance_changed()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'notifications' then
    perform 1
    from app.notification_deliveries
    where notification_id = new.id and status = 'pending'
    for update;
  else
    perform app.lock_pending_notification_emails(
      case when tg_op = 'DELETE' then old.user_id else new.user_id end
    );
  end if;

  return null;
end;
$$;

create trigger notifications_read_locks_emails
  after update of read_at on app.notifications
  for each row
  when (old.read_at is distinct from new.read_at)
  execute function app.notification_email_relevance_changed();

create trigger notification_preferences_lock_emails
  after insert or update on app.notification_preferences
  for each row execute function app.notification_email_relevance_changed();

create trigger verified_contacts_lock_emails
  after insert or update or delete on app.verified_contacts
  for each row execute function app.notification_email_relevance_changed();
