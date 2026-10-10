-- A re-authentication gives the browser a new sign-in session (WP-12). Its
-- live chat device moves to that session; nothing else about the device
-- ever changes, and a revoked device never moves (ADR-0010 §5, §7).
create or replace function app.guard_chat_key_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stamp text := case tg_table_name
    when 'chat_account_keys' then 'replaced_at'
    else 'revoked_at'
  end;
begin
  if tg_table_name = 'chat_devices'
     and to_jsonb(old) ->> 'revoked_at' is null
     and to_jsonb(new) ->> 'revoked_at' is null
     and (to_jsonb(new) - 'session_id') = (to_jsonb(old) - 'session_id')
  then
    return new;
  end if;

  if to_jsonb(old) ->> stamp is not null
     or to_jsonb(new) ->> stamp is null
     or (to_jsonb(new) - stamp - 'revocation_signature')
        <> (to_jsonb(old) - stamp - 'revocation_signature')
  then
    raise exception '% rows are only ever retired once', tg_table_name
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.guard_chat_key_update() from public;
