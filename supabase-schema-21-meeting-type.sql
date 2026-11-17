-- AuraX: tipo de reunião da sessão (Descoberta, Apresentação, Negociação, Follow-up, Interna, Venda geral).
-- Usado para a faixa ideal de tempo de fala nas dicas e no detalhe da sessão (meeting.js).
-- Rode no Supabase -> SQL Editor. Pode rodar de novo sem problema.
alter table public.sessions add column if not exists meeting_type text;

select column_name as coluna_criada from information_schema.columns
where table_schema = 'public' and table_name = 'sessions' and column_name = 'meeting_type';
