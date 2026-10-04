begin;

select plan(7);

select ok(
  not has_function_privilege(role_name, 'app.environment_hidden_since(uuid, bigint)', 'EXECUTE'),
  format('%s cannot call app.environment_hidden_since', role_name)
)
from unnest(array['anon', 'authenticated']) as role_name;

-- Anna (a1) founds an open environment (e1) and a hidden one (e2). Later the
-- open one becomes hidden, and the hidden one stays hidden.
insert into app.users (id, status, adult_confirmed_at)
values ('00000000-0000-4000-8000-0000000000a1', 'active', now());

insert into app.environments (id, type, name, created_by_user_id) values
  ('00000000-0000-4000-8000-0000000000e1', 'open', 'Borettslaget',
    '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e2', 'hidden', 'Klubben',
    '00000000-0000-4000-8000-0000000000a1');

create temporary table moments (name text primary key, position bigint not null);

insert into moments values ('while open', nextval('app.history_positions'));

insert into app.environment_type_periods (environment_id, type)
values ('00000000-0000-4000-8000-0000000000e1', 'hidden');

insert into moments values ('since hidden', nextval('app.history_positions'));

select is(
  app.environment_hidden_since('00000000-0000-4000-8000-0000000000e2',
    (select position from moments where name = 'while open')),
  true,
  'what happens in a hidden environment is in a hidden context'
);

select is(
  app.environment_hidden_since('00000000-0000-4000-8000-0000000000e1',
    (select position from moments where name = 'while open')),
  true,
  'an environment that became hidden later takes what happened before into the hidden context'
);

select is(
  app.environment_hidden_since('00000000-0000-4000-8000-0000000000e1',
    (select position from moments where name = 'since hidden')),
  true,
  'what happens after it became hidden is in the hidden context'
);

-- Another open environment that is never hidden.
insert into app.environments (id, type, name, created_by_user_id)
values ('00000000-0000-4000-8000-0000000000e3', 'open', 'Velforeningen',
  '00000000-0000-4000-8000-0000000000a1');
insert into app.environment_type_periods (environment_id, type)
values ('00000000-0000-4000-8000-0000000000e3', 'closed');

select is(
  app.environment_hidden_since('00000000-0000-4000-8000-0000000000e3',
    nextval('app.history_positions')),
  false,
  'an environment that was never hidden has no hidden context'
);

select is(
  app.environment_hidden_since('00000000-0000-4000-8000-0000000000e3',
    (select position from moments where name = 'while open')),
  true,
  'a position before the environment''s history counts as hidden: fail closed'
);

select * from finish();
rollback;
