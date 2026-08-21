-- Passo 10 do banco de dados do AuraX — rodar DEPOIS do supabase-schema-09-oratoria-subscores.sql.
-- Guarda o resumo estruturado da call (objetivo / objeção / próximo passo),
-- gerado por IA generativa de verdade (Claude) a partir da transcrição já
-- salva — diferente do resto do app, que é regra escrita, não modelo.
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.

alter table sessions add column ai_summary jsonb;
