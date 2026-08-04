-- Passo 5 do banco de dados do AuraX — rodar DEPOIS do supabase-schema-04-profile-fields.sql.
-- Adiciona a coluna que guarda a nota de oratória (0-100) de cada sessão,
-- usada na tela de Insights pra montar a evolução entre sessões.
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.

alter table sessions add column oratoria_score integer;
