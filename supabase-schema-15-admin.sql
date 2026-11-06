-- AuraX: painel de administrador da plataforma (admin.html).
-- Só quem está na tabela platform_admins consegue ler a lista de cadastros — a checagem é feita aqui no banco,
-- não na página. Rode no Supabase -> SQL Editor. Pode rodar de novo sem problema.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
alter table public.platform_admins enable row level security;   -- sem policies: ninguém lê direto, só as funções abaixo

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.admin_users() returns table (
  id uuid, email text, name text, role text, tipo text, cargo text, empresa text, manager_email text,
  account_status text, has_stripe boolean, email_confirmed boolean,
  created_at timestamptz, last_sign_in_at timestamptz, sessions_count bigint, last_session_at timestamptz
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
         coalesce(sc.n, 0), sc.last_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join auth.users mu on mu.id = p.manager_id
  left join lateral (select count(*) as n, max(s.date) as last_at from public.sessions s where s.user_id = p.id) sc on true
  order by u.created_at desc;
end $$;

revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.admin_users() to authenticated;

-- Quem é administrador: ajuste os e-mails abaixo para o(s) e-mail(s) com que VOCÊ entra no AuraX.
insert into public.platform_admins (user_id)
select id from auth.users
where lower(email) in ('douglas@registrorural.com.br', 'douglas.rebollo.mh@gmail.com')
on conflict do nothing;

select u.email as administrador from public.platform_admins a join auth.users u on u.id = a.user_id;
