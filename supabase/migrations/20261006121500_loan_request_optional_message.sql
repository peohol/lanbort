-- PS-LOAN-004 (OD-0015, 6 October 2026): the message in a loan request is
-- optional. It is part of the structured request, not end-to-end encrypted,
-- seen only by the parties and never copied into events or logs. A request
-- without one has none (null), never an empty text; the check still holds
-- for every message there is.

alter table app.loan_requests alter column message drop not null;

comment on column app.loan_requests.message is
  'Optional, to the owners (PS-LOAN-004). Never copied into events or logs.';
