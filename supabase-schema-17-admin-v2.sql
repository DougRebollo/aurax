-- AuraX: painel de admin v2 — acrescenta à lista de cadastros a data da 1ª sessão e as sessões dos últimos 7 dias
-- (usados pelos novos insights: tempo até gravar, usuários ativos na semana). Rode no Supabase -> SQL Editor.
-- Pode rodar de novo sem problema. Pré-requisito: schema-15 já rodado.

drop function if exists public.admin_users();

create or replace function public.admin_users() returns table (
  id uuid, email text, name text, role text, tipo text, cargo text, empresa text, manager_email text,
  account_status text, has_stripe boolean, email_confirmed boolean,
  created_at timestamptz, last_sign_in_at timestamptz, sessions_count bigint, last_session_at timestamptz,
  first_session_at timestamptz, sessions_7d bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select p.id, u.email::text, p.name, p.role,
         case when p.role = 'gestor' then 'Gestor' when p.manager_id is null then 'Individual' else 'Colaborador' end,
         p.cargo, p.empresa, mu.email::text,
         p.account_status, (p.stripe_customer_id is not null), (u.email_confirmed_at is not null),
         u.created_at, u.last_sign_in_at,
         coalesce(sc.n, 0), sc.last_at, sc.first_at, coalesce(sc.n7, 0)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join auth.users mu on mu.id = p.manager_id
  left join lateral (
    select count(*) as n, max(s.date) as last_at, min(s.date) as first_at,
           count(*) filter (where s.date > now() - interval '7 days') as n7
    from public.sessions s where s.user_id = p.id
  ) sc on true
  order by u.created_at desc;
end $$;

revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

select proname as funcao_atualizada from pg_proc where proname = 'admin_users';   -- deve listar admin_users
