-- Every app function runs with an empty search_path and schema-qualified
-- names, so a caller's search_path can never change what it refers to. The
-- notification e-mail locks (WP-41) were the only ones without it.

alter function app.lock_pending_notification_emails(uuid) set search_path = '';
alter function app.notification_email_relevance_changed() set search_path = '';
