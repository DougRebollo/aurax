-- Passo 4 do banco de dados do AuraX — rodar DEPOIS do supabase-schema-03-team.sql.
-- Adiciona cargo e empresa ao perfil (opcional, preenchido no cadastro).
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.

alter table profiles add column cargo text;
alter table profiles add column empresa text;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role, email, cargo, empresa)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    'funcionario',
    new.email,
    new.raw_user_meta_data->>'cargo',
    new.raw_user_meta_data->>'empresa'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
