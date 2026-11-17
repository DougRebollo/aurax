-- AuraX: correção de segurança das permissões de cadastro (profiles).
-- Problemas corrigidos:
--   1) Qualquer usuário conseguia alterar QUALQUER campo do próprio cadastro (ex.: account_status = 'ativa' sem pagar).
--   2) Qualquer "gestor" (cadastro gratuito) via nome/e-mail de todos e conseguia puxar para o time dele
--      contas sem gestor, passando a ler as sessões delas, e alterar o status de pagamento dessas contas.
-- Depois desta migração:
--   - Status de pagamento, cupom (billing_free), dados do Stripe e e-mail só mudam pelo servidor (webhook / service role).
--   - O tipo de conta (gestor / individual) só muda antes do primeiro pagamento.
--   - Entrar num time só por convite (claim_team_invites): conta já paga só pelo link do convite;
--     sair do time só pelo gestor (remove_team_member).
--   - Gestor não lista mais os cadastros de outras pessoas.
-- Rode no Supabase -> SQL Editor. Pode rodar de novo sem problema. Pré-requisito: schemas 12 e 19 já rodados.

alter table public.profiles add column if not exists billing_free boolean not null default false;

-- 1) Fecha as duas regras do gestor que abriam a base inteira
drop policy if exists "Gestor busca perfis para vincular" on public.profiles;
drop policy if exists "Gestor vincula ou desvincula liderados" on public.profiles;

-- 2) Trava os campos sensíveis em qualquer alteração feita pelo app (usuário logado)
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;   -- servidor (service role), SQL Editor e gatilhos internos seguem livres
  end if;
  if new.id is distinct from old.id
     or new.account_status is distinct from old.account_status
     or new.billing_free is distinct from old.billing_free
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.email is distinct from old.email then
    raise exception 'Campo protegido: só o servidor pode alterar.' using errcode = '42501';
  end if;
  if new.role is distinct from old.role
     and not (old.account_status = 'pendente_pagamento' and old.manager_id is null and new.role in ('gestor', 'funcionario')) then
    raise exception 'O tipo de conta não pode ser alterado depois da assinatura.' using errcode = '42501';
  end if;
  if new.manager_id is distinct from old.manager_id
     and coalesce(current_setting('aurax.team_change', true), '') <> '1' then
    raise exception 'Entrar ou sair de um time só por convite ou pelo gestor.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile_columns on public.profiles;
create trigger trg_protect_profile_columns before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- 3) Aceitar convite: mesma lógica de antes + libera a troca de time só dentro desta função.
--    O e-mail usado agora é o do login (não o do cadastro, que o usuário não altera mais de qualquer forma).
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
    and ((p_token is not null and token = p_token) or lower(email) = lower(coalesce(auth.jwt() ->> 'email', prof.email)))
  order by (p_token is not null and token = p_token) desc, created_at
  limit 1;
  if not found then return 'sem_convite'; end if;
  -- Conta que já paga o próprio plano só entra num time clicando no link do convite (consentimento explícito);
  -- pelo e-mail sozinho entram apenas contas novas, ainda sem pagamento.
  if (p_token is null or inv.token <> p_token) and prof.account_status <> 'pendente_pagamento' then
    return 'sem_convite';
  end if;

  if public.team_size(inv.manager_id) >= 5 then return 'time_cheio'; end if;

  perform set_config('aurax.team_change', '1', true);
  update profiles set manager_id = inv.manager_id where id = uid;
  update team_invites set status = 'aceito', accepted_user_id = uid, accepted_at = now() where id = inv.id;
  return 'ok';
end;
$$;
grant execute on function public.claim_team_invites(text) to authenticated;

-- 4) Gestor remove alguém do próprio time
create or replace function public.remove_team_member(p_member uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_gestor(auth.uid()) then return false; end if;
  perform set_config('aurax.team_change', '1', true);
  update profiles set manager_id = null where id = p_member and manager_id = auth.uid();
  return found;
end $$;
revoke all on function public.remove_team_member(uuid) from public, anon;
grant execute on function public.remove_team_member(uuid) to authenticated;

-- Conferência: devem sobrar 3 regras em profiles (ver o próprio, gestor vê liderados, atualizar o próprio)
-- e o gatilho trg_protect_profile_columns.
select 'policy' as tipo, policyname as nome from pg_policies where schemaname = 'public' and tablename = 'profiles'
union all
select 'trigger', tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal
order by 1, 2;
