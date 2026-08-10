-- Passo 7 do banco de dados do AuraX — rodar DEPOIS do supabase-schema-06-role-choice.sql.
-- Guarda quantas perguntas abertas vs fechadas você fez em cada sessão
-- (feature de "perguntas abertas vs fechadas" no app).
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.

alter table sessions add column open_questions integer;
alter table sessions add column closed_questions integer;
