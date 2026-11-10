-- AuraX: convite de time por e-mail. Guarda quando o e-mail do convite foi enviado (para limitar reenvios
-- e mostrar "enviado em ..." ao gestor). Rode no Supabase -> SQL Editor. Pode rodar de novo sem problema.

alter table public.team_invites add column if not exists last_emailed_at timestamptz;

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'team_invites' and column_name = 'last_emailed_at';   -- deve listar last_emailed_at
