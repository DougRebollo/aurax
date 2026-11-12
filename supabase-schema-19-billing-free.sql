-- AuraX: separa "pagante de verdade" de "cortesia / teste" (cupom 100%, período grátis).
-- O webhook do Stripe marca billing_free = true quando a fatura paga é de R$ 0,00 e volta para false
-- quando entra uma fatura com valor. O painel admin usa isso para a meta de pagantes e a receita.
-- Rode no Supabase -> SQL Editor. Pode rodar de novo sem problema. Pré-requisito: schema-17 já rodado.

alter table public.profiles add column if not exists billing_free boolean not null default false;

drop function if exists public.admin_users();

create or replace function public.admin_users() returns table (
  id uuid, email text, name text, role text, tipo text, cargo text, empresa text, manager_email text,
  account_status text, has_stripe boolean, email_confirmed boolean,
  created_at timestamptz, last_sign_in_at timestamptz, sessions_count bigint, last_session_at timestamptz,
  first_session_at timestamptz, sessions_7d bigint, billing_free boolean
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
         coalesce(sc.n, 0), sc.last_at, sc.first_at, coalesce(sc.n7, 0), p.billing_free
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

select column_name as coluna_criada from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'billing_free';   -- deve listar billing_free
