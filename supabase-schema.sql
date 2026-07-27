-- Esquema do banco de dados do AuraX (Supabase / Postgres)
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.

-- Perfis de usuário (ligados ao login do Supabase Auth)
create table profiles (
  id uuid references auth.users(id) primary key,
  name text not null,
  role text not null check (role in ('gestor', 'funcionario')),
  manager_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- Sessões do AuraX (o que hoje fica salvo no localStorage do navegador)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  date timestamptz not null default now(),
  duration numeric,
  client_name text,
  focused numeric,
  tired numeric,
  motivated numeric,
  wpm integer,
  pauses integer,
  keyword_counts jsonb,
  slang_counts jsonb,
  filler_counts jsonb,
  objections jsonb,
  dynamics jsonb,
  tips jsonb,
  transcript jsonb,
  notes text,
  created_at timestamptz default now()
);

-- Row Level Security: cada pessoa só enxerga o que é seu, e o gestor
-- também enxerga o que é dos seus liderados (via manager_id).
alter table profiles enable row level security;
alter table sessions enable row level security;

create policy "Ver o proprio perfil" on profiles
  for select using (auth.uid() = id);

create policy "Gestor ve perfil dos liderados" on profiles
  for select using (manager_id = auth.uid());

create policy "Ver as proprias sessoes" on sessions
  for select using (auth.uid() = user_id);

create policy "Gestor ve sessoes dos liderados" on sessions
  for select using (
    user_id in (select id from profiles where manager_id = auth.uid())
  );

create policy "Inserir as proprias sessoes" on sessions
  for insert with check (auth.uid() = user_id);

create policy "Editar as proprias sessoes" on sessions
  for update using (auth.uid() = user_id);

create policy "Excluir as proprias sessoes" on sessions
  for delete using (auth.uid() = user_id);
