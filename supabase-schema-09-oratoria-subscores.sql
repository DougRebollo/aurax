-- Passo 9 do banco de dados do AuraX — rodar DEPOIS do supabase-schema-08-billing-status.sql.
-- Guarda o detalhamento da nota de oratória (ritmo, pausas, vícios, clareza,
-- projeção) de cada sessão — hoje só a nota final (oratoria_score) é salva,
-- então não dá pra reconstruir esse detalhamento de sessões já gravadas.
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.

alter table sessions add column oratoria_subscores jsonb;
