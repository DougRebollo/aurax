-- Passo 13 do banco de dados do AuraX — mini pesquisa de teste (pesquisa.html).
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.
--
-- Qualquer pessoa com o link consegue ENVIAR uma resposta; ninguém consegue LER pelo site (não há policy de
-- select): você lê as respostas no painel do Supabase, em Table Editor -> survey_responses.

create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  survey text not null default 'teste-gestor-1',
  respondent text check (char_length(respondent) <= 120),
  q_nota_justa int check (q_nota_justa between 1 and 5),
  q_foco_util int check (q_foco_util between 1 and 5),
  q_girias_batem int check (q_girias_batem between 1 and 5),
  q_recomenda int check (q_recomenda between 0 and 10),
  q_aberta text check (char_length(q_aberta) <= 2000),
  user_agent text check (char_length(user_agent) <= 300)
);

alter table survey_responses enable row level security;

drop policy if exists "qualquer um envia resposta" on survey_responses;
create policy "qualquer um envia resposta" on survey_responses
  for insert to anon, authenticated with check (true);
