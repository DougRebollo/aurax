-- Passo 12 do banco de dados do AuraX — convites de time.
-- Rodar DEPOIS do supabase-schema-11-support.sql.
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.
--
-- Fluxo: o gestor digita o e-mail de alguém que ainda não tem conta -> vira um convite
-- "pendente" com um link. Quando a pessoa cria a conta (ou entra) por esse link, ou com
-- aquele mesmo e-mail, ela entra sozinha no time do gestor (função claim_team_invites).
-- O limite de 5 pessoas continua valendo: convites pendentes contam no limite.

create table if not exists team_invites (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  -- 64 caracteres aleatórios: é o "segredo" do link de convite
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  status text not null default 'pendente' check (status in ('pendente', 'aceito', 'cancelado')),
  accepted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Um convite pendente por e-mail e por gestor
create unique index if not exists team_invites_um_pendente
  on team_invites (manager_id, lower(email)) where status = 'pendente';

alter table team_invites enable row level security;

drop policy if exists "gestor ve os proprios convites" on team_invites;
create policy "gestor ve os proprios convites" on team_invites
  for select to authenticated using (manager_id = auth.uid());

drop policy if exists "gestor cria convites" on team_invites;
create policy "gestor cria convites" on team_invites
  for insert to authenticated
  with check (
    manager_id = auth.uid()
    and public.is_gestor(auth.uid())
    and status = 'pendente'
    and public.team_size(auth.uid())
        + (select count(*) from team_invites t where t.manager_id = auth.uid() and t.status = 'pendente') < 5
  );

drop policy if exists "gestor cancela convites" on team_invites;
create policy "gestor cancela convites" on team_invites
  for update to authenticated
  using (manager_id = auth.uid() and status = 'pendente')
  with check (manager_id = auth.uid() and status in ('pendente', 'cancelado'));

-- Dados mínimos de um convite para a tela de cadastro mostrar "convidado por Fulano"
-- (a pessoa ainda não está logada, por isso security definer + liberado pro anon).
create or replace function public.get_invite_info(p_token text)
returns table (manager_name text, email text)
language sql security definer set search_path = public stable as $$
  select p.name, i.email
  from team_invites i join profiles p on p.id = i.manager_id
  where i.token = p_token and i.status = 'pendente'
  limit 1;
$$;
grant execute on function public.get_invite_info(text) to anon, authenticated;

-- Entra no time do gestor que convidou (por token ou pelo e-mail da própria conta).
-- Retorna: ok | ja_tem_time | e_gestor | sem_convite | time_cheio | sem_login
create or replace function public.claim_team_invites(p_token text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof profiles%rowtype;
  inv team_invites%rowtype;
begin
  if uid is null then return 'sem_login'; end if;
  select * into prof from profiles where id = uid;
  if not found then return 'sem_convite'; end if;
  if prof.manager_id is not null then return 'ja_tem_time'; end if;
  if prof.role = 'gestor' then return 'e_gestor'; end if;

  select * into inv from team_invites
  where status = 'pendente'
    and ((p_token is not null and token = p_token) or lower(email) = lower(coalesce(prof.email, auth.jwt() ->> 'email')))
  order by (p_token is not null and token = p_token) desc, created_at
  limit 1;
  if not found then return 'sem_convite'; end if;

  if public.team_size(inv.manager_id) >= 5 then return 'time_cheio'; end if;

  update profiles set manager_id = inv.manager_id where id = uid;
  update team_invites set status = 'aceito', accepted_user_id = uid, accepted_at = now() where id = inv.id;
  return 'ok';
end;
$$;
grant execute on function public.claim_team_invites(text) to authenticated;
