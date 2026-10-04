begin;

select plan(10);

-- WP-73: only the server's own role reaches the limits.
select ok(
  not has_function_privilege(
    role_name,
    'app.consume_rate_limit(text, text, integer, interval, timestamptz)',
    'EXECUTE'
  ),
  format('%s cannot use rate limits', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

select ok(
  not has_table_privilege('authenticated', 'app.rate_limit_key', 'SELECT'),
  'nobody but the server reads the hashing key'
);

-- Three uses per minute: the fourth waits a third of the window, and a
-- refused use does not make the wait longer.
select is(
  array[
    app.consume_rate_limit('pgtap', 'user:a', 3, interval '1 minute', '2026-10-04 12:00:00+00'),
    app.consume_rate_limit('pgtap', 'user:a', 3, interval '1 minute', '2026-10-04 12:00:00+00'),
    app.consume_rate_limit('pgtap', 'user:a', 3, interval '1 minute', '2026-10-04 12:00:00+00'),
    app.consume_rate_limit('pgtap', 'user:a', 3, interval '1 minute', '2026-10-04 12:00:00+00'),
    app.consume_rate_limit('pgtap', 'user:a', 3, interval '1 minute', '2026-10-04 12:00:05+00')
  ],
  array[null, null, null, interval '20 seconds', interval '15 seconds'],
  'a burst up to the limit, then a wait'
);

select is(
  app.consume_rate_limit('pgtap', 'user:b', 3, interval '1 minute', '2026-10-04 12:00:05+00'),
  null,
  'another subject has its own budget'
);

select is(
  app.consume_rate_limit('pgtap', 'user:a', 3, interval '1 minute', '2026-10-04 12:00:20+00'),
  null,
  'one use comes back per share of the window'
);

select is(
  (select count(*)::integer from app.rate_limits where rule = 'pgtap'),
  2,
  'one row per rule and subject'
);

select ok(
  not exists (
    select from app.rate_limits
    where rule = 'pgtap'
      and (subject_hash = convert_to('user:a', 'UTF8')
        or subject_hash = extensions.digest('user:a', 'sha256'))
  ),
  'the subject is stored only as a keyed hash'
);

-- A row whose whole budget is back limits nothing and is removed.
select app.consume_rate_limit('pgtap_other', 'user:c', 1, interval '1 minute', '2026-10-04 13:00:00+00');

select is(
  (select count(*)::integer from app.rate_limits where rule = 'pgtap'),
  0,
  'expired rows are removed'
);

select throws_ok(
  $$select app.consume_rate_limit('pgtap', 'user:a', 0, interval '1 minute', now())$$,
  'P0001',
  null,
  'a limit must allow something'
);

select * from finish();

rollback;
