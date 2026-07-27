-- Passo 3 do banco de dados do AuraX — rodar DEPOIS do supabase-schema-02-trigger.sql.
-- Adiciona o necessário para o gestor adicionar/remover funcionários do time
-- pelo próprio painel (sem precisar mexer direto no Supabase toda vez).
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.

-- 1) Guarda o e-mail no perfil, pra o gestor conseguir buscar por e-mail
--    (auth.users não é consultável direto pelo app).
alter table profiles add column email text;

-- Atualiza o gatilho de cadastro pra também salvar o e-mail.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    'funcionario',
    new.email
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 2) Função auxiliar (evita recursão nas políticas de segurança abaixo).
create function public.is_gestor(uid uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and role = 'gestor');
$$;

-- 3) Um gestor pode ver o nome/e-mail de qualquer perfil (só o básico, não
--    as sessões) — é o que permite buscar quem ainda não tem gestor.
create policy "Gestor busca perfis para vincular" on profiles
  for select using (public.is_gestor(auth.uid()));

-- 4) Um gestor pode "adicionar" (vincular a si) um perfil que ainda não tem
--    gestor, e "remover" (desvincular) alguém que já é seu liderado — nunca
--    tomar um liderado de outro gestor.
create policy "Gestor vincula ou desvincula liderados" on profiles
  for update using (
    public.is_gestor(auth.uid())
    and (manager_id is null or manager_id = auth.uid())
  )
  with check (
    manager_id is null or manager_id = auth.uid()
  );
