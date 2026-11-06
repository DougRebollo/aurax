-- AuraX: aviso por e-mail para o dono da plataforma (novo cadastro e nova assinatura).
-- Pré-requisito: função notify-admin publicada (supabase/functions/notify-admin) com os segredos configurados.
-- Rode no Supabase -> SQL Editor. Pode rodar de novo sem problema.

create extension if not exists pg_net with schema extensions;

-- Registro dos avisos já enviados (cada aviso sai uma vez por pessoa e tipo)
create table if not exists public.admin_notifications (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  sent_at timestamptz not null default now(),
  primary key (profile_id, type)
);
alter table public.admin_notifications enable row level security;   -- só a service role escreve/lê

-- Chama a Edge Function. Nunca pode atrapalhar o cadastro: qualquer erro aqui é engolido.
create or replace function public.notify_admin_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform net.http_post(
      url := 'https://tpjdogzhwandxwpwafzz.supabase.co/functions/v1/notify-admin',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('type', tg_argv[0], 'id', new.id)
    );
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists trg_notify_signup on public.profiles;
create trigger trg_notify_signup after insert on public.profiles
  for each row execute function public.notify_admin_event('signup');

drop trigger if exists trg_notify_paid on public.profiles;
create trigger trg_notify_paid after update of account_status on public.profiles
  for each row
  when (old.account_status is distinct from new.account_status and new.account_status = 'ativa' and new.stripe_customer_id is not null)
  execute function public.notify_admin_event('paid');

select tgname as gatilho from pg_trigger where tgname in ('trg_notify_signup', 'trg_notify_paid');
