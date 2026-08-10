-- Passo 7 do banco de dados do AuraX — rodar DEPOIS do supabase-schema-06-role-choice.sql.
-- Trava o limite de 5 pessoas no time (+ o gestor) direto no banco — sem
-- isso, o limite só existiria na interface, e dava pra burlar chamando o
-- Supabase direto (mesmo jeito que qualquer requisição da página faz).
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.

create or replace function public.team_size(gestor uuid) returns integer
language sql security definer set search_path = public as $$
  select count(*)::integer from profiles where manager_id = gestor;
$$;

drop policy if exists "Gestor vincula ou desvincula liderados" on profiles;

create policy "Gestor vincula ou desvincula liderados" on profiles
  for update using (
    public.is_gestor(auth.uid())
    and (manager_id is null or manager_id = auth.uid())
  )
  with check (
    manager_id is null
    or (manager_id = auth.uid() and public.team_size(auth.uid()) < 5)
  );
