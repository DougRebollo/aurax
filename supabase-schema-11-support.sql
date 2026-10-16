-- Passo 11 do banco de dados do AuraX — canal de suporte (formulário no menu lateral).
-- Rodar DEPOIS do supabase-schema-10-ai-summary.sql.
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.
--
-- Cada mensagem enviada pelo formulário "Suporte" vira uma linha aqui. Quem
-- envia só enxerga as PRÓPRIAS mensagens (RLS); você lê todas pelo painel do
-- Supabase (Table Editor -> support_requests), que ignora o RLS.
-- O e-mail de aviso pra caixa da AuraX é enviado pela Edge Function
-- support-notify (ver supabase/functions/support-notify), depois do deploy.

create table if not exists support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  name text,
  category text not null check (category in ('duvida', 'problema', 'cobranca', 'sugestao')),
  message text not null check (char_length(message) between 5 and 4000),
  page text,
  user_agent text,
  status text not null default 'nova',
  created_at timestamptz not null default now()
);

alter table support_requests enable row level security;

drop policy if exists "support_insert_own" on support_requests;
create policy "support_insert_own" on support_requests
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "support_select_own" on support_requests;
create policy "support_select_own" on support_requests
  for select to authenticated
  using (auth.uid() = user_id);
