-- WP-40: the notification centre and notification preferences
-- (PS-COM-001–003).
--
-- A notification only draws a user's attention to something that happened
-- elsewhere. It is neither a chat message nor a case (PS-COM-001), and it
-- never carries the content of what happened: only a kind, an optional code
-- and the resource it leads to (UX-INT-010). Notifications are made from
-- committed domain events by an outbox consumer, or by the deadline job.
-- Preferences only decide how a user is told, never what happens in the
-- domain (PS-COM-002): nothing in the domain reads them.

create table app.notifications (
  id uuid primary key default gen_random_uuid(),
  -- Newest first, and «everything up to what I saw» for marking as read.
  position bigint generated always as identity unique,
  recipient_id uuid not null references app.users (id),
  -- Kinds, levels and target types are listed in @lanbort/contracts.
  kind text not null check (kind ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  level text not null check (level in ('required', 'action', 'information')),
  detail text check (detail ~ '^[a-z][a-z0-9_]{0,31}$'),
  target_type text not null check (target_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  target_id uuid not null,
  -- What made it: the event (or the deadline) and the target. A redelivered
  -- event or a repeated job run therefore makes it only once.
  source_key text not null check (source_key ~ '^[a-z0-9_.:/-]{1,200}$'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  -- Private to the recipient: never shown to anyone else, never a receipt.
  read_at timestamptz,
  constraint notifications_source_key unique (recipient_id, source_key)
);

comment on table app.notifications is
  'In-app notifications. Only read_at changes, once; the content is a code and a target.';

create index notifications_recipient_idx
  on app.notifications (recipient_id, position desc);

create index notifications_unread_idx
  on app.notifications (recipient_id, position)
  where read_at is null;

-- What a notification says never changes; it can only be read.
create trigger notifications_read_once
  before update on app.notifications
  for each row execute function app.guard_history_update('read_at');

-- A user's choice for one channel of one level. Without a row the pilot
-- standard applies. Required and action notifications are always in the
-- app (PS-COM-003), so only these pairs can be chosen at all.
create table app.notification_preferences (
  user_id uuid not null references app.users (id),
  level text not null,
  channel text not null,
  enabled boolean not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, level, channel),
  constraint notification_preferences_configurable check (
    (level, channel) in (
      ('action', 'email'),
      ('information', 'in_app'),
      ('information', 'email')
    )
  )
);

comment on table app.notification_preferences is
  'How a user wants to be told per level and channel. Never read by domain rules.';
