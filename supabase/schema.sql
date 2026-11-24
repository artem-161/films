-- Кино на вечер — схема базы Supabase.
-- Выполнить один раз: Supabase → SQL Editor → New query → вставить → Run.

create extension if not exists pgcrypto;

create table if not exists couples (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  created_at  timestamptz not null default now()
);

create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Все фильмы, с которыми пара когда-либо взаимодействовала (кэш данных Кинопоиска).
create table if not exists movies (
  couple_id   uuid not null references couples(id) on delete cascade,
  kp_id       integer not null,
  data        jsonb not null,
  manual      boolean not null default false,          -- добавлен вручную через поиск
  added_by    uuid references members(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (couple_id, kp_id)
);

create table if not exists votes (
  couple_id   uuid not null,
  kp_id       integer not null,
  member_id   uuid not null references members(id) on delete cascade,
  liked       boolean not null,
  created_at  timestamptz not null default now(),
  primary key (couple_id, kp_id, member_id),
  foreign key (couple_id, kp_id) references movies(couple_id, kp_id) on delete cascade
);

create table if not exists watched (
  couple_id   uuid not null,
  kp_id       integer not null,
  watched_at  timestamptz not null default now(),
  ratings     jsonb not null default '{}'::jsonb,       -- { member_id: 1..10 }
  primary key (couple_id, kp_id),
  foreign key (couple_id, kp_id) references movies(couple_id, kp_id) on delete cascade
);

create index if not exists votes_couple_idx   on votes(couple_id);
create index if not exists movies_couple_idx  on movies(couple_id);
create index if not exists members_couple_idx on members(couple_id);

-- Доступ: приложение личное, без логинов. Доступ к данным пары даёт знание её id/кода.
alter table couples enable row level security;
alter table members enable row level security;
alter table movies  enable row level security;
alter table votes   enable row level security;
alter table watched enable row level security;

do $$
declare t text;
begin
  foreach t in array array['couples','members','movies','votes','watched'] loop
    execute format('drop policy if exists "anon all" on %I', t);
    execute format('create policy "anon all" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Realtime: изменения сразу видны второму телефону.
alter table votes   replica identity full;
alter table watched replica identity full;
alter table movies  replica identity full;
alter table members replica identity full;

do $$
begin
  begin alter publication supabase_realtime add table votes;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table watched; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table movies;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table members; exception when duplicate_object then null; end;
end $$;

-- Права для публичного ключа (в новых проектах Supabase не выдаются автоматически).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on couples, members, movies, votes, watched to anon, authenticated;
