-- A device that waits to be linked can be declined from an existing device
-- (ADR-0010 §5), instead of waiting until its code expires. The request is
-- kept until it expires, so the new device can tell it was declined; it is
-- answered once, either way.
alter table app.chat_link_requests
  add column declined_at timestamptz,
  add constraint chat_link_requests_one_answer
    check (declined_at is null or approved_at is null);

comment on column app.chat_link_requests.declined_at is
  'When an existing device declined the request; it can no longer be approved (ADR-0010 §5).';
