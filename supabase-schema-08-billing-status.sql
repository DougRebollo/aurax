-- Passo 8 do banco de dados do AuraX — rodar DEPOIS do supabase-schema-07-team-limit.sql.
-- Status de pagamento da conta (Stripe) e bloqueio de sessões novas até a
-- assinatura ser confirmada pelo webhook — nunca só pelo retorno do checkout
-- no navegador (a aba pode fechar/cair antes de confirmar de verdade).
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.

-- Todas as contas que já existem hoje (você e qualquer time/teste já criado)
-- nascem como 'ativa' — ninguém que já está usando o AuraX perde acesso só
-- por causa dessa migração. Só cadastros NOVOS, a partir de agora, começam
-- em 'pendente_pagamento'.
alter table profiles add column account_status text not null default 'ativa'
  check (account_status in ('pendente_pagamento', 'ativa', 'bloqueada'));
alter table profiles alter column account_status set default 'pendente_pagamento';

alter table profiles add column stripe_customer_id text;
alter table profiles add column stripe_subscription_id text;

-- Só o "dono da conta" (quem não tem manager_id — o gestor que efetivamente
-- assina e paga) carrega um account_status que importa de verdade.
-- Funcionários herdam o status de quem os gerencia, já que não pagam
-- individualmente — se o gestor não pagou ou foi bloqueado, o time inteiro
-- fica sem poder gravar sessão nova.
create or replace function public.effective_account_status(uid uuid) returns text
language sql security definer set search_path = public as $$
  select coalesce(
    (select p2.account_status from profiles p1 join profiles p2 on p2.id = p1.manager_id where p1.id = uid),
    (select account_status from profiles where id = uid)
  );
$$;
grant execute on function public.effective_account_status(uuid) to authenticated;

-- O bloqueio de verdade: sem isso, o front-end esconder o botão de gravar
-- é só cosmético — dava pra chamar o Supabase direto e criar a sessão do
-- mesmo jeito.
drop policy if exists "Inserir as proprias sessoes" on sessions;
create policy "Inserir as proprias sessoes" on sessions
  for insert with check (
    auth.uid() = user_id
    and public.effective_account_status(auth.uid()) = 'ativa'
  );

-- Registro de eventos do Stripe já processados, pra reenvio de webhook
-- (retry automático do Stripe ou reenvio manual pelo dashboard) não aplicar
-- o mesmo efeito duas vezes. Só a Edge Function do webhook mexe aqui (usa a
-- service role key, que ignora RLS) — por isso não existe nenhuma policy
-- liberando acesso: ninguém logado pelo app consegue ler ou escrever nela.
create table if not exists stripe_webhook_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table stripe_webhook_events enable row level security;
